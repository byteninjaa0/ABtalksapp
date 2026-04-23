import { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type QuizHistoryRow = {
  attemptId: string;
  quizId: string;
  weekNumber: number;
  score: number;
  title: string;
};

export async function getQuizAttemptHistory(
  userId: string,
  enrollmentId: string,
): Promise<QuizHistoryRow[]> {
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      userId,
      status: { not: EnrollmentStatus.ABANDONED },
    },
    select: { challengeId: true, domain: true },
  });

  if (!enrollment) {
    return [];
  }

  const attempts = await prisma.quizAttempt.findMany({
    where: {
      userId,
      quiz: {
        challengeId: enrollment.challengeId,
        domain: enrollment.domain,
      },
    },
    include: {
      quiz: { select: { id: true, weekNumber: true, title: true } },
    },
    orderBy: { attemptedAt: "desc" },
  });

  return attempts.map((a) => ({
    attemptId: a.id,
    quizId: a.quiz.id,
    weekNumber: a.quiz.weekNumber,
    score: a.score,
    title: a.quiz.title,
  }));
}
