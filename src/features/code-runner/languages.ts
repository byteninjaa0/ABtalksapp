/**
 * Languages the code runner supports, and the result shapes it returns.
 *
 * Zero imports on purpose: the editor (a client component) and the runner (a
 * server module) both read this file.
 *
 * Judge0 language ids are instance-specific. These were verified on
 * https://ce.judge0.com on 2026-10-08. When JUDGE0_URL changes, check
 * `GET {JUDGE0_URL}/languages` and update the ids here.
 */
export const CODE_LANGUAGES = {
  python: { id: "python", label: "Python", judge0Id: 100 }, // Python 3.12.5
  java: { id: "java", label: "Java", judge0Id: 91 }, // JDK 17.0.6
  cpp: { id: "cpp", label: "C++", judge0Id: 105 }, // GCC 14.1.0
  javascript: { id: "javascript", label: "JavaScript", judge0Id: 102 }, // Node.js 22.08.0
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
