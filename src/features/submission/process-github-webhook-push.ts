import { EnrollmentStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { getCurrentDayNumber, IST } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { normalizeGithubUrl, validateGithubUrl } from "./validate-github-url";
import { submitDay } from "./submit-day";

export type GithubPushPayload = {
  repository?: {
    name?: string;
    full_name?: string;
    html_url?: string;
    owner?: { login?: string };
  };
  sender?: { login?: string };
  commits?: Array<{
    id?: string;
    timestamp?: string;
    author?: { username?: string | null };
    committer?: { username?: string | null };
  }>;
};

function repoWebUrl(payload: GithubPushPayload): string | null {
  const html = payload.repository?.html_url?.trim();
  if (html) return normalizeGithubUrl(html);
  const full = payload.repository?.full_name?.trim();
  if (full) return normalizeGithubUrl(`https://github.com/${full}`);
  const owner = payload.repository?.owner?.login?.trim();
  const name = payload.repository?.name?.trim();
  if (owner && name) return normalizeGithubUrl(`https://github.com/${owner}/${name}`);
  return null;
}

function collectLogins(payload: GithubPushPayload): string[] {
  const out = new Set<string>();
  const sender = payload.sender?.login?.trim();
  if (sender) out.add(sender);
  for (const c of payload.commits ?? []) {
    const a = c.author?.username?.trim();
    const b = c.committer?.username?.trim();
    if (a) out.add(a);
    if (b) out.add(b);
  }
  return [...out];
}

function istDateKey(d: Date): string {
  return formatInTimeZone(d, IST, "yyyy-MM-dd");
}

function isOnCurrentIstDay(isoTimestamp: string): boolean {
  const commitAt = new Date(isoTimestamp);
  if (Number.isNaN(commitAt.getTime())) return false;
  return istDateKey(commitAt) === istDateKey(new Date());
}

function commitTouchesLogin(
  commit: NonNullable<GithubPushPayload["commits"]>[number],
  profileLogin: string,
  senderLogin: string | undefined,
): boolean {
  const p = profileLogin.toLowerCase();
  const a = commit.author?.username?.trim().toLowerCase();
  const c = commit.committer?.username?.trim().toLowerCase();
  if (a && a === p) return true;
  if (c && c === p) return true;
  if (!a && !c && senderLogin?.trim().toLowerCase() === p) return true;
  return false;
}

function latestRelevantCommit(
  payload: GithubPushPayload,
  profileGithub: string,
): { timestamp: string } | null {
  const sender = payload.sender?.login?.trim();
  const todayCommits = (payload.commits ?? []).filter(
    (c) => c.timestamp && isOnCurrentIstDay(c.timestamp),
  );
  const relevant = todayCommits.filter((c) =>
    commitTouchesLogin(c, profileGithub, sender),
  );
  if (relevant.length === 0) return null;
  relevant.sort(
    (a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime(),
  );
  const top = relevant[0];
  return top?.timestamp ? { timestamp: top.timestamp } : null;
}

export type ProcessGithubWebhookPushResult =
  | { action: "created"; userId: string; submissionId?: string }
  | { action: "duplicate_day"; userId: string; dayNumber: number }
  | { action: "skipped"; reason: string; detail?: string }
  | { action: "error"; reason: string; message: string };

export async function processGithubWebhookPush(
  payload: GithubPushPayload,
): Promise<ProcessGithubWebhookPushResult> {
  const repoUrl = repoWebUrl(payload);
  if (!repoUrl) {
    logger.warn("github_webhook_skip", { reason: "missing_repo" });
    return { action: "skipped", reason: "missing_repo" };
  }

  const ownerLogin = payload.repository?.owner?.login?.trim();
  const repoName = payload.repository?.name?.trim();
  if (!ownerLogin || !repoName) {
    logger.warn("github_webhook_skip", { reason: "missing_owner_or_name" });
    return { action: "skipped", reason: "missing_owner_or_name" };
  }

  if (!payload.commits?.length) {
    logger.info("github_webhook_skip", { reason: "empty_commits" });
    return { action: "skipped", reason: "empty_commits" };
  }

  const logins = collectLogins(payload);
  if (logins.length === 0) {
    logger.info("github_webhook_skip", { reason: "no_github_logins" });
    return { action: "skipped", reason: "no_github_logins" };
  }

  let matched: { userId: string; githubUsername: string } | null = null;
  for (const login of logins) {
    const profile = await prisma.studentProfile.findFirst({
      where: {
        githubUsername: { equals: login, mode: "insensitive" },
      },
      select: { userId: true, githubUsername: true },
    });
    if (profile?.githubUsername) {
      matched = { userId: profile.userId, githubUsername: profile.githubUsername };
      break;
    }
  }

  if (!matched) {
    logger.info("github_webhook_skip", { reason: "no_profile_match", logins });
    return { action: "skipped", reason: "no_profile_match" };
  }

  const commitPick = latestRelevantCommit(payload, matched.githubUsername);
  if (!commitPick) {
    logger.info("github_webhook_skip", {
      reason: "no_commit_today_ist",
      userId: matched.userId,
      repo: repoUrl,
    });
    return { action: "skipped", reason: "no_commit_today_ist", detail: matched.userId };
  }

  const submittedAt = new Date(commitPick.timestamp);
  if (Number.isNaN(submittedAt.getTime())) {
    logger.warn("github_webhook_skip", { reason: "bad_commit_timestamp" });
    return { action: "skipped", reason: "bad_commit_timestamp" };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: matched.userId, status: { not: EnrollmentStatus.ABANDONED } },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });

  if (!enrollment) {
    logger.info("github_webhook_skip", { reason: "no_enrollment", userId: matched.userId });
    return { action: "skipped", reason: "no_enrollment", detail: matched.userId };
  }

  const dayNumber = getCurrentDayNumber(enrollment.startedAt);

  const existing = await prisma.submission.findUnique({
    where: {
      enrollmentId_dayNumber: { enrollmentId: enrollment.id, dayNumber },
    },
    select: { id: true },
  });

  if (existing) {
    logger.info("github_webhook_duplicate_day", {
      userId: matched.userId,
      dayNumber,
      enrollmentId: enrollment.id,
    });
    return { action: "duplicate_day", userId: matched.userId, dayNumber };
  }

  const gh = await validateGithubUrl(repoUrl, matched.userId, {
    enrollmentId: enrollment.id,
    dayNumber,
  });
  if (!gh.ok) {
    logger.warn("github_webhook_invalid_repo", {
      userId: matched.userId,
      repoUrl,
      validation: gh.reason,
    });
    return { action: "error", reason: gh.reason, message: gh.message };
  }

  const result = await submitDay({
    userId: matched.userId,
    githubUrl: repoUrl,
    linkedinUrl: "",
    dayNumber,
    submittedAt,
    skipLinkedinValidation: true,
  });

  if (!result.ok) {
    logger.warn("github_webhook_submit_failed", {
      userId: matched.userId,
      reason: result.reason,
      message: result.message,
    });
    return { action: "error", reason: result.reason, message: result.message };
  }

  logger.info("github_webhook_submission_created", {
    userId: matched.userId,
    submissionId: result.submissionId,
    dayNumber,
    repoUrl,
    owner: ownerLogin,
    repoName,
    submittedAt: submittedAt.toISOString(),
  });

  return {
    action: "created",
    userId: matched.userId,
    submissionId: result.submissionId,
  };
}
