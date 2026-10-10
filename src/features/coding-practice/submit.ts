/**
 * Submit for coding practice.
 *
 * The server re-runs the learner's code against every test, hidden ones
 * included; a result computed in the browser is never trusted. Only an
 * accepted solution is saved. Every other outcome returns the results and
 * writes nothing. A solved problem can be submitted again.
 */
import "server-only";
import { judge } from "@/features/code-runner/judge0";
import type {
  CodeLanguageId,
  TestRunResult,
} from "@/features/code-runner/languages";
import { PRACTICE_QUESTIONS_PER_DAY } from "@/features/coding-practice/constants";
import {
  buildPracticeSource,
  getPracticeChallenge,
  getPracticeDayIndex,
  getPracticeQuestion,
  getPracticeTests,
} from "@/features/coding-practice/content";
import {
  isDayComplete,
  practiceDayState,
} from "@/features/coding-practice/progression";
import { isDayLockBypassEnabled } from "@/lib/feature-flags";
import {
  getPracticeProgress,
  recordAcceptedSubmission,
} from "@/repositories/coding-practice";

export type PracticeSubmitData =
  /**
   * Ran against every test and did not pass all of them. Nothing was written;
   * a solution saved earlier is untouched.
   */
  | { kind: "not_accepted"; result: TestRunResult; alreadySolved: boolean }
  /** Accepted. `saved` is false only if another request saved it first. */
  | {
      kind: "accepted";
      result: TestRunResult;
      saved: boolean;
      /** False when the problem was already solved and this replaces the saved code. */
      firstSolve: boolean;
      /** This submission is what completed the day. */
      dayComplete: boolean;
    };

export async function submitPracticeSolution(
  userId: string,
  input: {
    challenge: string;
    day: number;
    slot: number;
    language: CodeLanguageId;
    code: string;
  },
): Promise<
  { ok: true; data: PracticeSubmitData } | { ok: false; message: string }
> {
  const { challenge: slug, day, slot, language, code } = input;
  const challenge = getPracticeChallenge(slug);
  const question = getPracticeQuestion(slug, day, slot);
  const run = getPracticeTests(slug, day, slot);
  const source = buildPracticeSource(slug, day, slot, language, code);
  if (!challenge || !question || !run || !source) {
    return { ok: false, message: "Question not found." };
  }

  const progress = await getPracticeProgress(userId, slug);
  if (!progress) return { ok: false, message: "Start the challenge first." };

  const solved = new Set(progress.solvedActivityIds);
  const days = getPracticeDayIndex(slug).map((d) => ({
    day: d.day,
    activityIds: d.questions.map((q) => q.activityId),
  }));
  const state = practiceDayState({
    day,
    startedAt: progress.startedAt,
    solved,
    days,
    now: new Date(),
    bypassLocks: isDayLockBypassEnabled(),
  });
  if (state !== "OPEN" && state !== "COMPLETE") {
    return { ok: false, message: "This day is locked." };
  }
  // A solved problem can be submitted again: an accepted re-submission
  // replaces the saved code, a failed one changes nothing.
  const alreadySolved = solved.has(question.activityId);

  const result = await judge({
    language,
    code: source,
    tests: run.tests,
    timeLimitSec: run.timeLimitSec,
  });
  if (result.verdict === "unavailable") {
    return {
      ok: false,
      message:
        "Code execution is unavailable right now. Please try again in a minute.",
    };
  }
  if (result.verdict !== "accepted") {
    return { ok: true, data: { kind: "not_accepted", result, alreadySolved } };
  }

  const totalQuestions = challenge.totalDays * PRACTICE_QUESTIONS_PER_DAY;
  const { stored } = await recordAcceptedSubmission({
    enrollmentId: progress.enrollmentId,
    activityId: question.activityId,
    language,
    // The learner's code only. The hidden harness is never saved.
    code,
    passedCount: result.passedCount,
    total: result.total,
    completesChallenge: !alreadySolved && solved.size + 1 === totalQuestions,
  });

  solved.add(question.activityId);
  return {
    ok: true,
    data: {
      kind: "accepted",
      result,
      saved: stored,
      firstSolve: !alreadySolved,
      dayComplete: !alreadySolved && isDayComplete(day, solved, days),
    },
  };
}
