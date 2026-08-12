import { prisma } from "@/lib/db";
import { formatDateIST } from "@/lib/date-utils";

export type PracticeTestCaseView = {
  ordinal: number;
  isSample: boolean;
  input: string;
  expected: string;
  explanation: string | null;
};

export type PracticeProblemDetail = {
  id: string;
  slug: string;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraintsMd: string;
  starterCode: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  maxScore: number;
  testCases: PracticeTestCaseView[];
  latestAttempt: {
    status: string;
    testsPassed: number;
    testsTotal: number;
    createdAtLabel: string;
  } | null;
  solve: {
    score: number;
    synergyAwarded: number;
    solvedAtLabel: string;
  } | null;
};

export async function getPracticeProblem(
  slug: string,
  userId: string,
): Promise<PracticeProblemDetail | null> {
  const problem = await prisma.practiceProblem.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      statement: true,
      inputFormat: true,
      outputFormat: true,
      constraintsMd: true,
      starterCode: true,
      difficulty: true,
      maxScore: true,
      isActive: true,
      testCases: {
        orderBy: { ordinal: "asc" },
        select: {
          ordinal: true,
          isSample: true,
          input: true,
          expected: true,
          explanation: true,
        },
      },
    },
  });

  if (!problem || !problem.isActive) {
    return null;
  }

  const [latestAttempt, solve] = await Promise.all([
    prisma.practiceAttempt.findFirst({
      where: { userId, problemId: problem.id },
      orderBy: { createdAt: "desc" },
      select: {
        status: true,
        testsPassed: true,
        testsTotal: true,
        createdAt: true,
      },
    }),
    prisma.practiceSolve.findUnique({
      where: {
        userId_problemId: { userId, problemId: problem.id },
      },
      select: {
        score: true,
        synergyAwarded: true,
        solvedAt: true,
      },
    }),
  ]);

  return {
    id: problem.id,
    slug: problem.slug,
    title: problem.title,
    statement: problem.statement,
    inputFormat: problem.inputFormat,
    outputFormat: problem.outputFormat,
    constraintsMd: problem.constraintsMd,
    starterCode: problem.starterCode,
    difficulty: problem.difficulty,
    maxScore: problem.maxScore,
    testCases: problem.testCases,
    latestAttempt: latestAttempt
      ? {
          status: latestAttempt.status,
          testsPassed: latestAttempt.testsPassed,
          testsTotal: latestAttempt.testsTotal,
          createdAtLabel: formatDateIST(latestAttempt.createdAt),
        }
      : null,
    solve: solve
      ? {
          score: solve.score,
          synergyAwarded: solve.synergyAwarded,
          solvedAtLabel: formatDateIST(solve.solvedAt),
        }
      : null,
  };
}
