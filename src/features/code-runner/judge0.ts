/**
 * The only file that talks to Judge0.
 *
 * User code is never executed on this server. It is a string that is relayed
 * to Judge0 over HTTPS and runs inside Judge0's sandbox.
 *
 * Rules this file keeps:
 *  - Judge0 submission tokens are bearer handles to the submitted code and test
 *    data. They never leave this file and are never logged.
 *  - Nothing about the user is sent: no id, email, name or IP.
 *  - `enable_network` is always false and `callback_url` is never set.
 *  - User code, stdin and program output are never logged.
 */
import "server-only";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  CODE_LANGUAGES,
  type CaseResult,
  type CaseStatus,
  type CodeLanguageId,
  type RunTestCase,
  type TestRunResult,
  type Verdict,
} from "./languages";

const POLL_INTERVAL_MS = 700;
const POLL_DEADLINE_MS = 20_000;
const FETCH_TIMEOUT_MS = 10_000;
const PAUSE_AFTER_429_MS = 30_000;
const MAX_TEXT_CHARS = 8_000;
/** Judge0 CE `max_submission_batch_size`. */
const MAX_BATCH_SIZE = 20;

/** Judge0 status ids: 1 In Queue, 2 Processing, 3+ finished. */
const STATUS_ACCEPTED = 3;
const STATUS_WRONG_ANSWER = 4;
const STATUS_TIME_LIMIT = 5;
const STATUS_COMPILE_ERROR = 6;
const STATUS_RUNTIME_FIRST = 7;
const STATUS_RUNTIME_LAST = 12;

const createdSchema = z.array(z.object({ token: z.string().min(1) }));

const rowSchema = z.object({
  token: z.string(),
  status_id: z.number().int(),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  compile_output: z.string().nullable().optional(),
});
const batchSchema = z.object({ submissions: z.array(rowSchema.nullable()) });

export type Judge0Row = Omit<z.infer<typeof rowSchema>, "token">;

/** After a 429 the adapter stops calling Judge0 until this time. */
let pausedUntil = 0;

function encode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

function decode(value: string | null | undefined): string {
  if (!value) return "";
  const text = Buffer.from(value, "base64").toString("utf8");
  return text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
}

function unavailable(tests: RunTestCase[]): TestRunResult {
  return {
    verdict: "unavailable",
    passedCount: 0,
    total: tests.length,
    compileOutput: null,
    cases: tests.map((t, index) => ({
      index,
      hidden: t.hidden,
      status: "not_run",
    })),
  };
}

function caseStatus(statusId: number): CaseStatus | null {
  if (statusId === STATUS_ACCEPTED) return "passed";
  if (statusId === STATUS_WRONG_ANSWER) return "wrong_answer";
  if (statusId === STATUS_TIME_LIMIT) return "timeout";
  if (statusId >= STATUS_RUNTIME_FIRST && statusId <= STATUS_RUNTIME_LAST) {
    return "runtime_error";
  }
  return null;
}

/** The lowest-index failing case decides the verdict. */
function verdictFor(cases: CaseResult[]): Verdict {
  for (const c of cases) {
    if (
      c.status === "wrong_answer" ||
      c.status === "runtime_error" ||
      c.status === "timeout"
    ) {
      return c.status;
    }
  }
  return "accepted";
}

/**
 * Pure mapping from finished Judge0 rows (one per test, same order) to the
 * result the app shows. Exported for tests.
 */
export function toTestRunResult(
  tests: RunTestCase[],
  rows: (Judge0Row | null | undefined)[],
): TestRunResult {
  if (tests.length === 0 || rows.length !== tests.length) {
    return unavailable(tests);
  }

  const compileFailed = rows.find(
    (r) => r?.status_id === STATUS_COMPILE_ERROR,
  );
  if (compileFailed) {
    return {
      ...unavailable(tests),
      verdict: "compile_error",
      compileOutput: decode(compileFailed.compile_output),
    };
  }

  const cases: CaseResult[] = [];
  for (const [index, test] of tests.entries()) {
    const row = rows[index];
    const status = row ? caseStatus(row.status_id) : null;
    // Internal Error (13), Exec Format Error (14), still pending or missing.
    if (!row || !status) return unavailable(tests);

    if (test.hidden) {
      cases.push({ index, hidden: true, status });
      continue;
    }
    cases.push({
      index,
      hidden: false,
      status,
      input: test.displayInput ?? test.input,
      expectedOutput: test.displayOutput ?? test.expectedOutput,
      actualOutput: decode(row.stdout),
      stderr: decode(row.stderr),
    });
  }

  return {
    verdict: verdictFor(cases),
    passedCount: cases.filter((c) => c.status === "passed").length,
    total: tests.length,
    compileOutput: null,
    cases,
  };
}

function requestHeaders(baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const key = process.env.JUDGE0_API_KEY?.trim();
  if (!key) return headers;

  const host = new URL(baseUrl).host;
  if (host.endsWith("rapidapi.com")) {
    headers["X-RapidAPI-Key"] = key;
    headers["X-RapidAPI-Host"] = host;
  } else {
    headers["X-Auth-Token"] = key;
  }
  return headers;
}

async function call(
  url: string,
  init: RequestInit,
  language: CodeLanguageId,
): Promise<unknown | null> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status === 429) {
    pausedUntil = Date.now() + PAUSE_AFTER_429_MS;
  }
  if (!response.ok) {
    logger.error("[code-runner] judge0", {
      language,
      httpStatus: response.status,
    });
    return null;
  }
  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `code` against every test on Judge0 and report the outcome.
 *
 * One batch request creates all the runs; a few short polls collect them.
 * Any failure to reach or understand Judge0 is reported as `unavailable`,
 * never thrown, so a caller can show a calm message.
 */
export async function judge(input: {
  language: CodeLanguageId;
  code: string;
  tests: RunTestCase[];
  timeLimitSec: number;
  /** Report output only: Judge0 is given no expected output to compare. */
  skipCompare?: boolean;
}): Promise<TestRunResult> {
  const { language, code, tests, timeLimitSec, skipCompare = false } = input;
  const baseUrl = process.env.JUDGE0_URL?.trim().replace(/\/+$/, "");

  if (!baseUrl || tests.length === 0 || tests.length > MAX_BATCH_SIZE) {
    return unavailable(tests);
  }
  if (Date.now() < pausedUntil) return unavailable(tests);

  try {
    const headers = requestHeaders(baseUrl);
    const sourceCode = encode(code);

    const created = createdSchema.safeParse(
      await call(
        `${baseUrl}/submissions/batch?base64_encoded=true`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            submissions: tests.map((t) => ({
              language_id: CODE_LANGUAGES[language].judge0Id,
              source_code: sourceCode,
              stdin: encode(t.input),
              ...(skipCompare
                ? {}
                : { expected_output: encode(t.expectedOutput) }),
              cpu_time_limit:
                timeLimitSec + CODE_LANGUAGES[language].startupSec,
              enable_network: false,
            })),
          }),
        },
        language,
      ),
    );
    if (!created.success || created.data.length !== tests.length) {
      return unavailable(tests);
    }

    const tokens = created.data.map((c) => c.token);
    const pollUrl =
      `${baseUrl}/submissions/batch?tokens=${tokens.join(",")}` +
      "&base64_encoded=true&fields=token,status_id,stdout,stderr,compile_output";

    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const polled = batchSchema.safeParse(
        await call(pollUrl, { method: "GET", headers }, language),
      );
      if (!polled.success) return unavailable(tests);

      const byToken = new Map(
        polled.data.submissions.flatMap((row) =>
          row ? [[row.token, row] as const] : [],
        ),
      );
      const rows = tokens.map((token) => byToken.get(token));
      const finished = rows.every(
        (row) => row !== undefined && row.status_id >= STATUS_ACCEPTED,
      );
      if (finished) return toTestRunResult(tests, rows);
    }
    logger.error("[code-runner] judge0 timed out", { language });
    return unavailable(tests);
  } catch (error) {
    logger.error("[code-runner] judge0 unreachable", {
      language,
      error: error instanceof Error ? error.name : "unknown",
    });
    return unavailable(tests);
  }
}
