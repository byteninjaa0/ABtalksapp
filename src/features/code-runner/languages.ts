/**
 * Languages the code runner supports, and the result shapes it returns.
 *
 * Zero imports on purpose: the editor (a client component) and the runner (a
 * server module) both read this file.
 *
 * Judge0 language ids are instance-specific. These were verified on
 * https://ce.judge0.com on 2026-10-08. When JUDGE0_URL changes, check
 * `GET {JUDGE0_URL}/languages` and update the ids here.
 *
 * Python and JavaScript deliberately use the OLD images. Measured on
 * ce.judge0.com on 2026-10-10 with a one-line program: every newer Python
 * (3.11 to 3.14) and Node.js (18 to 22) image there burns 2.0 to 2.7 s of CPU
 * just starting up, while Python 3.8.1 and Node.js 12.14 start in about 0.05 s.
 * With the new images a correct solution hit the time limit about half the
 * time. The cost of the old ones is syntax: Python 3.8 has no `list[int]`
 * hints, `match` or `str.removeprefix`; Node.js 12 has no `??`, `?.`,
 * `replaceAll` or `Array.prototype.at`.
 *
 * `startupSec` is added to every question's time limit to cover runtime
 * startup. Re-measure when the instance or a language id changes.
 */
export const CODE_LANGUAGES = {
  python: { id: "python", label: "Python 3.8", judge0Id: 71, startupSec: 0 }, // Python 3.8.1
  java: { id: "java", label: "Java 17", judge0Id: 91, startupSec: 1 }, // JDK 17.0.6
  cpp: { id: "cpp", label: "C++ (GCC 14)", judge0Id: 105, startupSec: 0 }, // GCC 14.1.0
  javascript: { id: "javascript", label: "JavaScript (Node 12)", judge0Id: 63, startupSec: 0 }, // Node.js 12.14.0
} as const;

export type CodeLanguageId = keyof typeof CODE_LANGUAGES;

export const CODE_LANGUAGE_IDS = ["python", "java", "cpp", "javascript"] as const satisfies readonly CodeLanguageId[];

export function isCodeLanguageId(value: string): value is CodeLanguageId {
  return Object.hasOwn(CODE_LANGUAGES, value);
}

/**
 * One test for the runner. `input` is the raw stdin and `expectedOutput` the
 * raw stdout. The optional display strings are what a learner is shown for a
 * visible case (`arr = [1,2,3]` rather than the stdin line).
 */
export type RunTestCase = {
  input: string;
  expectedOutput: string;
  hidden: boolean;
  displayInput?: string;
  displayOutput?: string;
};

export type CaseStatus =
  | "passed"
  | "wrong_answer"
  | "runtime_error"
  | "timeout"
  | "not_run";

/**
 * A hidden case carries `index`, `hidden` and `status` only. The four optional
 * fields are never set for it, so a response cannot leak hidden test data.
 */
export type CaseResult = {
  index: number;
  hidden: boolean;
  status: CaseStatus;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
};

export type Verdict =
  | "accepted"
  | "wrong_answer"
  | "compile_error"
  | "runtime_error"
  | "timeout"
  | "unavailable";

export type TestRunResult = {
  verdict: Verdict;
  passedCount: number;
  total: number;
  compileOutput: string | null;
  cases: CaseResult[];
};
