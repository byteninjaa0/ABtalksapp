import type { Prisma } from "@prisma/client";
import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type QuizAvailabilityReason =
  | "none_available"
  | "already_attempted"
  | "ready"
  | "not_yet_unlocked";

export type AvailableQuizPayload = {
  quiz: Prisma.QuizGetPayload<object> | null;
  reason: QuizAvailabilityReason;
  attempt: Prisma.QuizAttemptGetPayload<{ include: { quiz: true } }> | null;
};

/**
 * Only the **current** week’s quiz is offered (based on `daysCompleted`),
 * not older unattempted quizzes. Week W = floor(daysCompleted / 7), capped at 8,
 * once at least 7 days are completed.
 */
export async function getAvailableQuiz(
  userId: string,
  enrollmentId: string,
): Promise<AvailableQuizPayload> {
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      userId,
      status: { not: EnrollmentStatus.ABANDONED },
    },
    select: {
      challengeId: true,
      domain: true,
      daysCompleted: true,
    },
  });

  if (!enrollment) {
    return {
      quiz: null,
      reason: "none_available",
      attempt: null,
    };
  }

  const { challengeId, domain, daysCompleted } = enrollment;

  if (daysCompleted < 7) {
    return {
      quiz: null,
      reason: "not_yet_unlocked",
      attempt: null,
    };
  }

  const currentWeek = Math.min(Math.floor(daysCompleted / 7), 8);

  const quiz = await prisma.quiz.findFirst({
    where: {
      challengeId,
      domain,
      weekNumber: currentWeek,
    },
  });

  if (!quiz) {
    return {
      quiz: null,
      reason: "none_available",
      attempt: null,
    };
  }

  const attempt = await prisma.quizAttempt.findUnique({
    where: {
      userId_quizId: { userId, quizId: quiz.id },
    },
    include: { quiz: true },
  });

  if (attempt) {
    return {
      quiz: null,
      reason: "already_attempted",
      attempt,
    };
  }

  return {
    quiz,
    reason: "ready",
    attempt: null,
  };
}
