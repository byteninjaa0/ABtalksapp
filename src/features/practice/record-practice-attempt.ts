import { PracticeAttemptStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  getTodayIstDateKey,
  istDateRangeToUtc,
} from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { awardPracticeSynergy } from "./award-practice-synergy";
import {
  PRACTICE_ATTEMPTS_DAILY_LIMIT,
  PRACTICE_SYNERGY,
  PRACTICE_SYNERGY_DAILY_CAP,
} from "./constants";

export type RecordPracticeAttemptInput = {
  userId: string;
  problemId: string;
  sourceCode: string;
  reported: { ordinal: number; passed: boolean }[];
  runtimeMs?: number;
};

export type RecordPracticeAttemptResult =
  | {
      ok: true;
      data: {
        attemptId: string;
        status: PracticeAttemptStatus;
        testsPassed: number;
        testsTotal: number;
        flagged: boolean;
        isFirstSolve: boolean;
        scoreAwarded: number;
        synergyAwarded: number;
        synergyCapped: boolean;
      };
    }
  | { ok: false; message: string };

function readsStdin(sourceCode: string): boolean {
  return sourceCode.includes("input(") || sourceCode.includes("sys.stdin");
}

export async function recordPracticeAttempt(
  input: RecordPracticeAttemptInput,
): Promise<RecordPracticeAttemptResult> {
  try {
    const problem = await prisma.practiceProblem.findUnique({
      where: { id: input.problemId },
      select: {
        id: true,
        maxScore: true,
        difficulty: true,
        isActive: true,
        testCases: { select: { ordinal: true, input: true } },
      },
    });

    if (!problem || !problem.isActive) {
      return { ok: false, message: "Problem not found." };
    }

    const dbOrdinals = problem.testCases.map((c) => c.ordinal).sort((a, b) => a - b);
    const reportedOrdinals = input.reported
      .map((r) => r.ordinal)
      .sort((a, b) => a - b);

    if (dbOrdinals.length !== reportedOrdinals.length) {
      return { ok: false, message: "Reported results do not match test cases." };
    }
    for (let i = 0; i < dbOrdinals.length; i++) {
      if (dbOrdinals[i] !== reportedOrdinals[i]) {
        return { ok: false, message: "Reported results do not match test cases." };
      }
    }
    const uniqueReported = new Set(reportedOrdinals);
    if (uniqueReported.size !== reportedOrdinals.length) {
      return { ok: false, message: "Reported results do not match test cases." };
    }

    const testsTotal = problem.testCases.length;
    const testsPassed = input.reported.filter((r) => r.passed).length;
    const status: PracticeAttemptStatus =
      testsPassed === testsTotal
        ? PracticeAttemptStatus.ACCEPTED
        : PracticeAttemptStatus.WRONG_ANSWER;

    const hasNonEmptyInput = problem.testCases.some((c) => c.input.length > 0);
    const flagged =
      status === PracticeAttemptStatus.ACCEPTED &&
      hasNonEmptyInput &&
      !readsStdin(input.sourceCode);
    const flagReason = flagged ? "accepted without reading stdin" : null;

    const todayKey = getTodayIstDateKey();
    const { startUtc, endExclusiveUtc } = istDateRangeToUtc(todayKey, todayKey);

    const attemptsToday = await prisma.practiceAttempt.count({
      where: {
        userId: input.userId,
        createdAt: {
          gte: startUtc,
          lt: endExclusiveUtc,
        },
      },
    });

    if (attemptsToday >= PRACTICE_ATTEMPTS_DAILY_LIMIT) {
      return { ok: false, message: "Daily attempt limit reached." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const attempt = await tx.practiceAttempt.create({
        data: {
          userId: input.userId,
          problemId: problem.id,
          status,
          sourceCode: input.sourceCode,
          testsPassed,
          testsTotal,
          runtimeMs: input.runtimeMs ?? null,
          flagged,
          flagReason,
        },
        select: { id: true },
      });

      let isFirstSolve = false;
      let scoreAwarded = 0;
      let synergyAwarded = 0;
      let synergyCapped = false;

      if (status === PracticeAttemptStatus.ACCEPTED) {
        const existing = await tx.practiceSolve.findUnique({
          where: {
            userId_problemId: {
              userId: input.userId,
              problemId: problem.id,
            },
          },
          select: { id: true },
        });

        if (!existing) {
          const creditedToday = await tx.practiceSolve.count({
            where: {
              userId: input.userId,
              synergyAwarded: { gt: 0 },
              solvedAt: {
                gte: startUtc,
                lt: endExclusiveUtc,
              },
            },
          });

          const underCap = creditedToday < PRACTICE_SYNERGY_DAILY_CAP;
          synergyAwarded = underCap
            ? PRACTICE_SYNERGY[problem.difficulty]
            : 0;
          synergyCapped = !underCap;
          scoreAwarded = problem.maxScore;
          isFirstSolve = true;

          await tx.practiceSolve.create({
            data: {
              userId: input.userId,
              problemId: problem.id,
              attemptId: attempt.id,
              score: problem.maxScore,
              synergyAwarded,
            },
          });

          if (synergyAwarded > 0) {
            await awardPracticeSynergy(tx, {
              userId: input.userId,
              points: synergyAwarded,
            });
          }
        }
      }

      return {
        attemptId: attempt.id,
        status,
        testsPassed,
        testsTotal,
        flagged,
        isFirstSolve,
        scoreAwarded,
        synergyAwarded,
        synergyCapped,
      };
    });

    return { ok: true, data: result };
  } catch (err) {
    logger.error("recordPracticeAttempt failed", {
      userId: input.userId,
      problemId: input.problemId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: "Could not record attempt. Try again." };
  }
}
