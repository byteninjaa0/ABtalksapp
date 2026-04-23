import type { Prisma } from "@prisma/client";
import { EnrollmentStatus, SubmissionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentDayNumber } from "@/lib/date-utils";
import { normalizeGithubUrl, validateGithubUrl } from "./validate-github-url";
import { validateLinkedinUrl } from "./validate-linkedin-url";

export type SubmitDayOk = {
  ok: true;
  submissionId: string;
  newStreak: number;
  daysCompleted: number;
};

export type SubmitDayErr = {
  ok: false;
  reason: string;
  message: string;
};

export type SubmitDayResult = SubmitDayOk | SubmitDayErr;

/** One query inside the transaction — avoids P2028 when many per-day round-trips exceed DB tx timeout (e.g. Neon). */
async function computeOnTimeStreakEndingAt(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  endDay: number,
): Promise<number> {
  const rows = await tx.submission.findMany({
    where: { enrollmentId, dayNumber: { gte: 1, lte: endDay } },
    select: { dayNumber: true, status: true },
  });
  const statusByDay = new Map(rows.map((r) => [r.dayNumber, r.status]));
  let streak = 0;
  for (let d = endDay; d >= 1; d--) {
    const st = statusByDay.get(d);
    if (!st || st !== SubmissionStatus.ON_TIME) break;
    streak++;
  }
  return streak;
}

export async function submitDay(input: {
  userId: string;
  githubUrl: string;
  linkedinUrl: string;
  dayNumber: number;
}): Promise<SubmitDayResult> {
  const { userId, linkedinUrl, dayNumber } = input;
  const githubNormalized = normalizeGithubUrl(input.githubUrl.trim());

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      userId,
      status: { not: EnrollmentStatus.ABANDONED },
    },
    orderBy: { startedAt: "desc" },
  });

  if (!enrollment) {
    return { ok: false, reason: "no_enrollment", message: "No active enrollment" };
  }

  const task = await prisma.dailyTask.findUnique({
    where: {
      challengeId_dayNumber: {
        challengeId: enrollment.challengeId,
        dayNumber,
      },
    },
    select: { id: true },
  });

  if (!task) {
    return { ok: false, reason: "day_not_found", message: "Day not found" };
  }

  const currentDay = getCurrentDayNumber(enrollment.startedAt);
  if (dayNumber > currentDay) {
    return {
      ok: false,
      reason: "locked",
      message: "This day is not yet unlocked",
    };
  }

  const gh = await validateGithubUrl(githubNormalized, userId, {
    enrollmentId: enrollment.id,
    dayNumber,
  });
  if (!gh.ok) {
    return { ok: false, reason: gh.reason, message: gh.message };
  }

  const li = validateLinkedinUrl(linkedinUrl);
  if (!li.ok) {
    return { ok: false, reason: li.reason, message: li.message };
  }

  const newStatus =
    dayNumber === currentDay ? SubmissionStatus.ON_TIME : SubmissionStatus.LATE;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.upsert({
        where: {
          enrollmentId_dayNumber: {
            enrollmentId: enrollment.id,
            dayNumber,
          },
        },
        create: {
          userId,
          enrollmentId: enrollment.id,
          dailyTaskId: task.id,
          dayNumber,
          githubUrl: githubNormalized,
          linkedinUrl: linkedinUrl.trim(),
          status: newStatus,
          submittedAt: new Date(),
        },
        update: {
          githubUrl: githubNormalized,
          linkedinUrl: linkedinUrl.trim(),
          status: newStatus,
          submittedAt: new Date(),
        },
      });

      const daysCompleted = await tx.submission.count({
        where: { enrollmentId: enrollment.id },
      });

      const newStreak = await computeOnTimeStreakEndingAt(
        tx,
        enrollment.id,
        dayNumber,
      );

      const newLongest = Math.max(enrollment.longestStreak, newStreak);
      const completed = daysCompleted >= 60;

      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: {
          daysCompleted,
          currentStreak: newStreak,
          longestStreak: newLongest,
          lastSubmittedDay: dayNumber,
          ...(completed
            ? {
                status: EnrollmentStatus.COMPLETED,
                completedAt: new Date(),
              }
            : {}),
        },
      });

      if (completed) {
        await tx.studentProfile.updateMany({
          where: { userId },
          data: { isReadyForInterview: true },
        });
      }

      if (dayNumber >= 7) {
        await tx.referral.updateMany({
          where: { referredId: userId, rewardGiven: false },
          data: { rewardGiven: true },
        });
      }

      return {
        submissionId: submission.id,
        newStreak,
        daysCompleted,
      };
    });

    return { ok: true, ...result };
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code: string }).code)
        : "";
    if (code === "P2002") {
      return {
        ok: false,
        reason: "duplicate",
        message: "This URL has been submitted by another student",
      };
    }
    throw e;
  }
}
