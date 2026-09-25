import type { Domain } from "@prisma/client";
import {
  isDatabricksAiEnabled,
  isDatabricksEnabled,
  isDsArchitectEnabled,
  isPowerBiEnabled,
  isProgramEnabled,
  isSnowflakeEnabled,
} from "@/lib/feature-flags";
import { prisma } from "@/lib/db";
import { isUserRegistered } from "@/features/hackathon/registration-status";
import { resolveProgramMemberForUser } from "@/lib/program-auth";
import { getProfileSummary } from "@/repositories/candidate";
import {
  listChallengeEnrollments,
  type ChallengeEnrollmentRow,
} from "@/repositories/learning";
import { getElapsedDayNumber } from "@/lib/date-utils";
import { isWithinRelaxationWindow } from "@/features/submission/submit-day";
import { listHubSubmissionTimes } from "@/repositories/progress";
import {
  getActivityHeatmap,
  type ActivityHeatmap,
} from "@/features/dashboard/get-activity-heatmap";
import type { ActivityStreak } from "@/features/dashboard/compute-activity-streak";

export type HubDataNoUser = {
  hasUser: false;
};

/**
 * What the learner can still do, which is not the same as `status`.
 *
 * `status` is the stored `ProgramEnrollment.status`, and nothing in the normal
 * challenge flow ever moves a 60-day challenge to COMPLETED — the only writer
 * is an admin action. So every participant stayed "ACTIVE" for ever and the
 * dashboard kept telling them to continue something that had finished.
 *
 * - `active`   there is still a day they are allowed to submit
 * - `completed` they submitted every day
 * - `ended`    the window and its grace period closed with days still missing;
 *              those days can never be submitted, so there is nothing to continue
 */
export type HubEnrollmentLifecycle = "active" | "completed" | "ended";

export type HubEnrollment = {
  id: string;
  domain: Domain;
  status: "ACTIVE" | "COMPLETED";
  challengeTitle: string;
  daysCompleted: number;
  currentStreak: number;
  totalDays: number;
  lifecycle: HubEnrollmentLifecycle;
};

/**
 * A missed day stays submittable for the relaxation window — today plus the
 * previous four — and is locked for ever after that. So the last day of the
 * challenge is still reachable until four days past it, and only then is every
 * day out of reach.
 *
 * Asking `isWithinRelaxationWindow` directly rather than hard-coding "+5"
 * keeps this tied to the one definition of the rule in `submit-day.ts`; if the
 * window ever changes length, this follows it.
 */
function challengeLifecycle(row: {
  daysCompleted: number;
  totalDays: number;
  startedAt: Date;
  challengeStartsAt: Date | null;
}): HubEnrollmentLifecycle {
  if (row.daysCompleted >= row.totalDays) return "completed";

  const elapsed = getElapsedDayNumber(
    { startedAt: row.startedAt },
    row.challengeStartsAt ? { startsAt: row.challengeStartsAt } : undefined,
  );

  // Still inside the challenge itself.
  if (elapsed <= row.totalDays) return "active";

  // Past the end, but the final days may still be backfillable.
  const lastDayStillReachable = isWithinRelaxationWindow(elapsed, row.totalDays);
  return lastDayStillReachable ? "active" : "ended";
}

export type HubData = {
  hasUser: true;
  profile: { fullName: string; referralCode: string } | null;
  enrollments: HubEnrollment[];
  joinedDomains: Domain[];
  abandonedDomains: Domain[];
  hasProgramMembership: boolean;
  hasDatabricksAccess: boolean;
  hasDsArchitectAccess: boolean;
  hasPowerBiAccess: boolean;
  hasSnowflakeAccess: boolean;
  hasDatabricksAiAccess: boolean;
  isHackathonRegistered: boolean;
  heatmap: ActivityHeatmap;
  streak: ActivityStreak;
};

/**
 * Row → card shape. Exported because the dashboard and the site search index
 * both build this list, and a second hand-written copy is how one of them ends
 * up still telling people to continue a finished challenge.
 */
export function toHubEnrollment(r: ChallengeEnrollmentRow): HubEnrollment {
  return {
    id: r.id,
    domain: r.domain,
    status: r.status as "ACTIVE" | "COMPLETED",
    challengeTitle: r.challengeTitle,
    daysCompleted: r.daysCompleted,
    currentStreak: r.currentStreak,
    totalDays: r.totalDays,
    lifecycle: challengeLifecycle(r),
  };
}

export async function getHubData(
  userId: string,
): Promise<HubData | HubDataNoUser> {
  const programEnabled = isProgramEnabled();

  const [
    user,
    rows,
    hasProgramMembership,
    isHackathonRegistered,
    heatmap,
    profile,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }),
    listChallengeEnrollments(userId),
    programEnabled
      ? resolveProgramMemberForUser(userId).then((m) => m !== null)
      : Promise.resolve(false),
    isUserRegistered(userId),
    listHubSubmissionTimes(userId).then(getActivityHeatmap),
    getProfileSummary(userId),
  ]);

  if (!user) {
    return { hasUser: false };
  }

  const joined = rows.filter(
    (r) => r.status === "ACTIVE" || r.status === "COMPLETED",
  );

  // ACTIVE first, then COMPLETED; startedAt asc within each group.
  const enrollments: HubEnrollment[] = [
    ...joined.filter((r) => r.status === "ACTIVE"),
    ...joined.filter((r) => r.status === "COMPLETED"),
  ].map(toHubEnrollment);

  const joinedDomains = [...new Set(joined.map((r) => r.domain))];
  const abandonedDomains = [
    ...new Set(rows.filter((r) => r.status === "ABANDONED").map((r) => r.domain)),
  ];

  return {
    hasUser: true,
    profile,
    enrollments,
    joinedDomains,
    abandonedDomains,
    hasProgramMembership,
    hasDatabricksAccess: isDatabricksEnabled(),
    hasDsArchitectAccess: isDsArchitectEnabled(),
    hasPowerBiAccess: isPowerBiEnabled(),
    hasSnowflakeAccess: isSnowflakeEnabled(),
    hasDatabricksAiAccess: isDatabricksAiEnabled(),
    isHackathonRegistered,
    heatmap,
    streak: heatmap.streak,
  };
}
