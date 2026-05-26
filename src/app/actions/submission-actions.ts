"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { getCurrentDayNumber } from "@/lib/date-utils";
import { normalizeGithubUrl } from "@/features/submission/validate-github-url";
import { validateSubmissionUrl } from "@/lib/validations/submission";
import {
  assertPastDaySubmittable,
  submitDay,
} from "@/features/submission/submit-day";
import { resolveChallengeEnrollment } from "@/features/enrollment/resolve-dashboard-enrollment";

const githubStepSchema = z.object({
  githubUrl: z.string().min(1, "GitHub URL is required"),
  dayNumber: z.coerce.number().int().min(1).max(60),
});

const linkedinStepSchema = z.object({
  githubUrl: z.string().min(1),
  linkedinUrl: z.string().min(1, "LinkedIn URL is required"),
  dayNumber: z.coerce.number().int().min(1).max(60),
});

const SUBMIT_RATE_LIMIT = { maxAttempts: 5, windowMs: 60 * 1000 } as const;

function checkSubmissionRateLimit(userId: string) {
  return checkRateLimit(
    `submit:${userId}`,
    SUBMIT_RATE_LIMIT.maxAttempts,
    SUBMIT_RATE_LIMIT.windowMs,
  );
}

export type GithubStepResult =
  | {
      ok: true;
      linkedinTemplate: string;
      githubUrl: string;
      dayNumber: number;
    }
  | { ok: false; message: string };

export async function submitGithubStepAction(
  formData: FormData,
): Promise<GithubStepResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const { allowed } = checkSubmissionRateLimit(session.user.id);
  if (!allowed) {
    return { ok: false, message: "Too many attempts. Wait a minute." };
  }

  const parsed = githubStepSchema.safeParse({
    githubUrl: formData.get("githubUrl"),
    dayNumber: formData.get("dayNumber"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const userId = session.user.id;
  const { githubUrl, dayNumber } = parsed.data;

  const enrollmentIdRaw = formData.get("enrollmentId");
  const enrollmentId =
    typeof enrollmentIdRaw === "string" && enrollmentIdRaw.trim() !== ""
      ? enrollmentIdRaw.trim()
      : undefined;

  const enrollment = await resolveChallengeEnrollment(userId, enrollmentId);

  if (!enrollment) {
    return { ok: false, message: "No active enrollment" };
  }

  const currentDay = getCurrentDayNumber(enrollment, enrollment.challenge);
  if (dayNumber > currentDay) {
    return { ok: false, message: "This day is not yet unlocked" };
  }

  const pastCheck = await assertPastDaySubmittable(
    enrollment,
    dayNumber,
    enrollment.challenge,
  );
  if (!pastCheck.ok) {
    return { ok: false, message: pastCheck.message };
  }

  const task = await prisma.dailyTask.findUnique({
    where: {
      challengeId_dayNumber: {
        challengeId: enrollment.challengeId,
        dayNumber,
      },
    },
    select: { linkedinTemplate: true },
  });

  if (!task) {
    return { ok: false, message: "Day not found" };
  }

  const ghCheck = await validateSubmissionUrl(
    githubUrl.trim(),
    enrollment.domain,
    userId,
  );
  if (!ghCheck.ok) {
    return { ok: false, message: ghCheck.message };
  }

  const normalized = normalizeGithubUrl(githubUrl.trim());
  const linkedinTemplate = task.linkedinTemplate.replaceAll(
    "{{github_link}}",
    normalized,
  );

  return {
    ok: true,
    linkedinTemplate,
    githubUrl: normalized,
    dayNumber,
  };
}

export async function submitLinkedinStepAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, reason: "auth", message: "You must be signed in." };
  }

  const { allowed } = checkSubmissionRateLimit(session.user.id);
  if (!allowed) {
    return {
      ok: false as const,
      reason: "rate_limit",
      message: "Too many attempts. Wait a minute.",
    };
  }

  const parsed = linkedinStepSchema.safeParse({
    githubUrl: formData.get("githubUrl"),
    linkedinUrl: formData.get("linkedinUrl"),
    dayNumber: formData.get("dayNumber"),
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      reason: "validation",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const enrollmentIdRaw = formData.get("enrollmentId");
  const enrollmentId =
    typeof enrollmentIdRaw === "string" && enrollmentIdRaw.trim() !== ""
      ? enrollmentIdRaw.trim()
      : undefined;

  const result = await submitDay({
    userId: session.user.id,
    githubUrl: parsed.data.githubUrl,
    linkedinUrl: parsed.data.linkedinUrl,
    dayNumber: parsed.data.dayNumber,
    enrollmentId,
  });

  if (result.ok) {
    updateTag("leaderboard");
  }

  return result;
}
