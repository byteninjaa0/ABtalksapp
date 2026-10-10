# Plan 186: DSA practice section + reusable code editor (5 phases)

Status: PLAN ONLY. No code exists yet. Execute one phase per PR, in order.

Revision 3 (2026-10-08): function-style questions with a hidden per-language harness (matches the reference screenshot); pages sit inside the candidate app shell; Result / Submissions tabs and Custom input; "Practice DSA" dashboard section; exactly 2 sample + 2 hidden tests; no points; reference solutions are written by us, not supplied.

Revision 2 (2026-10-08): Judge0 replaces Piston; explicit enrolment with UTC day unlocks; content is read from JSON in the repo instead of the database; several pieces of the first draft were removed (see section 4.6).

---

## 1. Goal

Add a small DSA practice challenge ("Array and String Mastery in 15 Days"): the learner starts the challenge, works through 15 days of two coding questions each, and each question opens a problem statement beside a code editor with Run and Submit. The editor and the execution engine are standalone modules so assessments and future challenges reuse them unchanged.

## 2. Current behavior

- No code editor and no code execution exist anywhere in the app.
- The canonical learning tables already cover everything this needs to persist: `LearningProgram` / `ProgramVersion` / `Cohort` / `Module` / `Activity(type CODING)`, `ProgramEnrollment`, `ActivityAttempt(payload {code})`, `ActivityEvaluation`. **No schema change, no migration.**
- `src/lib/rate-limit.ts` inserts a `RateLimitEvent` row per hit, so it must not be used for Run.
- Sessions are JWT, so `auth()` in a route handler costs no database read.
- Content read from files in `src/` at runtime already has precedent (`src/features/courses/`, `src/features/career-guidance/catalog.ts`).

## 3. Product rules

### 3.1 Enrolment and day unlocking

- The learner clicks **Start challenge**. This creates one `ProgramEnrollment` row. Day 1 is open immediately.
- A day is **complete** when both of its questions have an accepted submission.
- Day boundaries are **00:00 UTC (05:30 IST)**. `PRACTICE_TZ = "UTC"` in `constants.ts`; read the constant, never hard-code the zone. This is a deliberate exception to the IST rule used by the other challenge tracks.
- Calendar rule: Day N's date is `enrolment UTC date + (N - 1) days`. It becomes eligible at 00:00 UTC on that date.
- Sequence rule: Day N can only be opened when Day N-1 is complete.

```
state(N) =
  COMPLETE          both questions of day N accepted
  LOCKED_DATE       today (UTC) is before day N's date            "Opens on 9 Oct, 5:30 AM IST"
  LOCKED_PREVIOUS   day N's date has arrived, day N-1 not complete "Complete Day 2 to open this day"
  OPEN              otherwise (Day 1 is always OPEN or COMPLETE)
```

Worked example. Enrol on 8 Oct at 14:00 IST (08:30 UTC). Day 1 is open. Day 2's date is 9 Oct, so it can open from 9 Oct 05:30 IST, and only once Day 1 is complete. A learner who finishes Day 1 on 11 Oct finds Day 2 open immediately (its date has passed), and Day 3 opens the moment Day 2 is complete. **Catching up on missed days is allowed; skipping ahead of the calendar is not.** Confirmed by the product owner on 2026-10-08.

`BYPASS_DAY_LOCKS=true` (existing dev flag, `isDayLockBypassEnabled()`) opens every day for testing.

### 3.2 Run and Submit

- **Run** executes the code against the question's visible sample tests and shows output, errors and per-test results. It is temporary: it creates no database record and performs no database read.
- **Submit** executes against all tests, hidden ones included, on the server. Only an **accepted** Submit is saved. A failed Submit shows results and writes nothing.
- **Revised 2026-10-10 (replaces "one saved row per question").** A solved question can be submitted again. A failed re-submission changes nothing. An accepted one becomes the saved solution the learner sees. Each accepted submission is its own `ActivityAttempt` row, except that a second accepted submission for the same question on the same IST day replaces that day's row, so there is at most one row per question per day.
- **Heatmap and streak (2026-10-10).** `listHubSubmissionTimes` in `src/repositories/progress.ts` includes coding practice attempts (`act_dsa_*`), so the dashboard heatmap and the weekly streak count accepted submissions, including accepted re-submissions on a later day. Runs and failed submits never count because they are never stored. The heatmap uses IST calendar days like every other track; practice day unlocks still use UTC.
- **Runtimes (2026-10-10).** Python runs on 3.8.1 and JavaScript on Node.js 12.14, because every newer image on ce.judge0.com spends 2.0 to 2.7 s of CPU starting up, which made correct solutions hit the 2 s limit. The language dropdown shows the versions. JavaScript reference solutions must stay Node 12 compatible.

- The **Submissions** tab shows the learner's saved accepted solution for that question (date, language, code). Failed attempts are not listed because they are never stored.
- **Custom input** (Phase 5): Run once against input the learner types, showing output only. Also never stored.

### 3.3 Problem format (revision 3: function style, as in the reference screenshot)

The learner sees and edits only a function, for example `class Solution: def largestTwo(self, arr)`. They never write input parsing.

Behind the scenes each question carries, per language, a hidden **harness**: an optional `prefix` (imports) and a `driver` (reads stdin, calls the learner's function, prints the result in one canonical format). The server builds `prefix + learner code + driver` and sends that to Judge0. The harness is server-only, like hidden tests.

- Stdin convention: one JSON value per argument, one per line (`[12,35,1,10,34,1]`). The driver prints the return value as compact JSON (`[35,34]`), so output comparison is exact and language-independent.
- Each sample test also carries display text for the statement and results panel (`arr = [12,35,1,10,34,1]` → `[35,34]`).
- Every question has exactly **2 sample tests and 2 hidden tests**.
- There is **no points system**. The statement header shows title and difficulty only.

### 3.4 Screen layout (from the reference screenshot)

- The pages render inside the existing candidate app shell (`DashboardShell`: sidebar, search, bell), the same way `/learn` does.
- Breadcrumb: "← 15-Days Arrays & String Mastery / Day 1".
- Left pane: title, difficulty chip, statement, Example 1..n blocks with Input, Output and a one-line explanation.
- Right pane, top: language select, Reset, Run, Submit; then the editor.
- Right pane, bottom: tabs **Result** and **Submissions**, plus the **Custom input** checkbox.
- Page toolbar (top right): collapse the statement pane, swap panes, font size down / up.
- A draggable divider between panes on desktop; tabs on mobile.

### 3.5 Dashboard entry

The dashboard gets a **Practice DSA** section with one card, "Array & Strings 15 Days Challenge", styled like the existing Learn section (`HUB_HEADING_CLASS`, `HUB_CARD_HOVER_CLASS`, `HUB_CARD_CTA_CLASS`). It renders only when `ENABLE_CODING_PRACTICE` is on.

---

## 4. Security and infrastructure decisions

### 4.1 Where user code runs

User code runs **only inside Judge0's sandbox, on Judge0's servers**. The Next.js server never evaluates, compiles or spawns user code: no `eval`, `Function`, `vm`, `child_process` or worker. It relays strings over HTTPS and reads the result.

### 4.2 The executor proxy

```
browser ──(same origin, session cookie)──▶ POST /api/practice/run ──(HTTPS, server-side)──▶ Judge0
```

- The browser never sees the Judge0 URL, any Judge0 key, or any Judge0 submission token. A Judge0 token is a bearer handle to the submitted code and test data, so tokens stay inside the server function and are never returned or logged.
- The route requires a signed-in session, checks `Origin`, caps the body at 100 KB and validates it with Zod before anything is sent out.
- Sent to Judge0: source code, test stdin, expected output, language id, CPU time limit, `enable_network: false`. **Never sent:** user id, email, name, IP address, or `callback_url`.
- Hidden test cases live in a `server-only` module. They are never passed as props and never appear in a response; a hidden case returns pass/fail only.
- User code, stdin and program output are never written to logs.
- One HTTP call creates all test runs (Judge0 batch endpoint, verified limit 20 per batch), followed by a few short polls. That keeps load on the free service low: a Run is one batch of 2 to 3 runs, a Submit one batch of at most 12.

### 4.3 Environment variables (all server-only, none `NEXT_PUBLIC_`)

| Variable | Required | Purpose |
|---|---|---|
| `JUDGE0_URL` | yes | Base URL of the Judge0 instance, for example `https://ce.judge0.com`. Unset means every Run and Submit answers "unavailable" without a network call. |
| `JUDGE0_API_KEY` | no | Only for instances that need a key. Sent as `X-RapidAPI-Key` + `X-RapidAPI-Host` when the URL host ends in `rapidapi.com`, otherwise as `X-Auth-Token`. Not needed for the public instance. |
| `ENABLE_CODING_PRACTICE` | yes | Feature flag and kill switch. Unset: every `/practice` page 404s and the route and actions refuse. |

### 4.4 Judge0 hosting: no VM

**No new infrastructure is added.** The plan uses a hosted Judge0 through one adapter. Verified on 2026-10-08: the public instance `https://ce.judge0.com` accepts single and batch submissions without a key, has network access disabled for submissions, and allows batches of 20.

What "free" means here, stated plainly:
- The public instance publishes no quota, no SLA and no terms of use that I could find. Treat it as best-effort. It can throttle or change without notice.
- The free RapidAPI plan is reported by third parties as about 50 submissions a day (I could not load RapidAPI's own pricing page to confirm). One Submit with 8 tests may count as 8. That plan is only useful for development.
- Paid hosted plans start at EUR 27 a month for 2,000 submissions a day. Moving to one is an env change, not a code change.

A self-hosted Judge0 VM is **not recommended for this feature**. It needs Docker with privileged containers, its own Postgres and Redis, and a kernel boot flag to force cgroup v1 on Ubuntu 22.04. The last release (v1.13.1, April 2024) exists because of three critical sandbox-escape vulnerabilities, two rated 10.0. Running it safely means a dedicated box with nothing else on it, no public exposure, an auth token and someone who patches it. If the free instance is ever outgrown, the paid hosted plan is cheaper than that ownership.

Because the executor is a free shared service, the feature is built to fail soft: a throttled or unreachable Judge0 shows "Code execution is unavailable right now", the page keeps working, and nothing is lost because drafts live in the browser.

### 4.5 Run throttle

- An in-memory `Map<userId, lastHitAt>` in the server function. Run: one per 3 seconds per user. Submit: one per 10 seconds per user. The Run and Submit buttons are also disabled while a request is in flight.
- It does **not** use `assertRateLimit` / `RateLimitEvent`: that limiter writes a database row on every hit, which is exactly the load this feature must avoid.
- If Judge0 answers HTTP 429, the adapter stops calling it for 30 seconds and answers "unavailable" in the meantime, so a busy moment is not made worse.
- Limitation, accepted on purpose: the map is per server instance, so it is best-effort across instances and resets on a cold start. It stops repeated clicks and simple scripts, not a determined abuser. A stronger limiter would need a shared store, which is new infrastructure and not justified here.

### 4.6 What the first draft got wrong or over-built (removed in this revision)

| Removed | Why |
|---|---|
| Piston adapter, version resolution, smoke script | Piston's public API is no longer free. Judge0 language ids are fixed numbers. |
| One executor call per test, with batching and stop-on-first-failure logic | One Judge0 batch call does all tests. |
| Own output comparison | Judge0 compares against `expected_output` and returns Accepted or Wrong Answer. |
| Question content, starter code and test cases seeded into four database tables plus an `unstable_cache` layer | Content now lives in JSON in the repo and is read by a server-only loader. Zero database reads for content, no cache to go stale. The database keeps only the catalog rows that submissions must reference. |
| Enrolment created silently on first accepted Submit | Replaced by an explicit Start, as the unlock rules require. |
| "Up to 10 saved attempts per question" with a cap message | One saved row per question, guaranteed by the existing unique index. |
| Submit service with injected dependencies and its own test | Replaced by a test of the pure unlock rules and a scan that the Run path imports no database code. |
| Five files in the runner module | Three. |

### 4.7 Known trade-offs

- **Run does not check day locks.** Checking would cost a database read on every Run. The question page (which delivers the statement and starter code) and Submit (which is the only thing that counts) both enforce locks on the server. The worst case is a signed-in learner hand-crafting a request to see sample-test results for a question whose statement they cannot open. If that ever matters, one indexed read in the Run route closes it.
- **Learner code leaves our infrastructure** to a third-party service with no contract. No identifiers go with it, but the code is whatever the learner typed.
- **Hidden test data is also sent to Judge0** (as stdin and expected output). Fine for practice; reconsider before using a free shared instance for recruiter assessments.
- **Content changes need a deploy.** That is the intended review path for questions.

---

## 5. Architecture

Imports go downward only.

```
src/app/practice/**                          pages
src/app/api/practice/run/route.ts            Run proxy
src/app/actions/coding-practice-actions.ts   enrol + Submit
src/features/coding-practice/**              content loader, unlock rules, submit flow
src/repositories/coding-practice.ts          enrolment + accepted submissions
──────────────────────── reusable below ────────────────────────
src/components/code-editor/**                editor + workspace shell (client, no data access)
src/features/code-runner/**                  Judge0 adapter + throttle (no Prisma, no feature imports)
```

Reuse later, not built now: another challenge adds a content folder and one slug; an assessment renders `<CodeWorkspace>` with its own `onRun` / `onSubmit` and calls `judge()` with test cases from its own storage.

### What the database holds

| Thing | Where |
|---|---|
| Statement, starter code, examples, test cases, reference solution | JSON under `src/features/coding-practice/content/` (not in the database) |
| The challenge and its 30 question anchors | `LearningProgram(slug "arrays-strings", CHALLENGE)` → `ProgramVersion` v1 → `Module` → `Activity(type CODING, dayNumber, position, title)`, id `act_dsa_as_d01_q1`; `Cohort(slug "arrays-strings-open", ROLLING, ACTIVE, timezone "UTC")` |
| "This learner started" | `ProgramEnrollment` (`startedAt` is the unlock anchor) |
| A saved solution | one `ActivityAttempt` (`attemptNumber 1`, `payload {code, language}`, `passed true`) + one `ActivityEvaluation` |

### Database touch budget

| Action | Reads | Writes |
|---|---|---|
| Open the challenge page | 1 (enrolment + solved ids, one query) | 0 |
| Start challenge | 2 (profile, cohort) | 1 |
| Open a question | 1, plus 1 if already solved (saved code) | 0 |
| Type in the editor | 0 (draft in `localStorage`) | 0 |
| **Run** | **0** | **0** |
| Submit, not accepted | 1 | **0** |
| Submit, accepted | 1 | 1 transaction |

---

## 6. Ownership and review

```
TASK:    DSA practice section + reusable code editor
MODULE:  NEW. Proposed owner Shivansh (@Shivansh-Rai): coding practice, code runner, code editor.
```

**Sohail reviews before merge** (rule 8): section 4 in full (the proxy, the three env vars, the hosted-Judge0 decision, the in-memory throttle), the new file in `src/repositories/`, the one-function addition to `src/lib/feature-flags.ts`, and the UTC day boundary as an exception to the IST rule.

**Shallika** does visual QA in Phase 5.

Not touched: `middleware.ts`, `auth.ts`, `auth.config.ts`, `prisma/schema.prisma`, every notification path, every hire / recruiter / resume / interview path.

---

## 7. Phases

### Phase 1: Foundation (server only, no UI)

**Files**

| Path | | Note |
|---|---|---|
| `src/features/code-runner/languages.ts` | [new] | Isomorphic. Language registry + result types. Zero imports. |
| `src/features/code-runner/judge0.ts` | [new] | `server-only`. The only file that talks to Judge0. |
| `src/features/code-runner/throttle.ts` | [new] | In-memory cooldown. |
| `src/features/code-runner/code-runner.test.ts` | [new] | Result mapping + throttle. No network. |
| `src/features/coding-practice/constants.ts` | [new] | Slugs, base path, `PRACTICE_TZ`, limits. |
| `src/features/coding-practice/content/arrays-strings/challenge.json` | [new] | Challenge metadata. |
| `src/features/coding-practice/content/arrays-strings/day-01.json` | [new] | Two placeholder questions. |
| `src/features/coding-practice/content.ts` | [new] | `server-only` loader. |
| `src/features/coding-practice/progression.ts` | [new] | Pure unlock rules (section 3.1). |
| `src/features/coding-practice/coding-practice.test.ts` | [new] | Unlock rules + every content file validates. |
| `src/lib/validations/coding-practice.ts` | [new] | Zod schemas for the content JSON. |
| `prisma/seed-coding-practice.ts` | [new] | Catalog anchors only. |
| `src/lib/feature-flags.ts` | [edit] | Add `isCodingPracticeEnabled()`. Additive. |
| `.env.example` | [edit] | The three variables from 4.3. |
| `package.json` | [edit] | Scripts `test:code-runner`, `test:coding-practice`, `db:seed:coding-practice`. |
| `.github/CODEOWNERS` | [edit] | Section 8, see step 11. |
| `docs/CHANGELOG.md` | [edit] | One line under `## Pending reconcile`. |

**Server vs Client.** All server or isomorphic. `languages.ts` must stay import-free; client components import it in Phase 2.

**Steps**

1. `languages.ts`:
   - `CODE_LANGUAGES` const object: `python` { label "Python 3", judge0Id 100 }, `java` { "Java", 91 }, `cpp` { "C++", 105 }, `javascript` { "JavaScript", 102 }. Comment: ids verified on `ce.judge0.com` on 2026-10-08 (Python 3.12.5, JDK 17.0.6, GCC 14.1.0, Node.js 22.08.0); they are instance-specific, check `GET {JUDGE0_URL}/languages` when the instance changes.
   - `CodeLanguageId`, `CODE_LANGUAGE_IDS` (tuple for `z.enum`).
   - `RunTestCase = { input: string; expectedOutput: string; hidden: boolean }`
   - `CaseStatus = "passed" | "wrong_answer" | "runtime_error" | "timeout" | "not_run"`
   - `CaseResult = { index: number; hidden: boolean; status: CaseStatus; input?: string; expectedOutput?: string; actualOutput?: string; stderr?: string }` (the four optional fields are omitted when `hidden` is true)
   - `Verdict = "accepted" | "wrong_answer" | "compile_error" | "runtime_error" | "timeout" | "unavailable"`
   - `TestRunResult = { verdict: Verdict; passedCount: number; total: number; compileOutput: string | null; cases: CaseResult[] }`
2. `judge0.ts` (`import "server-only"`):
   - `judge(input: { language: CodeLanguageId; code: string; tests: RunTestCase[]; timeLimitSec: number }): Promise<TestRunResult>`.
   - `JUDGE0_URL` unset, `tests` empty, or a 429 pause active → return verdict `unavailable` with no network call.
   - Headers: `content-type: application/json`; with `JUDGE0_API_KEY`, add `X-RapidAPI-Key` + `X-RapidAPI-Host` when the URL host ends in `rapidapi.com`, else `X-Auth-Token`.
   - Create: `POST {JUDGE0_URL}/submissions/batch?base64_encoded=true`, body `{ submissions: tests.map(t => ({ language_id, source_code: b64(code), stdin: b64(t.input), expected_output: b64(t.expectedOutput), cpu_time_limit: timeLimitSec, enable_network: false })) }`. Expect 201 and one `{ token }` per test; anything else → `unavailable`. Never send `callback_url`.
   - Poll: `GET {JUDGE0_URL}/submissions/batch?tokens=<csv>&base64_encoded=true&fields=status_id,stdout,stderr,compile_output` every 700 ms until every `status_id >= 3`, at most 20 s, then `unavailable`.
   - Every `fetch` uses `cache: "no-store"` and `AbortSignal.timeout(10_000)`.
   - HTTP 429 on any call → set a module-level `pausedUntil = now + 30_000` and return `unavailable`.
   - Failures log `logger.error("[code-runner] judge0", { language, httpStatus })` only. Never log code, stdin, output or tokens. Tokens never leave this file.
   - Export pure `toTestRunResult(tests, rows)`: status 13 or 14, or a missing row → `unavailable`; any status 6 → `compile_error` with `compileOutput` and every case `not_run`; otherwise 3 → `passed`, 4 → `wrong_answer`, 5 → `timeout`, 7 to 12 → `runtime_error`. Verdict is `accepted` when all passed, else the status of the lowest-index failing case. Decode base64 with `Buffer`, truncate each text field to 8000 chars, redact hidden cases.
3. `throttle.ts`: module-level `Map<string, number>`; `allowHit(key: string, cooldownMs: number, now = Date.now()): boolean`; above 5000 entries, drop those older than 60 s. Header comment: per-instance and best-effort by design, and why the shared limiter is not used (section 4.5).
4. `code-runner.test.ts`: same hand-rolled `suite` / `assert` style as `src/lib/rate-limit-policy.test.ts`. Cover `toTestRunResult` for all-accepted, one wrong answer, compile error, timeout, runtime error, internal error; hidden cases carry no input, expected output, actual output or stderr; `allowHit` refuses inside the cooldown and allows after it.
5. `constants.ts`: `PRACTICE_BASE = "/practice"`; `PRACTICE_PROGRAM_SLUGS = ["arrays-strings"] as const`; `PRACTICE_TZ = "UTC"`; `PRACTICE_QUESTIONS_PER_DAY = 2`; `PRACTICE_MAX_CODE_CHARS = 50_000`; `PRACTICE_RUN_COOLDOWN_MS = 3_000`; `PRACTICE_SUBMIT_COOLDOWN_MS = 10_000`; `cohortSlugFor(programSlug)` → `` `${programSlug}-open` ``; `practiceActivityId(idCode, day, slot)` → `act_dsa_<idCode>_d<NN>_q<slot>`.
6. Content files.
   `challenge.json`:
   ```json
   {
     "programSlug": "arrays-strings",
     "idCode": "as",
     "title": "Array and String Mastery in 15 Days",
     "subtitle": "Two problems a day for fifteen days. Arrays and strings, from basics to interview level.",
     "description": "A 15 day practice track on arrays and strings with two coding problems each day.",
     "totalDays": 15,
     "languages": ["python", "java", "cpp", "javascript"],
     "defaultLanguage": "python"
   }
   ```
   `day-NN.json`:
   ```json
   {
     "day": 1,
     "questions": [
       {
         "slot": 1,
         "title": "Sum of Array",
         "difficulty": "Easy",
         "tags": ["array"],
         "statementMd": "Given `n` integers, print their sum.\n\n**Input**\n\nLine 1: `n`. Line 2: `n` space separated integers.\n\n**Output**\n\nOne integer, the sum.\n\n**Constraints**\n\n- 1 <= n <= 100000\n- -10^9 <= a[i] <= 10^9",
         "timeLimitSec": 2,
         "starterCode": {
           "python": "class Solution:\n    def arraySum(self, arr: List[int]) -> int:\n        ",
           "java": "...", "cpp": "...", "javascript": "..."
         },
         "harness": {
           "python": {
             "prefix": "from typing import List\n",
             "driver": "\nimport sys, json\n_arr = json.loads(sys.stdin.readline())\nprint(json.dumps(Solution().arraySum(_arr), separators=(',', ':')))\n"
           },
           "java": { "prefix": "import java.util.*;\n", "driver": "..." },
           "cpp": { "prefix": "#include <bits/stdc++.h>\nusing namespace std;\n", "driver": "..." },
           "javascript": { "prefix": "", "driver": "..." }
         },
         "tests": [
           { "input": "[1,2,3]\n", "expectedOutput": "6\n", "hidden": false, "display": { "input": "arr = [1,2,3]", "output": "6" }, "explanation": "1 + 2 + 3 = 6" },
           { "input": "[-5]\n", "expectedOutput": "-5\n", "hidden": false, "display": { "input": "arr = [-5]", "output": "-5" }, "explanation": "A single element is its own sum." },
           { "input": "[1000000000,1000000000,1000000000,1000000000]\n", "expectedOutput": "4000000000\n", "hidden": true },
           { "input": "[0,0,0]\n", "expectedOutput": "0\n", "hidden": true }
         ],
         "solution": { "language": "python", "code": "..." }
       }
     ]
   }
   ```
   The statement body in `statementMd` describes the task only; the Example blocks are rendered from the two sample tests' `display` and `explanation`.
   Placeholder day 1: slot 1 "Sum of Array" (above), slot 2 "Reverse a String". Write starter code and a complete harness for all four languages for both. In Java the learner writes `class Solution` and the driver supplies `public class Main` with `main`.
7. `src/lib/validations/coding-practice.ts`: `practiceChallengeSchema` and `practiceDaySchema`, both `.strict()`. Rules: exactly two questions with slots 1 and 2; `title` 3..120; `difficulty` in `Easy | Medium | Hard`; `statementMd` 20..20000; `timeLimitSec` 1..5, default 2; `starterCode` and `harness` each have a key for every language in the challenge (each string ≤ 10000 chars, `prefix` may be empty, `driver` required); `tests` is exactly 4: 2 visible and 2 hidden; visible tests require `display.input`, `display.output` and `explanation`; each `input` and `expectedOutput` ≤ 100000 chars; `solution` optional (written by us in Phase 4, never supplied by the content owner).
8. `content.ts` (`import "server-only"`): static JSON imports (same pattern as `src/features/career-guidance/catalog.ts`) registered in one `RAW` map per slug, parsed with the schema on first use and memoised in a module `Map`. All functions are synchronous. (Built this way in Phase 1; the first draft's lazy `import()` loaders were dropped as unnecessary for files this small.) Export:
   - `getPracticeChallenge(slug)` → metadata + `days: number[]` that exist
   - `getPracticeDayIndex(slug)` → `{ day, questions: { slot, title, difficulty, activityId }[] }[]` for the day list
   - `getPracticeQuestion(slug, day, slot)` → client-safe `{ activityId, day, slot, title, difficulty, tags, statementMd, languages, starterCode, defaultLanguage, examples }` where `examples` are the visible tests' `display` + `explanation`. Never includes hidden tests, `harness` or `solution`.
   - `getPracticeTests(slug, day, slot)` → `{ timeLimitSec, tests: RunTestCase[] }`, all tests. Server-only callers only.
   - `buildPracticeSource(slug, day, slot, language, userCode)` → `prefix + userCode + "\n" + driver`, or null. This is the string given to `judge()`; the runner module itself stays unaware of harnesses. For visible cases, `RunTestCase` also carries the `display` text so the results panel shows `arr = [1,2,3]` rather than raw stdin.
9. `progression.ts`: pure functions, mirroring `src/features/langchain/progression.ts` but reading `PRACTICE_TZ`: `anchorKey(startedAt)`, `unlockKeyForDay(startedAt, day)`, `todayKey(now)`, `isDayComplete(day, solved, dayIndex)`, and `practiceDayState(day, startedAt, solved, dayIndex, now, bypass)` returning `"COMPLETE" | "OPEN" | "LOCKED_PREVIOUS" | "LOCKED_DATE"` exactly as section 3.1. Reuse `addCalendarDaysToKey` from `@/lib/date-utils`.
10. `coding-practice.test.ts`: Day 1 is open at enrolment; Day 2 is `LOCKED_DATE` before 00:00 UTC of the next date even when Day 1 is complete; Day 2 is `LOCKED_PREVIOUS` after that instant when Day 1 is incomplete; Day 2 is `OPEN` when both hold; one solved question does not complete a day; the catch-up example from 3.1; enrolment at 23:50 UTC puts Day 2's date ten minutes later; bypass opens everything. Plus: every registered content file parses.
11. `prisma/seed-coding-practice.ts`: copy the structure of `prisma/seed-langchain.ts`, including `assertNotProduction()`. Read the same JSON files and validate them with the same schemas. Upsert `ProgramCategory(slug "dsa", name "DSA", sortOrder 80)`; `LearningProgram(slug, format CHALLENGE, isPublished true, sortOrder 80)`; `ProgramVersion` v1 `PUBLISHED`, `plannedDurationDays 15`, `requiredActivityCount`; one `Module(position 1, startDay 1, endDay 15)`; per question an `Activity` (id from `practiceActivityId`, `type CODING`, `dayNumber`, `position = (day-1)*2 + slot`, `unlockRule SCHEDULED`, `points 0`, `isRequired true`, `title`, `difficulty`, `tags`); `Cohort(slug "arrays-strings-open", ROLLING, ACTIVE, timezone "UTC")`. It writes **no** `ContentActivityConfig`, `CodingActivityConfig` or `TestCase` rows. Activities in the database but absent from the JSON are logged, never deleted.
12. `.github/CODEOWNERS`, append:
    ```
    # ------------------------------------------------------------------------------
    # 8. Coding Practice + Code Runner (plan 186)
    # ------------------------------------------------------------------------------
    /src/app/practice/                                  @Shivansh-Rai
    /src/app/api/practice/                              @Shivansh-Rai
    /src/app/actions/coding-practice-actions.ts         @Shivansh-Rai
    /src/features/coding-practice/                      @Shivansh-Rai
    /src/features/code-runner/                          @Shivansh-Rai
    /src/components/coding-practice/                    @Shivansh-Rai
    /src/components/code-editor/                        @Shivansh-Rai
    /src/repositories/coding-practice.ts                @Shivansh-Rai
    /prisma/seed-coding-practice.ts                     @Shivansh-Rai
    ```
13. `docs/CHANGELOG.md`, under `## Pending reconcile`: `- 2026-10-08 [env|rule|convention] Plan 186: coding practice at /practice behind ENABLE_CODING_PRACTICE; question content is JSON in src/features/coding-practice/content (database holds catalog anchors only, no schema change); code runs on hosted Judge0 through features/code-runner (JUDGE0_URL + optional JUDGE0_API_KEY, server-only); Run never touches the database and uses an in-memory cooldown, not RateLimitEvent; only the first accepted Submit per question writes ActivityAttempt + ActivityEvaluation; days unlock at 00:00 UTC (PRACTICE_TZ) from the enrolment date and require the previous day complete.`

**Verification**

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run test:code-runner
```
```bash
npm run test:coding-practice
```
Changed files: exactly the table above. Seeding is section 9 and is run by the developer, not the agent.

**Commit:** `feat(code-runner): Judge0 adapter, unlock rules and practice content format (plan 186 phase 1)`

---

### Phase 2: Start, day list, editor and Run

**Files**

| Path | | Note |
|---|---|---|
| `package.json`, `package-lock.json` | [edit] | Add `@uiw/react-codemirror`, `@codemirror/lang-python`, `@codemirror/lang-java`, `@codemirror/lang-cpp`, `@codemirror/lang-javascript`. |
| `src/repositories/coding-practice.ts` | [new] | `getPracticeProgress`, `createPracticeEnrollment`. |
| `src/lib/validations/coding-practice.ts` | [edit] | Add `practiceRunSchema`, `practiceEnrollSchema`. |
| `src/app/api/practice/run/route.ts` | [new] | The Run proxy. |
| `src/app/actions/coding-practice-actions.ts` | [new] | `enrollInPracticeAction`. |
| `src/components/code-editor/code-editor.tsx` | [new] | **Client.** CodeMirror wrapper. |
| `src/components/code-editor/code-workspace.tsx` | [new] | **Client.** Reusable shell. |
| `src/components/code-editor/test-results.tsx` | [new] | **Client.** Renders a `TestRunResult`. |
| `src/components/coding-practice/practice-workspace.tsx` | [new] | **Client.** Binds the Run route into `CodeWorkspace`. |
| `src/components/coding-practice/practice-start-button.tsx` | [new] | **Client.** Calls the enrol action. |
| `src/components/coding-practice/practice-day-list.tsx` | [new] | **Server.** 15 day rows with state. |
| `src/components/dashboard-hub/practice-dsa.tsx` | [new] | **Server.** Dashboard "Practice DSA" section, one card. |
| `src/app/dashboard/page.tsx` | [edit] | Render `<PracticeDsa />` directly after the Learn section, only when the flag is on. One import, one line. |
| `src/app/practice/layout.tsx` | [new] | **Server.** Flag gate + `DashboardShell`. |
| `src/app/practice/page.tsx` | [new] | **Server.** Redirect to the only challenge. |
| `src/app/practice/[challenge]/page.tsx` | [new] | **Server.** Challenge page. |
| `src/app/practice/[challenge]/[day]/[slot]/page.tsx` | [new] | **Server.** Question page. |
| `src/features/coding-practice/coding-practice.test.ts` | [edit] | Add the Run-path source scan. |

**Server → Client props.** Server page → `PracticeWorkspace`: plain data (`challenge`, `day`, `slot`, `languages: {id,label}[]`, `starterCode`, `defaultLanguage`, `storageKey`) plus `statement: React.ReactNode` rendered on the server. No functions cross the boundary; `onRun` is created inside `PracticeWorkspace`. Server page → `PracticeStartButton`: `challenge: string` only.

**Steps**

1. Install the five packages. CodeMirror 6 rather than Monaco: Monaco is several MB, loads from a CDN by default and does not support mobile browsers, and this audience is mostly mobile.
2. Repository (`import "server-only"`, every query uses `select`):
   - `getPracticeProgress(userId, programSlug)` → `{ enrollmentId, status, startedAt, solvedActivityIds: string[] } | null`. One query: `programEnrollment.findFirst({ where: { userId, cohort: { slug: cohortSlugFor(programSlug) } }, select: { id, status, startedAt, attempts: { where: { passed: true }, select: { activityId: true } } } })`.
   - `createPracticeEnrollment(userId, programSlug)` → `{ ok: true } | { ok: false, reason: "closed" }`. Cohort by slug (`select: { id, status }`); status not `ACTIVE` or `ENROLLING` → `closed`; else `writeClient().programEnrollment.upsert` on `userId_cohortId` with `create: { status: ACTIVE, startedAt: now, enrolledAt: now }` and `update: {}`, so a second click never resets the clock.
3. `enrollInPracticeAction(input)`: flag; `auth()`; `practiceEnrollSchema` (`{ challenge: z.enum(PRACTICE_PROGRAM_SLUGS) }`); `getProfileSummary(userId)` null → `{ ok: false, message: "Complete your registration first." }`; `createPracticeEnrollment`; `revalidatePath` the challenge page; standard envelope.
4. `practiceRunSchema`: `{ challenge: z.enum(PRACTICE_PROGRAM_SLUGS), day: z.number().int().min(1).max(15), slot: z.number().int().min(1).max(2), language: z.enum(CODE_LANGUAGE_IDS), code: z.string().min(1).max(PRACTICE_MAX_CODE_CHARS) }`. The client never sends an activity id.
5. `route.ts`: `export const runtime = "nodejs"; export const maxDuration = 30;` then in order: flag off → 404; same-origin check copied from `src/app/api/assessments/[assignmentId]/events/route.ts`; `auth()` → 401; body as text, over 100 KB → 413, bad JSON → 400; Zod → 400; `allowHit("run:" + userId, PRACTICE_RUN_COOLDOWN_MS)` false → 429 "Please wait a moment before running again."; `buildPracticeSource` / `getPracticeTests` null → 404; `judge()` with the built source and the **visible tests only**; verdict `unavailable` → 503 "Code execution is unavailable right now. Please try again in a minute."; else 200 `{ ok: true, data }`. `catch` → `logger.error("[practice-run]", { error: String(error) })` and 500. No import from `@/lib/db`, `@/repositories` or `@prisma/client` in this file.
6. `code-editor.tsx`: props `{ value, onChange, language: CodeLanguageId, readOnly?, height? }`; language → extension (`python()`, `java()`, `cpp()`, `javascript()`); light theme; `font-mono`. Default export.
7. `code-workspace.tsx`: props `{ statement: React.ReactNode; languages; starterCode: Record<string, string>; defaultLanguage; storageKey: string; initialCode?: { language; code } | null; solved?: boolean; onRun: (input: { language; code }) => Promise<{ ok: true; data: TestRunResult } | { ok: false; message: string }>; onSubmit?: same input → Promise of an envelope }`.
   - Editor via `next/dynamic(() => import("./code-editor"), { ssr: false, loading: skeleton })`.
   - Draft per language in `localStorage` (`abt:code:<storageKey>:<language>`), debounced 500 ms, every access in `try/catch`. Initial code = local draft, else `initialCode` for that language, else starter code.
   - Layout follows section 3.4. Desktop (`lg` up): statement left; right column has the toolbar (language select, Reset, Run, Submit), the editor, and a bottom panel with a "Result" tab. Mobile: tabs "Problem", "Code", "Result"; a finished run switches to "Result".
   - While running, the Run button reads "Running..." and the Result tab shows "Running your code...".
   - The Submissions tab, Custom input, pane divider and page toolbar are added in Phases 3 and 5. Leave no dead controls in this phase.
   - Run is disabled while a request is in flight. "Reset code" restores the starter after a confirm.
   - No Submit button renders when `onSubmit` is absent. Do not build Submit UI in this phase.
8. `test-results.tsx`: summary ("2 of 3 sample tests passed"), compiler output block on compile error, otherwise one collapsible row per case with Input, Expected, Your output and stderr.
9. `practice-workspace.tsx`: `onRun` posts JSON to `/api/practice/run` and returns the envelope; network failure → `{ ok: false, message: "Could not reach the server. Check your connection and try again." }`.
10. Pages (`params` is a Promise in this Next version):
    - `layout.tsx`: `if (!isCodingPracticeEnabled()) notFound();` then wrap children in `DashboardShell` exactly as `src/app/learn/layout.tsx` does (same props, `collapsible startCollapsed`). Import the shell, do not modify it.
    - `practice-dsa.tsx`: copy the structure and classes of `src/components/dashboard-hub/learn-courses.tsx`. Heading "Practice DSA"; one card titled "Array & Strings 15 Days Challenge", line "15 days · 2 problems a day · Python, Java, C++, JavaScript", CTA "Start practising" linking to `/practice/arrays-strings`. Title and day count come from `getPracticeChallenge`. No database read.
    - `src/app/dashboard/page.tsx`: the only edit is two imports and `{isCodingPracticeEnabled() ? <PracticeDsa /> : null}`. As built in Phase 2: the dashboard no longer renders a Learn section, so the card sits in the Build Skills stage directly under `BuildSkillsPanel` (below the two library rows), using the Library row heading style and `STAGE_CARD` / `PILL_SOLID`. The practice screens use the app's teal (`#03535F`), matching the shell and the reference screenshot, not the orange named in Phase 5.
    - `page.tsx`: redirect to `` `${PRACTICE_BASE}/${PRACTICE_PROGRAM_SLUGS[0]}` ``.
    - `[challenge]/page.tsx`: unknown slug → `notFound()`; no session → redirect to `/login?from=<path>`; load `getPracticeChallenge`, `getPracticeDayIndex` and `getPracticeProgress`. Not enrolled → title, subtitle, the 15 days shown locked, and `PracticeStartButton`. Enrolled → `PracticeDayList` with each day's state from `practiceDayState`; only `OPEN` and `COMPLETE` days link to questions; locked days show the copy from section 3.1.
    - `[challenge]/[day]/[slot]/page.tsx`: validate slug, day, slot → else `notFound()`; session gate; `getPracticeProgress` null → redirect to the challenge page; day state locked → redirect to the challenge page; question null → `notFound()`; render breadcrumb + `PracticeWorkspace` with `statement` = `ReactMarkdown` + `remark-gfm` using the existing `programMdComponents` / `dayMdClassName` (import only).
    - Middleware is not edited. `/practice` is not in `protectedPaths`; the pages, the route and the actions guard themselves.
11. Test addition: read `src/app/api/practice/run/route.ts` and every file in `src/features/code-runner/` as text and assert none contains `@/lib/db`, `@/repositories`, `@prisma/client`, `prisma.` or `writeClient`.

**Verification**

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run test:coding-practice
```
```bash
npm run build
```
Manual, with `ENABLE_CODING_PRACTICE=true`, `JUDGE0_URL=https://ce.judge0.com` and the catalog seeded on a child branch:
1. `/practice` lands on the challenge page with a Start button. Start creates exactly one `ProgramEnrollment` (plain cuid). Clicking again changes nothing.
2. Day 1 is open, Days 2 to 15 are locked with the right message. Typing a Day 2 question URL redirects back.
3. Correct code passes the samples. Wrong code shows Expected against Your output. A syntax error shows compiler output. An infinite loop shows the time limit message. All four languages work.
4. Each language keeps its own draft across a switch and a reload.
5. A fast second Run click is refused with the wait message.
6. The Run response in the network tab contains visible test data only, and no Judge0 token or URL.
7. `ActivityAttempt` row count is unchanged after ten Runs.
8. With `JUDGE0_URL` unset, Run shows the unavailable message and the page keeps working.
9. **On a Vercel preview deployment**, not only localhost, Run works. This proves the public instance accepts requests from Vercel's addresses.
10. 390 px width: tabs work and the editor is usable.

Changed files: exactly the table above.

**Commit:** `feat(practice): start, day list, code editor and Run (plan 186 phase 2)`

---

### Phase 3: Submit, completion and unlocking

**Files**

| Path | | Note |
|---|---|---|
| `src/repositories/coding-practice.ts` | [edit] | Add `getSavedSolution`, `recordAcceptedSubmission`. |
| `src/features/coding-practice/submit.ts` | [new] | `server-only`. The Submit flow. |
| `src/lib/validations/coding-practice.ts` | [edit] | Add `practiceSubmitSchema` (same shape as run), `savedSolutionSchema` (`{ code, language }`). |
| `src/app/actions/coding-practice-actions.ts` | [edit] | Add `submitPracticeSolutionAction`. |
| `src/components/code-editor/code-workspace.tsx` | [edit] | **Client.** Submit button, accepted and solved states. |
| `src/components/code-editor/test-results.tsx` | [edit] | **Client.** Hidden-case rows (pass or fail only). |
| `src/components/coding-practice/practice-workspace.tsx` | [edit] | **Client.** Bind the submit action. |
| `src/components/coding-practice/practice-day-list.tsx` | [edit] | **Server.** Solved ticks, "N of 30 solved". |
| `src/app/practice/[challenge]/[day]/[slot]/page.tsx` | [edit] | **Server.** `export const maxDuration = 30`; pass `solved`, `initialCode`. |

**Server → Client props.** Adds `solved: boolean` and `initialCode: { language, code } | null`. The Server Action is imported inside `practice-workspace.tsx`, not passed from the server page.

**Steps**

1. Repository:
   - `getSavedSolution(enrollmentId, activityId)`: the passed attempt, `select: { payload: true }`, parsed with `savedSolutionSchema` (invalid → null).
   - `recordAcceptedSubmission({ enrollmentId, activityId, language, code, passedCount, total, completesChallenge })` → `{ stored: boolean }`. One `writeClient().$transaction`: create the attempt (`attemptNumber 1`, `status EVALUATED`, `lateness NOT_APPLICABLE`, `payload { code, language }`, `passed true`, `score 100`, `pointsAwarded 0`, `submittedAt now`); create one evaluation (`evaluatorType AUTO`, `passed true`, `score 100`, `maxScore 100`, `isAuthoritative true`, `detailJson { language, passedCount, total }`); when `completesChallenge`, update the enrolment to `COMPLETED` with `completedAt`. Prisma `P2002` on the attempt (the unique index on enrolment + activity + attempt number) → `{ stored: false }`. That index is what guarantees one saved row per question.
   - Not written, on purpose: `EnrollmentProgress`, `EnrollmentDayActivity`, `PointsTransaction`, `Credential`.
2. `submit.ts`: `submitPracticeSolution(userId, { challenge, day, slot, language, code })`:
   1. `getPracticeQuestion` / `getPracticeTests` null → not found.
   2. `getPracticeProgress` null → `{ ok: false, message: "Start the challenge first." }`.
   3. `practiceDayState` locked → `{ ok: false, message: "This day is locked." }`.
   4. Already solved → `{ ok: true, data: { alreadySolved: true } }` with **no Judge0 call**.
   5. `judge()` with all tests. `unavailable` → `{ ok: false, message }`.
   6. Verdict not `accepted` → `{ ok: true, data: { result, saved: false } }`. **No write.**
   7. Accepted → `recordAcceptedSubmission` with `completesChallenge = solved.length + 1 === total questions`; return `{ ok: true, data: { result, saved: true, dayComplete } }` where `dayComplete` means the other question of the day was already solved.
3. `submitPracticeSolutionAction`: flag; `auth()`; `practiceSubmitSchema`; `allowHit("submit:" + userId, PRACTICE_SUBMIT_COOLDOWN_MS)`; call `submitPracticeSolution`; `revalidatePath` the challenge page when saved; standard envelope.
   Submit also uses `buildPracticeSource`; the saved `payload.code` is the learner's code only, never the harness.
4. Submissions tab in `code-workspace.tsx`: an optional `submissions?: { language: string; submittedAtLabel: string; code: string }[]` prop (plain data from the server page; for practice it has zero or one entry). Empty state: "No accepted submission yet. Only accepted solutions are saved."
5. UI copy (no em dashes): saved → "Accepted. Your solution is saved."; saved and day complete → "Accepted. Day 3 is complete."; not accepted → the results plus "Nothing was saved."; hidden failure → "Hidden test 4 failed"; solved badge "Solved".
6. Question page: when the question is solved, `initialCode` and `submissions` come from `getSavedSolution` (also select `submittedAt`); a local draft still wins over `initialCode`.

**Verification**

```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run build
```
Manual on a child branch:
1. Wrong answer Submit: results shown, `ActivityAttempt` count unchanged.
2. Correct Submit: exactly one new `ActivityAttempt` (`passed = true`, payload has code and language) and one `ActivityEvaluation`.
3. Submitting the same solved question again from a second tab adds no row.
4. Solving both Day 1 questions marks Day 1 complete. Day 2 then shows "Opens on <date>, 5:30 AM IST" until 00:00 UTC, and opens after it. Check with `BYPASS_DAY_LOCKS` off, by setting the enrolment's `startedAt` one day back on the child branch.
5. A learner one question into Day 1 cannot open Day 2 even after its date.
6. A hidden test failure shows no input or expected output anywhere in the network response.
7. Reopening a solved question in another browser loads the saved code.
8. Regression: `/dashboard`, `/profile`, `/explore` and the admin student detail for that user render as before.

Changed files: exactly the table above.

**Commit:** `feat(practice): server-verified Submit, day completion and unlocks (plan 186 phase 3)`

---

### Phase 4: The real 30 questions

**Supplied by the content owner per question:** the owner has now updated the question in the plan which will be there in 15 Days and 2 questions each day
| Day | Focus | Question 1 — Basic/Medium | Question 2 — Challenging |
|---|---|---|---|
| **1** | Array fundamentals | Find largest & second largest element | **Kadane's Algorithm** — Maximum Subarray |
| **2** | Traversal & frequency | Remove duplicates from sorted array | Majority Element |
| **3** | Two Pointers | Move Zeroes | **Container With Most Water** |
| **4** | Two Pointers | Two Sum (sorted array) | **3Sum** |
| **5** | Prefix Sum | Range Sum / Prefix Sum queries | **Subarray Sum Equals K** |
| **6** | Hashing | Contains Duplicate | **Longest Consecutive Sequence** |
| **7** | Sliding Window | Maximum sum subarray of size K | **Longest Subarray with Sum K / target condition** |
| **8** | Arrays — intermediate | Best Time to Buy & Sell Stock | **Product of Array Except Self** |
| **9** | Sorting + intervals | Merge Sorted Arrays | **Merge Intervals** |
| **10** | Matrix | Transpose Matrix | **Set Matrix Zeroes** |
| **11** | String fundamentals | Valid Palindrome | **Longest Palindromic Substring** |
| **12** | String hashing/frequency | Valid Anagram | **Group Anagrams** |
| **13** | String sliding window | Longest Substring Without Repeating Characters | **Minimum Window Substring** |
| **14** | String manipulation | Reverse Words in a String | **String Compression / Run-Length Encoding** |
| **15** | Mixed mastery | Rotate Array | **Trapping Rain Water** |

**As built (Phase 4):** the content owner asked for the standard versions of these problems, with statements, tests and harnesses written here and hard hidden tests only. The day files are **generated**, not hand-written: `scripts/coding-practice/arrays-strings.questions.mjs` holds one typed definition per question (statement, signature, JavaScript reference solution, Python solution, 2 sample tests, 2 seeded hard hidden tests) and `scripts/coding-practice/harness.mjs` builds the starter code and hidden driver for all four languages from the signature. `npm run coding-practice:generate` rewrites `day-01.json` … `day-15.json`; every expected output is computed by the reference solution. Questions whose answer can be returned in any order (3Sum, Group Anagrams) are sorted by the driver before comparison. To change a question, edit the questions file, regenerate, then run `npm run coding-practice:verify`.

**Written during this phase:** starter code and the hidden harness for all four languages, and one reference solution per question. The reference solution exists only so the verify script can prove the four expected outputs and the four harnesses are right before learners see the question; a wrong expected output otherwise fails every correct answer.

**Files**

| Path | | Note |
|---|---|---|
| `src/features/coding-practice/content/arrays-strings/day-01.json` … `day-15.json` | [new/edit] | Real content. Day 1 placeholders are replaced in place, same activity ids. |
| `src/features/coding-practice/content.ts` | [edit] | Register all 15 day loaders. |
| `src/features/coding-practice/coding-practice.test.ts` | [edit] | Assert days 1..15 all exist and no title repeats. |
| `scripts/verify-coding-practice-solutions.ts` | [new] | Runs every reference solution against all its tests through Judge0. |
| `package.json` | [edit] | Script `coding-practice:verify`. |

**Steps**

1. Convert the supplied questions into the Phase 1 JSON format. Starter code is the empty function signature only. Write the harness (prefix + driver) for every language.
2. Write a reference solution for each question in Python, then port it to the other three languages inside the verify script's run so every harness is exercised: `verify-coding-practice-solutions.ts` calls `judge()` for each question and each language with `buildPracticeSource(solution)` and all four tests; prints a table; exits non-zero on any verdict other than `accepted`. Run sequentially with a 2 s gap, because the executor is a free shared service. If a supplied expected output disagrees with the reference solution, stop and ask the content owner which is right; do not silently change either.
3. Fix content until the test and the verify script both pass, then seed (section 9) so the 28 new `Activity` anchors exist.

**Verification**

```bash
npm run test:coding-practice
```
```bash
npm run coding-practice:verify
```
Then on a child branch: 15 days and 30 titles on the challenge page; three questions checked end to end in two languages each.

**Commit:** `content(practice): Array and String Mastery, 30 questions (plan 186 phase 4)`

---

### Phase 5: Fine-tuning and design polish

**As built:** layout toolbar (hide the problem, swap sides, result below or beside the editor, font size 12 to 20 px) with draggable dividers, all remembered in `localStorage` under `abt:code:layout`; Custom input (`customInput` on the Run schema, one Judge0 run with no expected output); `Ctrl/Cmd + Enter` runs; question switch pills in the breadcrumb; the challenge page has a progress header with a Continue button and a day timeline. Outside the module: `library.tsx` exports `LibraryRow` and gains `dsa` artwork so the dashboard card is the same tile as the SE challenge card, and `app-footer.tsx` hides the site footer on `/practice` (the shell footer stays). Not done: correcting compiler line numbers for the hidden import lines, lazy-loading each language pack, and the countdown on the Run cooldown.

Edits only inside files this plan created.

**Files:** `src/components/code-editor/*.tsx`, `src/components/coding-practice/*.tsx`, `src/components/dashboard-hub/practice-dsa.tsx`, `src/app/practice/**`, `src/app/api/practice/run/route.ts`, `src/lib/validations/coding-practice.ts` [edit].

**Functional**
0. Complete the reference layout (section 3.4):
   - Page toolbar: collapse or show the statement pane, swap panes, font size down / up (12 to 20 px, remembered in `localStorage`).
   - Draggable divider between panes and between editor and result panel on desktop.
   - **Custom input**: a checkbox that reveals a textarea. `practiceRunSchema` gains optional `customInput: z.string().max(10_000)`. With it, the route sends one run with that stdin and no expected output and returns `{ stdout, stderr, compileOutput, status }`; the panel shows "Your output" only. Same auth, cooldown and no-storage rules. Placeholder text shows the expected format, for example `[12,35,1,10,34,1]`.
   - Compile and runtime error line numbers: subtract the harness prefix line count before display so they match the learner's editor.
1. `Ctrl/Cmd + Enter` runs.
2. Previous and next question links; "Back to all days".
3. Each language pack loads on first selection instead of all four up front.
4. The Run cooldown shows as a disabled button with a short countdown.
5. Output cut at the 8000 char cap shows "Output truncated".
6. Editor: tab size 4 for Python, Java and C++, 2 for JavaScript; line wrapping on mobile; 14 px desktop, 13 px mobile.
7. Accessibility: labelled language select, `aria-live="polite"` on results, visible focus rings.
8. Confirm the editor chunk is absent from every other route's bundle.
9. Tune cooldowns and the poll interval from real usage, constants only.

**Design (follows `docs/design-system.md`, no new tokens)**
1. Cream page `#FBF9F7`, white cards, 1 px `#E0E0E0` border, 12 px radius, no heavy shadows.
2. One accent: orange `#E05226` on Submit only. Run is a neutral outlined button.
3. The day list is one calm column, about 880 px wide: day label, two question rows with title, a neutral difficulty chip, a solved check, and a quiet lock line for locked days. No gradients, no confetti, no motion beyond hover and focus.
4. Results use the success and error colours already in the codebase.
5. Every user-facing string in plain words or two sentences. **No em dash.**
6. Check at 390, 768 and 1440 px, then hand to Shallika.

**Verification:** `npx tsc --noEmit`, `npm run lint`, `npm run build`, then the Phase 2 and Phase 3 manual lists again at the three widths.

**Commit:** `polish(practice): editor ergonomics and design pass (plan 186 phase 5)`

---

## 8. Guardrails for Cursor (DO NOT)

- Do not execute user code on the Next.js server: no `eval`, `new Function`, `vm`, `child_process`, workers. User code is only ever a string sent to Judge0.
- Do not call Judge0 from the browser, expose `JUDGE0_URL` / `JUDGE0_API_KEY` through `NEXT_PUBLIC_` or props, or return a Judge0 token in any response.
- Do not send `callback_url`, a user id, an email or an IP address to Judge0. Always send `enable_network: false`.
- Do not call `assertRateLimit` or write `RateLimitEvent` on the Run or Submit path.
- The Run path performs zero database reads and writes. `src/app/api/practice/run/route.ts` and `src/features/code-runner/**` import nothing from `@/lib/db`, `@/repositories` or `@prisma/client`.
- Do not persist Runs, failed Submits, drafts or keystrokes. Drafts are `localStorage` only.
- One-way imports: `src/features/code-runner/**` and `src/components/code-editor/**` never import from `coding-practice`.
- Do not show points anywhere. There is no points system in this feature.
- Hidden tests, `harness` and `solution` are read only through `getPracticeTests` / `buildPracticeSource` in the route, the submit flow and the verify script. The harness is never sent to the browser and never saved with a submission. `content.ts` keeps `import "server-only"`; no content JSON is imported from a client component.
- Never log user code, stdin, stdout, stderr or tokens.
- Do not edit `prisma/schema.prisma` or add a migration. If one seems required, stop and report.
- Do not edit `middleware.ts`, `src/auth.ts` or `src/auth.config.ts`. Do not add `/practice` to `protectedPaths`.
- Do not touch any locked notification path, or any hire / recruiter / resume / interview file.
- Read `PRACTICE_TZ`; never hard-code `"UTC"` or `"Asia/Kolkata"` in day math.
- Do not stand up a VM, a container, a queue, Redis or any new service.
- Strict TS, no `any`. Zod at the route, the actions and the content loader. Result envelope everywhere. Every Prisma query uses `select`. The Submit write is one `writeClient().$transaction`.
- `buttonVariants` directly on `<Link>`; never `<Button asChild>`. `lib/logger.ts`, never `console.error`, in app code (the seed and scripts may use `console` as existing seeds do).
- No files beyond those listed per phase.
- `AGENTS.md`: this Next.js version differs from older ones. Read the relevant guide in `node_modules/next/dist/docs/` before writing the route handler and `next/dynamic` usage. If a build error contradicts this plan, trust the error and report it.
- Do not run a `db:seed*` command, start a dev server or request `localhost` yourself. Give the developer the command and wait.
- Confirm every listed file exists and `npx tsc --noEmit`, `npm run lint` and `npm run build` pass before reporting a phase done. Report failures with their output.

## 9. DB safety

No schema change. The only data change is the catalog seed (`ProgramCategory`, `LearningProgram`, `ProgramVersion`, `Module`, `Activity`, `Cohort`): additive and idempotent.

1. Commit the phase and note the hash.
2. Create a Neon child branch from `production`; put its `DATABASE_URL` and `DIRECT_URL` in `.env.local`.
3. Seed the child: `npm run db:seed:coding-practice`. The script prints the target host and refuses the production host.
4. Verify on the child: 1 program, 1 version, 1 module, 1 cohort, 2 activities per day file, then the manual checks of the current phase.
5. Production: only after Phase 4 passes on the child, and only with explicit authorization for that exact write (`SEED_ALLOW_PRODUCTION=true`). Then set `ENABLE_CODING_PRACTICE=true` and `JUDGE0_URL` in Vercel.

Rollback: unset `ENABLE_CODING_PRACTICE`. Seeded catalog rows are inert without the flag and can stay.

## 10. Later extensions (not in this plan)

Submission history and re-submitting improved solutions; `EnrollmentProgress` cache, streaks and progress on the dashboard card; points or a completion credential; more languages; saving failed final submissions; a `CODING` question type in recruiter assessments (owned by the assessment modules, reusing `code-runner` + `code-editor`); an admin view of submissions; moving to a paid Judge0 plan if the free instance is outgrown.
