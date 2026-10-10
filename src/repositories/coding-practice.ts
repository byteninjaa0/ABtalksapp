/**
 * Coding practice: enrolment and solved state on the canonical tables.
 *
 * Question content is not here (see features/coding-practice/content). The
 * database holds only who started a challenge and which questions they solved.
 */
import "server-only";
import {
  AttemptLateness,
  AttemptStatus,
  CohortStatus,
  EnrollmentStatusV2,
  EvaluatorType,
  Prisma,
} from "@prisma/client";
import type { CodeLanguageId } from "@/features/code-runner/languages";
import { savedSolutionSchema } from "@/lib/validations/coding-practice";
import { getIstDateKey } from "@/lib/date-utils";
import { prisma, writeClient } from "@/lib/db";
import { cohortSlugFor } from "@/features/coding-practice/constants";

export type PracticeProgress = {
  enrollmentId: string;
  status: EnrollmentStatusV2;
  /** The unlock anchor: Day 1 is the UTC date of this instant. */
  startedAt: Date;
  solvedActivityIds: string[];
};

/** One query: the learner's enrolment and every question they have solved. */
export async function getPracticeProgress(
  userId: string,
  programSlug: string,
): Promise<PracticeProgress | null> {
  const row = await prisma.programEnrollment.findFirst({
    where: { userId, cohort: { slug: cohortSlugFor(programSlug) } },
    select: {
      id: true,
      status: true,
      startedAt: true,
      attempts: { where: { passed: true }, select: { activityId: true } },
    },
  });
  if (!row) return null;
  return {
    enrollmentId: row.id,
    status: row.status,
    startedAt: row.startedAt,
    solvedActivityIds: [...new Set(row.attempts.map((a) => a.activityId))],
  };
}

/**
 * Start the challenge. Idempotent: a second call never moves `startedAt`, so
 * clicking Start twice cannot reset the day clock.
 */
export async function createPracticeEnrollment(
  userId: string,
  programSlug: string,
): Promise<{ ok: true } | { ok: false; reason: "closed" }> {
  const cohort = await prisma.cohort.findUnique({
    where: { slug: cohortSlugFor(programSlug) },
    select: { id: true, status: true },
  });
  if (
    !cohort ||
    (cohort.status !== CohortStatus.ACTIVE &&
      cohort.status !== CohortStatus.ENROLLING)
  ) {
    return { ok: false, reason: "closed" };
  }

  const now = new Date();
  await writeClient().programEnrollment.upsert({
    where: { userId_cohortId: { userId, cohortId: cohort.id } },
    create: {
      userId,
      cohortId: cohort.id,
      status: EnrollmentStatusV2.ACTIVE,
      startedAt: now,
      enrolledAt: now,
    },
    update: {},
    select: { id: true },
  });
  return { ok: true };
}

export type SavedSolution = {
  language: CodeLanguageId;
  code: string;
  submittedAt: Date | null;
};

/** The learner's latest accepted solution for one question, if any. */
export async function getSavedSolution(
  enrollmentId: string,
  activityId: string,
): Promise<SavedSolution | null> {
  const row = await prisma.activityAttempt.findFirst({
    where: { enrollmentId, activityId, passed: true },
    orderBy: { attemptNumber: "desc" },
    select: { payload: true, submittedAt: true },
  });
  const parsed = savedSolutionSchema.safeParse(row?.payload);
  if (!row || !parsed.success) return null;
  return { ...parsed.data, submittedAt: row.submittedAt };
}

/**
 * Save an accepted solution. The ONLY write a submission ever makes.
 *
 * A problem can be submitted again after it is solved. Each accepted
 * submission is its own attempt row, so the dashboard heatmap and streak see
 * activity on the day it happened and earlier days keep theirs. The one
 * exception keeps the table small and the heatmap honest: a second accepted
 * submission for the same problem on the same IST day replaces that day's row
 * instead of adding another. So there is at most one row per problem per day,
 * and the latest row is the solution the learner sees.
 */
export async function recordAcceptedSubmission(input: {
  enrollmentId: string;
  activityId: string;
  language: CodeLanguageId;
  code: string;
  passedCount: number;
  total: number;
  /** True when this is the last unsolved question of the challenge. */
  completesChallenge: boolean;
}): Promise<{ stored: boolean }> {
  const now = new Date();
  const payload = { code: input.code, language: input.language };
  const detailJson = {
    language: input.language,
    passedCount: input.passedCount,
    total: input.total,
  };
  try {
    await writeClient().$transaction(async (tx) => {
      const latest = await tx.activityAttempt.findFirst({
        where: {
          enrollmentId: input.enrollmentId,
          activityId: input.activityId,
        },
        orderBy: { attemptNumber: "desc" },
        select: { id: true, attemptNumber: true, submittedAt: true },
      });

      if (
        latest?.submittedAt &&
        getIstDateKey(latest.submittedAt) === getIstDateKey(now)
      ) {
        await tx.activityAttempt.update({
          where: { id: latest.id },
          data: { payload, submittedAt: now },
          select: { id: true },
        });
        await tx.activityEvaluation.updateMany({
          where: { attemptId: latest.id, isAuthoritative: true },
          data: { detailJson },
        });
        return;
      }

      const attempt = await tx.activityAttempt.create({
        data: {
          enrollmentId: input.enrollmentId,
          activityId: input.activityId,
          attemptNumber: (latest?.attemptNumber ?? 0) + 1,
          status: AttemptStatus.EVALUATED,
          lateness: AttemptLateness.NOT_APPLICABLE,
          payload,
          passed: true,
          score: 100,
          pointsAwarded: 0,
          submittedAt: now,
        },
        select: { id: true },
      });
      await tx.activityEvaluation.create({
        data: {
          attemptId: attempt.id,
          evaluatorType: EvaluatorType.AUTO,
          passed: true,
          score: 100,
          maxScore: 100,
          isAuthoritative: true,
          detailJson,
        },
        select: { id: true },
      });
      if (input.completesChallenge) {
        await tx.programEnrollment.update({
          where: { id: input.enrollmentId },
          data: { status: EnrollmentStatusV2.COMPLETED, completedAt: now },
          select: { id: true },
        });
      }
    });
    return { stored: true };
  } catch (error) {
    // Two accepted submissions racing for the same attempt number: the other
    // one is saved, this one is not.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { stored: false };
    }
    throw error;
  }
}
