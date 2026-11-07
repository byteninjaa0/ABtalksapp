import "server-only";
import type { ProgramDay } from "@prisma/client";
import { askClaudeJson } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

export type VerdictLine = { check: string; passed: boolean; detail?: string };
export type VerifyResult = { passed: boolean; verdict: VerdictLine[] };

export type CodeSprintPayload = { code: string; hiddenOutputs: string[] };
export type DataRoomPayload = { answers: (string | number)[] };
export type PromptForgePayload = { prompt: string };
export type BossBuildPayload = { repoUrl: string; writeup: string };

type DayWithSpec = Pick<ProgramDay, "missionType" | "missionSpec" | "dayNumber"> & {
  module?: { number: number };
};

type HiddenTest = { check: string; input?: string; expected: string };
type RepoCheck =
  | { check: string; kind: "fileExists"; path: string }
  | { check: string; kind: "contentMatches"; path: string; regex: string }
  | { check: string; kind: "minLines"; path: string; min: number }
  | {
      check: string;
      kind: "parsesAs";
      path: string;
      format: "json" | "yaml";
    }
  | { check: string; kind: "notebookParses"; path: string }
  | {
      check: string;
      kind: "notebookMinCells";
      path: string;
      min: number;
      ofType?: "code";
    };
type AnswerSpec = {
  check?: string;
  value: string | number;
  tolerance?: number;
  caseInsensitive?: boolean;
};
type EvalAssertion =
  | { type: "contains"; value: string }
  | { type: "jsonField"; field: string; value: string | number | boolean }
  | { type: "refusal" }
  | { type: "judge"; criterion: string };
type EvalCase = {
  check: string;
  input: string;
  assertions: EvalAssertion[];
};

/** Shared by SHIP_IT (027) and commits cron (028). */
export function parseRepo(
  githubRepoUrl: string,
): { owner: string; repo: string } | null {
  const match = githubRepoUrl.match(
    /^https:\/\/github\.com\/([a-zA-Z0-9-]{1,39})\/([a-zA-Z0-9._-]{1,100})\/?$/,
  );
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, "") };
}

/** Encode each path segment; keep `/` so nested Contents API paths work. */
export function encodeRepoContentsPath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function normalizeOutput(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function asRecord(json: unknown): Record<string, unknown> | null {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : null;
}

async function fetchRepoFile(
  owner: string,
  repo: string,
  filePath: string,
): Promise<{ ok: true; content: string } | { ok: false; detail: string }> {
  const token = process.env.GITHUB_API_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw",
    "User-Agent": "klymb-program",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const githubFileUrl = `https://github.com/${owner}/${repo}/${filePath}`;
  const pathHint = "repo root, default branch";

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeRepoContentsPath(filePath)}`,
      { headers, signal: AbortSignal.timeout(15000) },
    );
    if (res.status === 404) {
      return {
        ok: false,
        detail: `Not found at ${githubFileUrl} (${pathHint})`,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        detail: `GitHub API ${res.status} for ${githubFileUrl} (${pathHint})`,
      };
    }
    const content = await res.text();
    return { ok: true, content };
  } catch (e) {
    logger.error("[verify-mission] github fetch failed", {
      owner,
      repo,
      path: filePath,
      error: String(e),
    });
    return {
      ok: false,
      detail: `Could not fetch ${githubFileUrl} (${pathHint})`,
    };
  }
}

function verifyCodeSprint(
  spec: Record<string, unknown>,
  payload: CodeSprintPayload,
): VerifyResult {
  const tests = Array.isArray(spec.hiddenTests)
    ? (spec.hiddenTests as HiddenTest[])
    : [];
  if (tests.length === 0) {
    return {
      passed: false,
      verdict: [{ check: "Hidden tests", passed: false, detail: "Not configured" }],
    };
  }
  if (payload.hiddenOutputs.length !== tests.length) {
    return {
      passed: false,
      verdict: [
        {
          check: "Submission",
          passed: false,
          detail: `Expected ${tests.length} outputs, got ${payload.hiddenOutputs.length}`,
        },
      ],
    };
  }

  const verdict: VerdictLine[] = tests.map((test, i) => {
    const expected = normalizeOutput(String(test.expected ?? ""));
    const actual = normalizeOutput(String(payload.hiddenOutputs[i] ?? ""));
    const passed = actual === expected;
    return {
      check: test.check || `Hidden test ${i + 1}`,
      passed,
      detail: passed ? undefined : `Expected:\n${expected}\nGot:\n${actual}`,
    };
  });

  return { passed: verdict.every((v) => v.passed), verdict };
}

async function verifyShipIt(
  spec: Record<string, unknown>,
  githubRepoUrl: string,
): Promise<VerifyResult> {
  const parsed = parseRepo(githubRepoUrl);
  if (!parsed) {
    return {
      passed: false,
      verdict: [
        { check: "Repository URL", passed: false, detail: "Invalid GitHub repo URL" },
      ],
    };
  }

  const checks = Array.isArray(spec.repoChecks)
    ? (spec.repoChecks as RepoCheck[])
    : [];
  if (checks.length === 0) {
    return {
      passed: false,
      verdict: [{ check: "Repo checks", passed: false, detail: "Not configured" }],
    };
  }

  /** When false, any successful fetch counts as pass (existence only). */
  const SHIP_IT_CONTENT_CHECKS = false;

  const verdict: VerdictLine[] = [];
  for (const check of checks) {
    const fetched = await fetchRepoFile(parsed.owner, parsed.repo, check.path);
    if (!fetched.ok) {
      verdict.push({ check: check.check, passed: false, detail: fetched.detail });
      continue;
    }
    const content = fetched.content;

    if (!SHIP_IT_CONTENT_CHECKS || check.kind === "fileExists") {
      verdict.push({ check: check.check, passed: true });
      continue;
    }

    // future: content checks (gated by SHIP_IT_CONTENT_CHECKS)
    if (check.kind === "contentMatches") {
      let re: RegExp;
      try {
        re = new RegExp(check.regex, "m");
      } catch {
        verdict.push({
          check: check.check,
          passed: false,
          detail: "Invalid regex in spec",
        });
        continue;
      }
      const passed = re.test(content);
      verdict.push({
        check: check.check,
        passed,
        detail: passed ? undefined : `Pattern not found in ${check.path}`,
      });
      continue;
    }
    if (check.kind === "minLines") {
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      const passed = lines.length >= check.min;
      verdict.push({
        check: check.check,
        passed,
        detail: passed
          ? undefined
          : `Found ${lines.length} non-empty lines, need ≥${check.min}`,
      });
      continue;
    }
    if (check.kind === "parsesAs") {
      try {
        if (check.format === "json") JSON.parse(content);
        else {
          const { load } = await import("js-yaml");
          load(content);
        }
        verdict.push({ check: check.check, passed: true });
      } catch (e) {
        verdict.push({
          check: check.check,
          passed: false,
          detail: `Parse error: ${String(e)}`,
        });
      }
      continue;
    }
    if (check.kind === "notebookParses") {
      try {
        const nb = JSON.parse(content) as { cells?: unknown };
        const passed = Array.isArray(nb.cells);
        verdict.push({
          check: check.check,
          passed,
          detail: passed ? undefined : `Invalid notebook JSON at ${check.path}`,
        });
      } catch (e) {
        verdict.push({
          check: check.check,
          passed: false,
          detail: `Notebook parse error at ${check.path}: ${String(e)}`,
        });
      }
      continue;
    }
    if (check.kind === "notebookMinCells") {
      try {
        const nb = JSON.parse(content) as {
          cells?: { cell_type?: string }[];
        };
        if (!Array.isArray(nb.cells)) {
          verdict.push({
            check: check.check,
            passed: false,
            detail: `Invalid notebook at ${check.path}: missing cells array`,
          });
          continue;
        }
        const cells =
          check.ofType === "code"
            ? nb.cells.filter((c) => c.cell_type === "code")
            : nb.cells;
        const passed = cells.length >= check.min;
        verdict.push({
          check: check.check,
          passed,
          detail: passed
            ? undefined
            : `Found ${cells.length} ${check.ofType ?? ""} cell(s), need ≥${check.min} at ${check.path}`,
        });
      } catch (e) {
        verdict.push({
          check: check.check,
          passed: false,
          detail: `Notebook parse error at ${check.path}: ${String(e)}`,
        });
      }
    }
  }

  return { passed: verdict.every((v) => v.passed), verdict };
}

function compareAnswer(
  submitted: string | number,
  spec: AnswerSpec,
): boolean {
  if (typeof spec.value === "number" && typeof submitted === "number") {
    const tol = spec.tolerance ?? 0;
    return Math.abs(submitted - spec.value) <= tol;
  }
  const expected = String(spec.value);
  const actual = String(submitted);
  if (spec.caseInsensitive) {
    return actual.toLowerCase() === expected.toLowerCase();
  }
  return actual === expected;
}

function verifyDataRoom(
  spec: Record<string, unknown>,
  payload: DataRoomPayload,
): VerifyResult {
  const answers = Array.isArray(spec.answers)
    ? (spec.answers as AnswerSpec[])
    : [];
  if (answers.length === 0) {
    return {
      passed: false,
      verdict: [{ check: "Answers", passed: false, detail: "Not configured" }],
    };
  }
  const submittedAnswers = Array.isArray(payload?.answers)
    ? payload.answers
    : [];
  if (submittedAnswers.length !== answers.length) {
    return {
      passed: false,
      verdict: [
        {
          check: "Submission",
          passed: false,
          detail: `Expected ${answers.length} answers`,
        },
      ],
    };
  }

  const verdict: VerdictLine[] = answers.map((ans, i) => {
    const submitted = submittedAnswers[i]!;
    const passed = compareAnswer(submitted, ans);
    return {
      check: ans.check ?? `Answer ${i + 1}`,
      passed,
      detail: passed ? undefined : `Expected ${String(ans.value)}`,
    };
  });

  return { passed: verdict.every((v) => v.passed), verdict };
}

function assertEvalOutput(
  output: string,
  assertion: EvalAssertion,
): VerdictLine {
  if (assertion.type === "contains") {
    const passed = output.toLowerCase().includes(assertion.value.toLowerCase());
    return {
      check: `Contains "${assertion.value}"`,
      passed,
      detail: passed ? undefined : "Output missing expected text",
    };
  }
  if (assertion.type === "jsonField") {
    try {
      const parsed = JSON.parse(output) as Record<string, unknown>;
      const val = parsed[assertion.field];
      const passed = val === assertion.value;
      return {
        check: `JSON field ${assertion.field}`,
        passed,
        detail: passed ? undefined : `Got ${String(val)}`,
      };
    } catch {
      return { check: `JSON field ${assertion.field}`, passed: false, detail: "Invalid JSON" };
    }
  }
  if (assertion.type === "refusal") {
    const patterns = [
      "i cannot",
      "i can't",
      "i'm unable",
      "not able to",
      "out of scope",
      "cannot help",
      "can't help",
    ];
    const lower = output.toLowerCase();
    const passed = patterns.some((p) => lower.includes(p));
    return {
      check: "Refuses out-of-scope request",
      passed,
      detail: passed ? undefined : "Expected a refusal",
    };
  }
  return { check: "Unknown assertion", passed: false };
}

async function verifyPromptForge(
  spec: Record<string, unknown>,
  payload: PromptForgePayload,
): Promise<VerifyResult> {
  const cases = Array.isArray(spec.evalCases)
    ? (spec.evalCases as EvalCase[]).slice(0, 5)
    : [];
  if (cases.length === 0) {
    return {
      passed: false,
      verdict: [{ check: "Eval cases", passed: false, detail: "Not configured" }],
    };
  }

  const verdict: VerdictLine[] = [];

  for (const evalCase of cases) {
    const result = await askClaudeJson<{ output?: string; text?: string }>({
      system: payload.prompt,
      user: evalCase.input,
      maxTokens: 1000,
    });

    if (!result.ok) {
      verdict.push({
        check: evalCase.check,
        passed: false,
        detail: "Evaluation service unavailable, run again",
      });
      continue;
    }

    const output =
      typeof result.data.output === "string"
        ? result.data.output
        : typeof result.data.text === "string"
          ? result.data.text
          : JSON.stringify(result.data);

    for (const assertion of evalCase.assertions) {
      if (assertion.type === "judge") {
        const judge = await askClaudeJson<{ score?: number; reason?: string }>({
          system:
            "You are a strict evaluator. Reply with JSON: {\"score\": 0 or 1, \"reason\": \"...\"}",
          user: `Criterion: ${assertion.criterion}\n\nPrompt output:\n${output}`,
          maxTokens: 256,
        });
        if (!judge.ok) {
          verdict.push({
            check: `${evalCase.check} (judge)`,
            passed: false,
            detail: "Evaluation service unavailable, run again",
          });
        } else {
          const score = judge.data.score === 1 ? 1 : 0;
          verdict.push({
            check: `${evalCase.check} (judge)`,
            passed: score === 1,
            detail: score === 1 ? undefined : judge.data.reason ?? "Did not meet criterion",
          });
        }
      } else {
        const line = assertEvalOutput(output, assertion);
        verdict.push({ ...line, check: `${evalCase.check}: ${line.check}` });
      }
    }
  }

  return { passed: verdict.every((v) => v.passed), verdict };
}

function verifyBossBuild(payload: BossBuildPayload): VerifyResult {
  const repoOk = !!parseRepo(payload.repoUrl);
  const writeupOk = payload.writeup.trim().length >= 20;
  const verdict: VerdictLine[] = [
    {
      check: "Valid repository URL",
      passed: repoOk,
      detail: repoOk ? undefined : "Enter a public GitHub repo URL",
    },
    {
      check: "Write-up provided",
      passed: writeupOk,
      detail: writeupOk ? undefined : "Write at least 20 characters",
    },
  ];
  if (verdict.every((v) => v.passed)) {
    verdict.push({ check: "Project submitted ✓", passed: true });
  }
  return { passed: verdict.every((v) => v.passed), verdict };
}

export async function verifyMission(
  day: DayWithSpec,
  payload: unknown,
  context: { githubRepoUrl: string },
): Promise<VerifyResult> {
  const spec = asRecord(day.missionSpec) ?? {};

  switch (day.missionType) {
    case "CODE_SPRINT":
      return verifyCodeSprint(spec, payload as CodeSprintPayload);
    case "SHIP_IT": {
      const hasAnswers =
        Array.isArray(spec.answers) && (spec.answers as unknown[]).length > 0;
      if (!hasAnswers) {
        return verifyShipIt(spec, context.githubRepoUrl);
      }
      const answersResult = verifyDataRoom(spec, payload as DataRoomPayload);
      const shipResult = await verifyShipIt(spec, context.githubRepoUrl);
      return {
        passed: answersResult.passed && shipResult.passed,
        verdict: [...answersResult.verdict, ...shipResult.verdict],
      };
    }
    case "DATA_ROOM":
      return verifyDataRoom(spec, payload as DataRoomPayload);
    case "PROMPT_FORGE":
      return verifyPromptForge(spec, payload as PromptForgePayload);
    case "BOSS_BUILD":
      return verifyBossBuild(payload as BossBuildPayload);
    default:
      return {
        passed: false,
        verdict: [{ check: "Mission type", passed: false, detail: "Unknown type" }],
      };
  }
}

/** Returns hidden test inputs only — never expected values. */
export function getHiddenTestInputs(day: Pick<ProgramDay, "missionSpec">): {
  inputs: { check: string; input: string }[];
} {
  const spec = asRecord(day.missionSpec);
  const tests = Array.isArray(spec?.hiddenTests)
    ? (spec.hiddenTests as HiddenTest[])
    : [];
  return {
    inputs: tests.map((t, i) => ({
      check: t.check || `Hidden test ${i + 1}`,
      input: t.input ?? "",
    })),
  };
}

/** Client-safe repo path hints for SHIP_IT missions. */
export function getShipItHints(day: Pick<ProgramDay, "missionSpec">): {
  checks: { check: string; path: string }[];
} {
  const spec = asRecord(day.missionSpec);
  const repoChecks = Array.isArray(spec?.repoChecks)
    ? (spec.repoChecks as RepoCheck[])
    : [];
  return {
    checks: repoChecks.map((c) => ({ check: c.check, path: c.path })),
  };
}
