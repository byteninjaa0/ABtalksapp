# 062 — Practice modules (Python + Problem Solving), HackerRank-style

## 1. Goal

Add a HackerRank-style **Practice** area as a second tab on the student dashboard:
tracks → topics → problems, each problem opened in an in-page Python editor whose
test cases run **client-side via Pyodide (WebAssembly)**, with per-topic progress
bars, a practice score, and capped synergy-point credit. v1 ships a vertical slice —
two topics, ten original problems — to prove the editor + grader loop before
committing to large-scale problem authoring.

## 2. Current behavior

- `/dashboard` ([src/app/dashboard/page.tsx](../../src/app/dashboard/page.tsx)) is one
  724-line server-rendered scroll: heatmap, today's task, four stat cards
  (day / streak / days completed / referrals), quiz banner + history, recent activity.
  It has three top-level render branches — `ABANDONED`, pre-start, and normal — and
  each renders `<AppHeader>` itself. There is **no tab bar anywhere on the dashboard**.
- Grading across the whole platform is **proof-of-work links**: `Submission` stores
  `githubUrl` + `linkedinUrl` (`prisma/schema.prisma:233`). There is no code
  execution, no editor, and no test-case model in the repo (grep for
  `judge0|piston|monaco|codemirror|sandbox` returns nothing outside `globals.css`).
- Assessment today is the weekly MCQ `Quiz` / `QuizQuestion` / `QuizAttempt` trio.
- Synergy: `SynergyEvent.points` + `StudentProfile.synergyPoints`, written inside a
  transaction by
  [award-submission-synergy.ts](../../src/features/synergy/award-submission-synergy.ts).
  `SynergyEvent.type` is a free-form `String` — a new `"PRACTICE"` type needs **no
  enum migration**.
- `src/components/ui/tabs.tsx` exists (Base UI, client) and is used only in admin
  pages.
- No CSP is configured in `next.config.ts`, so a CDN `importScripts` for Pyodide is
  not blocked. `reactCompiler` is production-only.

## 3. Decisions already made (do not re-litigate)

| Decision | Choice |
|---|---|
| Grading | Pyodide in the browser, Python only — including the Problem Solving track |
| Placement | Tab on the challenge dashboard, implemented as sub-route `/dashboard/practice` |
| v1 content | Vertical slice: 2 topics × 5 original problems |
| Progress | Difficulty + max score, solved/attempted state, per-topic progress bar, total practice score |
| Rewards | Feeds `SynergyEvent`; **no certificate in v1** |
| Integrity | Server stores source code, caps credited solves per IST day, flags hardcoded-output solves |
| Test shape | stdin → stdout, diffed against expected output |

### Two honest limitations to build around, not paper over

1. **"Hidden" test cases are not hidden.** Client-side execution means every test
   case ships to the browser and is readable in the network tab. `isSample` controls
   *display* only. Do not describe hidden tests as secret in UI copy.
2. **Client-reported results are forgeable.** A determined student can POST
   `passed: true`. Section 5 Step 6 defines the server-side checks that catch the
   naive cases; the daily cap plus stored source code is the real control. This is
   the accepted trade for $0 infra, and it is why no certificate is issued in v1.

## 4. Files to touch

### Schema, migration, content
| Path | | Note |
|---|---|---|
| `prisma/schema.prisma` | `[edit]` | 5 models, 2 enums, 2 `User` back-relations |
| `prisma/migrations/<ts>_practice_modules/migration.sql` | `[new]` | Generated, not hand-written |
| `prisma/content/practice/python-introduction.json` | `[new]` | Track + topic + 5 problems |
| `prisma/content/practice/problem-solving-warmup.json` | `[new]` | Track + topic + 5 problems |
| `prisma/seed-practice.ts` | `[new]` | Idempotent upsert by slug |
| `package.json` | `[edit]` | Add `"db:seed:practice": "tsx prisma/seed-practice.ts"` |

### Feature module — `src/features/practice/`
| Path | | Note |
|---|---|---|
| `constants.ts` | `[new]` | Score/synergy tables, daily cap, Pyodide version + CDN base, timeouts |
| `get-practice-overview.ts` | `[new]` | Tracks → topics → problems + this user's solve/attempt state |
| `get-practice-problem.ts` | `[new]` | One problem + test cases + user's latest attempt and solve |
| `record-practice-attempt.ts` | `[new]` | Transactional writer: attempt, solve, capped synergy, flagging |
| `award-practice-synergy.ts` | `[new]` | `tx`-based, mirrors `award-submission-synergy.ts` exactly |

### Server action
| Path | | Note |
|---|---|---|
| `src/app/actions/practice-actions.ts` | `[new]` | `submitPracticeAttemptAction`, Zod at entry, Result envelope |

### Routes
| Path | | Note |
|---|---|---|
| `src/app/dashboard/practice/page.tsx` | `[new]` | Server Component — practice landing |
| `src/app/dashboard/practice/[slug]/page.tsx` | `[new]` | Server Component — problem shell |
| `src/app/dashboard/practice/loading.tsx` | `[new]` | Skeleton, mirrors `dashboard/loading.tsx` |
| `src/app/dashboard/page.tsx` | `[edit]` | Insert `<DashboardTabs>` in 2 of 3 branches — nothing else |

### Components — `src/components/practice/`
| Path | | Note |
|---|---|---|
| `dashboard-tabs.tsx` | `[new]` | **Client** — Overview / Practice, `usePathname` for active state |
| `practice-track-list.tsx` | `[new]` | **Server** — track cards, topic rows, progress bars |
| `practice-problem-workspace.tsx` | `[new]` | **Client** — editor + Run/Submit + results, owns worker lifecycle |
| `practice-test-results.tsx` | `[new]` | **Client** — per-case pass/fail rows |
| `use-pyodide-runner.ts` | `[new]` | **Client hook** — worker spawn, timeout, terminate, respawn |

### Worker + lib
| Path | | Note |
|---|---|---|
| `public/practice/pyodide-worker.js` | `[new]` | Plain JS — see Step 4 for why |
| `src/lib/date-utils.ts` | `[edit]` | Add `getTodayIstDateKey()` — 3 lines |

### Admin visibility
| Path | | Note |
|---|---|---|
| `src/app/admin/students/[id]/page.tsx` | `[edit]` | Add a "Practice" tab to the existing `<Tabs>` |
| `src/features/admin/get-student-detail.ts` | `[edit]` | Include recent practice attempts in the select |

**Do not create any file not on this list.**

## 5. Server vs Client

| Component | Boundary | Notes |
|---|---|---|
| `dashboard/practice/page.tsx` | **Server** | Fetches with `getUserWithProfile`, `getUserActiveEnrollments`, `isUserRegistered`, `getPracticeOverview` |
| `dashboard/practice/[slug]/page.tsx` | **Server** | Fetches problem + test cases, passes plain JSON down |
| `practice-track-list.tsx` | **Server** | Pure render of serializable props |
| `dashboard-tabs.tsx` | **Client** | Needs `usePathname()` |
| `practice-problem-workspace.tsx` | **Client** | Editor state, worker, server action call |
| `practice-test-results.tsx` | **Client** | Rendered inside the workspace |

**Server → Client prop rules for this plan:**
- `[slug]/page.tsx` → `practice-problem-workspace.tsx` may pass **only** plain
  serializable data: `problemId`, `slug`, `title`, `starterCode`, `maxScore`,
  `difficulty` (string), and `testCases: { ordinal: number; isSample: boolean; input: string; expected: string; explanation: string | null }[]`.
- No `Date` objects across the boundary — pre-format with `formatDateIST` on the
  server and pass strings.
- No functions, no icon components, no Prisma model instances across the boundary.
- The workspace imports `submitPracticeAttemptAction` directly from
  `@/app/actions/practice-actions` — do **not** pass the action down as a prop.

## 6. Steps

### Step 1 — Schema (`prisma/schema.prisma`)

Add two enums:

```prisma
enum PracticeDifficulty {
  EASY
  MEDIUM
  HARD
}

enum PracticeAttemptStatus {
  ACCEPTED
  WRONG_ANSWER
  RUNTIME_ERROR
}
```

Add five models. Keep field order and comment style consistent with the existing
file.

```prisma
model PracticeTrack {
  id          String          @id @default(cuid())
  slug        String          @unique
  title       String
  description String
  sortOrder   Int
  isActive    Boolean         @default(true)
  createdAt   DateTime        @default(now())
  topics      PracticeTopic[]
}

model PracticeTopic {
  id          String            @id @default(cuid())
  trackId     String
  slug        String
  title       String
  description String
  sortOrder   Int
  track       PracticeTrack     @relation(fields: [trackId], references: [id], onDelete: Cascade)
  problems    PracticeProblem[]

  @@unique([trackId, slug])
  @@index([trackId, sortOrder])
}

model PracticeProblem {
  /// Statement fields are markdown. `slug` is globally unique — it is the URL segment.
  id            String             @id @default(cuid())
  topicId       String
  slug          String             @unique
  title         String
  statement     String
  inputFormat   String
  outputFormat  String
  constraintsMd String
  starterCode   String
  difficulty    PracticeDifficulty
  maxScore      Int
  sortOrder     Int
  isActive      Boolean            @default(true)
  createdAt     DateTime           @default(now())
  topic         PracticeTopic      @relation(fields: [topicId], references: [id], onDelete: Cascade)
  testCases     PracticeTestCase[]
  attempts      PracticeAttempt[]
  solves        PracticeSolve[]

  @@index([topicId, sortOrder])
}

model PracticeTestCase {
  /// `isSample` controls display only — every case is shipped to the browser to be run.
  id          String          @id @default(cuid())
  problemId   String
  ordinal     Int
  isSample    Boolean         @default(false)
  input       String
  expected    String
  explanation String?
  problem     PracticeProblem @relation(fields: [problemId], references: [id], onDelete: Cascade)

  @@unique([problemId, ordinal])
}

model PracticeAttempt {
  /// One row per Submit. Source code is retained for integrity review.
  id          String                @id @default(cuid())
  userId      String
  problemId   String
  status      PracticeAttemptStatus
  language    String                @default("python")
  sourceCode  String
  testsPassed Int
  testsTotal  Int
  runtimeMs   Int?
  flagged     Boolean               @default(false)
  flagReason  String?
  createdAt   DateTime              @default(now())
  user        User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  problem     PracticeProblem       @relation(fields: [problemId], references: [id], onDelete: Cascade)
  solve       PracticeSolve?

  @@index([userId, createdAt])
  @@index([problemId])
  @@index([flagged, createdAt])
}

model PracticeSolve {
  /// First accepted attempt per (user, problem). `score` always counts toward practice
  /// progress; `synergyAwarded` is 0 when the IST daily synergy cap was already hit.
  id             String          @id @default(cuid())
  userId         String
  problemId      String
  attemptId      String          @unique
  score          Int
  synergyAwarded Int             @default(0)
  solvedAt       DateTime        @default(now())
  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  problem        PracticeProblem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  attempt        PracticeAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@unique([userId, problemId])
  @@index([userId, solvedAt])
}
```

On `model User`, add exactly two back-relations alongside the existing ones:

```prisma
  practiceAttempts PracticeAttempt[]
  practiceSolves   PracticeSolve[]
```

Do **not** touch `Enrollment`, `Submission`, `SynergyEvent`, `Certificate`,
`CertificateType`, or `Domain`. Practice is user-scoped, not enrollment-scoped.

### Step 2 — `src/features/practice/constants.ts`

```ts
/** Practice score by difficulty — drives topic progress bars and total practice score. */
export const PRACTICE_MAX_SCORE = { EASY: 10, MEDIUM: 20, HARD: 35 } as const;

/** Synergy credited on first solve. Deliberately far below the daily-submission
 *  award (10–23) so practice supplements the challenge instead of replacing it. */
export const PRACTICE_SYNERGY = { EASY: 1, MEDIUM: 2, HARD: 3 } as const;

/** Max first-solves that earn synergy per IST calendar day. Practice score is uncapped. */
export const PRACTICE_SYNERGY_DAILY_CAP = 5;

/** Max attempt rows a user may write per IST day — DB spam guard, not a scoring rule. */
export const PRACTICE_ATTEMPTS_DAILY_LIMIT = 200;

export const PRACTICE_MAX_SOURCE_CHARS = 20_000;

/** Pin the exact Pyodide version — never a floating URL. Verify the current stable
 *  release at https://pyodide.org/en/stable/ before setting this. */
export const PYODIDE_VERSION = "<pin at implementation time>";
export const PYODIDE_CDN_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** Per-run wall clock before the worker is terminated and respawned. */
export const PRACTICE_RUN_TIMEOUT_MS = 5_000;
/** Cold Pyodide boot allowance. */
export const PRACTICE_BOOT_TIMEOUT_MS = 30_000;
```

### Step 3 — `src/lib/date-utils.ts`

Add one exported helper next to `getNowInIST`; change nothing else in the file:

```ts
/** Today's IST calendar key (`yyyy-MM-dd`). */
export function getTodayIstDateKey(): string {
  return formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
}
```

### Step 4 — `public/practice/pyodide-worker.js`

**Why `public/` and plain JS:** the worker never imports application code, must not
go through the React Compiler Babel pass, and must not participate in Turbopack
bundling — a static asset is the lowest-risk path. This is the **one** deliberate
non-TypeScript file in this plan. Annotate it with JSDoc; do not add `any`-typed
TS shims elsewhere to accommodate it.

Protocol (exact):

- main → worker: `{ type: "boot", indexURL: string }`
- worker → main: `{ type: "ready" }` | `{ type: "boot-error", message: string }`
- main → worker: `{ type: "run", code: string, cases: [{ ordinal: number, input: string }] }`
- worker → main: `{ type: "results", results: [{ ordinal, stdout, stderr, runtimeMs }] }`

The worker does **not** decide pass/fail — it returns stdout and the main thread
compares. That keeps the comparison rule in one place.

Worker behavior:

1. `importScripts(indexURL + "pyodide.js")`, then `loadPyodide({ indexURL })`.
2. Per case, run the user code in a **fresh namespace** so state cannot leak
   between cases: build `pyodide.globals.get("dict")()` and pass it as the
   `globals` argument to `runPython`.
3. Wire stdin/stdout per case before running:
   ```py
   import sys, io
   sys.stdin = io.StringIO(_ABT_INPUT)
   sys.stdout = io.StringIO()
   ```
   then read back `sys.stdout.getvalue()` after the run. Reset both between cases.
4. Catch Python exceptions per case; put the **last line** of the traceback in
   `stderr` and leave `stdout` as whatever was flushed before the throw. One failing
   case must not abort the remaining cases.
5. Never `postMessage` the Pyodide object or a `PyProxy` — strings and numbers only.

### Step 5 — `use-pyodide-runner.ts` (client hook)

State machine: `"booting" | "ready" | "running" | "timeout" | "error"`.

- Spawn `new Worker("/practice/pyodide-worker.js")` on mount; post `boot` with
  `PYODIDE_CDN_BASE`. Terminate in the effect cleanup.
- `run(code, cases)` starts a `PRACTICE_RUN_TIMEOUT_MS` timer. **Pyodide cannot be
  interrupted from outside** — on timeout, `worker.terminate()`, surface
  `"Timed out after 5s — check for an infinite loop"`, then respawn a fresh worker
  and re-boot. This path is mandatory: without it one student `while True:` bricks
  the tab.
- Output comparison lives here, applied identically to actual and expected:
  right-strip every line, drop trailing blank lines, join with `\n`, compare
  exactly. Surface this rule in UI copy ("trailing whitespace is ignored").
- Cases with non-empty `stderr` are failures whose reason is the runtime error.

### Step 6 — `record-practice-attempt.ts` (the integrity core)

Signature: `recordPracticeAttempt(input: { userId, problemId, sourceCode, reported: { ordinal: number; passed: boolean }[], runtimeMs?: number })`
returning the standard `{ ok: true, data } | { ok: false, message }` envelope.

Order of operations:

1. Load the problem with `select` — `id, maxScore, difficulty` plus
   `testCases: { select: { ordinal, input } }`. 404 → `{ ok: false }`.
2. **Reject a mismatched result set.** The multiset of reported `ordinal`s must equal
   the DB's set exactly. Any missing, extra, or duplicated ordinal → reject. This
   kills the "submit one passing case" forgery.
3. **Derive status server-side.** `testsPassed` = count of `passed === true`;
   `testsTotal` = DB case count; `status = ACCEPTED` iff `testsPassed === testsTotal`.
   Never read a client-sent status.
4. **Flagging.** Set `flagged = true` with
   `flagReason = "accepted without reading stdin"` when the attempt is `ACCEPTED`,
   at least one test case has non-empty `input`, and `sourceCode` contains no
   `input(` and no `sys.stdin`. That is a deterministic signal of hardcoded output
   or a forged POST. Flagged attempts are still stored and still count — they are a
   review queue, not a rejection.
5. Enforce `PRACTICE_ATTEMPTS_DAILY_LIMIT` using
   `istDateRangeToUtc(getTodayIstDateKey(), getTodayIstDateKey())` over
   `createdAt`. Over limit → `{ ok: false, message: "Daily attempt limit reached." }`.
6. `prisma.$transaction`:
   - create `PracticeAttempt`;
   - if `ACCEPTED` and no `PracticeSolve` exists for `(userId, problemId)`:
     - count today's `PracticeSolve` rows with `synergyAwarded > 0` in the IST window;
     - `synergyAwarded = under cap ? PRACTICE_SYNERGY[difficulty] : 0`;
     - create `PracticeSolve` with `score = problem.maxScore` (**always**, cap or not);
     - if `synergyAwarded > 0`, call `awardPracticeSynergy(tx, …)`.
   - A repeat solve creates an attempt row only — never a second `PracticeSolve`,
     never additional synergy. The `@@unique([userId, problemId])` is the backstop.
7. Log failures through `lib/logger.ts`. No `console.error`.

`award-practice-synergy.ts` mirrors `award-submission-synergy.ts` exactly —
`(tx, args) => Promise<number>`, creates the `SynergyEvent` with
`type: "PRACTICE"` and `submissionId: null`, then increments
`studentProfile.synergyPoints` via `updateMany`.

### Step 7 — `src/app/actions/practice-actions.ts`

Match [quiz-actions.ts](../../src/app/actions/quiz-actions.ts) line for line in shape:
`"use server"`, `auth()` guard first, Zod `safeParse`, delegate to the feature
function, return its envelope.

```ts
const submitPracticeAttemptSchema = z.object({
  problemId: z.string().min(1),
  sourceCode: z.string().min(1).max(PRACTICE_MAX_SOURCE_CHARS),
  reported: z
    .array(z.object({ ordinal: z.number().int().positive(), passed: z.boolean() }))
    .min(1)
    .max(50),
  runtimeMs: z.number().int().nonnegative().max(600_000).optional(),
});
```

Call `revalidatePath("/dashboard/practice")` after a successful first solve so the
landing page's progress bars are fresh.

### Step 8 — `dashboard-tabs.tsx` and wiring the tab

**Do not add `src/app/dashboard/layout.tsx`.** `<AppHeader>` is rendered by the
*page*, not a layout, so a layout-level tab bar would render **above** the header.
Both pages render the tab bar themselves, directly under `<AppHeader>`.

```tsx
"use client";
type Props = { enrollmentId: string | null };
```

Two links styled as a tab bar, using `buttonVariants` on `<Link>` (never
`<Button asChild>`): Overview → `/dashboard` plus `?challenge=<enrollmentId>` when
non-null; Practice → `/dashboard/practice`. Active state from
`usePathname() === "/dashboard/practice"`.

In [src/app/dashboard/page.tsx](../../src/app/dashboard/page.tsx), insert
`<DashboardTabs enrollmentId={dashboardData.enrollment.id} />` as the first child of
`<main>` in the **normal branch**, and directly above `<PreStartDashboard>` in the
**pre-start branch** (students waiting on a cohort start are exactly who benefits).
**Skip the `ABANDONED` branch** — a removed student gets no practice tab. Change
nothing else in that file: no refactor, no reordering, no extraction.

### Step 9 — Practice pages

`dashboard/practice/page.tsx`:
- `auth()` guard → `redirect("/login")`.
- Fetch in one `Promise.all`: `getUserWithProfile`, `getUserActiveEnrollments`,
  `isUserRegistered`, `getPracticeOverview(userId)`. Do **not** call
  `getDashboardData` — it pulls every submission for the heatmap and none of it is
  needed here.
- No profile → `redirect("/register")`, matching the dashboard.
- Render `<AppHeader>` (same props as the dashboard; every prop but `user` is
  optional, so pass the first active enrollment or omit), `<DashboardTabs>`, a
  practice-score summary card, then `<PracticeTrackList>`.

`dashboard/practice/[slug]/page.tsx`:
- Resolve the problem by slug; `notFound()` when missing or `isActive === false`.
- Render statement / input format / output format / constraints as markdown, plus
  `<PracticeProblemWorkspace>` with the props listed in Section 5.

`practice-problem-workspace.tsx`:
- Editor: `@uiw/react-codemirror` + `@codemirror/lang-python`. Verify the React 19
  peer range at install time; if it is unmet, fall back to the raw `codemirror`
  package behind a small local wrapper rather than forcing the install.
- Two buttons: **Run** (sample cases only, no server call) and **Submit** (all
  cases, then the server action). Disable both while `status !== "ready"`.
- After Submit, render the returned solve state: score awarded, and when the daily
  synergy cap was hit, say so plainly — "Solved. Daily synergy cap reached, so no
  points this time; your practice score still counts."

### Step 10 — Content and seed

`prisma/content/practice/*.json` shape:

```json
{
  "track": { "slug": "python", "title": "Python", "description": "…", "sortOrder": 1 },
  "topic": { "slug": "introduction", "title": "Introduction", "description": "…", "sortOrder": 1 },
  "problems": [
    {
      "slug": "py-intro-greeting",
      "title": "Greeting Line",
      "difficulty": "EASY",
      "maxScore": 10,
      "sortOrder": 1,
      "statement": "…markdown…",
      "inputFormat": "…",
      "outputFormat": "…",
      "constraints": "…",
      "starterCode": "…",
      "testCases": [
        { "ordinal": 1, "isSample": true, "input": "…", "expected": "…", "explanation": "…" },
        { "ordinal": 2, "isSample": false, "input": "…", "expected": "…" }
      ]
    }
  ]
}
```

Author these ten problems — all `EASY`, matching how HackerRank's own warm-up
sections are graded:

**Python → Introduction:** `py-intro-greeting` (10), `py-intro-arithmetic` (10),
`py-intro-division` (10), `py-intro-loops` (10), `py-intro-leap-year` (15).

**Problem Solving → Warmup:** `ps-warmup-array-sum` (10),
`ps-warmup-sign-ratios` (15), `ps-warmup-staircase` (10),
`ps-warmup-subset-extremes` (20), `ps-warmup-tallest-candles` (15).

Each problem gets ≥ 4 test cases, at least one `isSample: true`.

**Copyright — non-negotiable.** These are classic exercise *concepts* (leap year,
prefix sums, staircase printing). Write every statement, sample dataset, variable
name, and title from scratch. Do not copy, paraphrase, or fetch any text, test data,
or problem title from HackerRank or any other platform.

`prisma/seed-practice.ts` follows `prisma/seed-hackathon-problems.ts`: log the target
`DATABASE_URL` host first, upsert track by `slug`, topic by `(trackId, slug)`,
problem by `slug`, test case by `(problemId, ordinal)`. Fully idempotent — re-running
must not duplicate rows or disturb existing `PracticeSolve` rows.

### Step 11 — Admin visibility

`get-student-detail.ts`: add to the existing `select` the student's 25 most recent
`practiceAttempts` (`id, problemId, status, testsPassed, testsTotal, flagged, flagReason, createdAt`
plus `problem: { select: { title: true, slug: true } }`) and their `practiceSolves`
count. Keep using `select` — no full-record returns.

`admin/students/[id]/page.tsx`: add one `Practice` tab to the existing `<Tabs>`
listing those attempts, flagged rows visually marked, with source code in a
collapsed `<details>`. Read-only — no admin mutations in this plan.

## 7. DB safety

This plan adds tables. Before any migration:

1. Commit all work in progress; the tree must be clean. **Record the commit hash in
   the PR description.**
2. Take a Neon branch snapshot of production (`main`) and note the branch name.
3. `npx prisma migrate dev --name practice_modules` against the **development**
   database only. Never `migrate deploy` to production from a local shell — that is
   the deploy pipeline's job (`build:deploy`).
4. `npx prisma generate`.
5. `npm run db:seed:practice` against development. Confirm 2 tracks, 2 topics,
   10 problems, ≥ 40 test cases.
6. Re-run `npm run db:seed:practice` and confirm the counts are unchanged
   (idempotency check).

All five new tables are additive with no foreign keys into `Enrollment`,
`Submission`, or `Certificate`, so the migration cannot affect live challenge data.
The only write path touching existing tables is the synergy increment, which reuses
`SynergyEvent` (free-form `type` column) and `StudentProfile.synergyPoints`.

## 8. Guardrails for Cursor (DO NOT)

- **DO NOT** add `src/app/dashboard/layout.tsx`. See Step 8 for why the tab bar
  lives in the pages.
- **DO NOT** refactor, reorder, or "clean up"
  [src/app/dashboard/page.tsx](../../src/app/dashboard/page.tsx). The only edit is
  inserting `<DashboardTabs>` in two branches. It is a live production page.
- **DO NOT** import anything from `@/lib/*` into `middleware.ts` or `auth.config.ts`,
  and do not add practice routes to middleware. `/dashboard/practice` inherits the
  existing `/dashboard` protection.
- **DO NOT** put `requireRole` / `requireAdmin` on any public surface. The new
  practice routes are student surfaces behind the normal `auth()` check.
- **DO NOT** trust any client-reported field. Status, `testsTotal`, score, and
  synergy are all derived server-side (Step 6).
- **DO NOT** award synergy outside a transaction, and do not award it twice for the
  same `(userId, problemId)`.
- **DO NOT** add a `CertificateType` enum value, a certificate template, or a
  leaderboard. Explicitly out of scope for v1.
- **DO NOT** run Pyodide on the main thread, and do not ship a run path without the
  terminate-on-timeout branch.
- **DO NOT** use a floating Pyodide CDN URL; pin the version in `constants.ts`.
- **DO NOT** add a server-side code runner, Judge0/Piston client, Docker, or any
  API route that executes code.
- **DO NOT** create abstraction files beyond the Section 4 list — no
  `practice-utils.ts`, no barrel `index.ts`, no generic `<CodeEditor>` wrapper.
- **DO NOT** use `<Button asChild>` or `<Button render={<Link>}>`; put
  `buttonVariants` on the `<Link>` (Base UI button semantics).
- **DO NOT** use `console.error`; use `lib/logger.ts`.
- **DO NOT** use `any`, and do not return full Prisma records — every query uses
  `select`.
- **DO NOT** copy problem text, titles, or test data from HackerRank or any other
  platform.
- If a build error contradicts an assumption in this plan — CodeMirror peer deps,
  Turbopack worker handling, Pyodide typings — **trust the error**, gather data, and
  report back. Do not defend the plan's choice.

## 9. Verification

**Must pass:** `npm run build` (includes `prisma generate` + typecheck) and
`npm run lint`, both clean.

**Manual test path** (dev DB, seeded, signed in as a seeded student):

1. `/dashboard` renders exactly as before, with a new Overview/Practice tab bar under
   the header. Heatmap, today's task, stat cards, quiz sections all unchanged.
2. Practice tab → 2 tracks, 2 topics, 10 problems, all progress bars at 0%.
3. Open `py-intro-greeting`. The editor shows starter code; status reads
   "Preparing Python runtime…" then becomes ready.
4. **Run** with correct code → sample cases pass, no network request to the server
   action (check the Network tab).
5. **Submit** with correct code → all cases pass, score awarded, topic progress bar
   advances, a `SynergyEvent` with `type: "PRACTICE"` exists, and
   `StudentProfile.synergyPoints` incremented by 1.
6. **Submit the same problem again** → a second `PracticeAttempt` row, but still
   exactly one `PracticeSolve` and no additional synergy.
7. **Submit wrong output** → `WRONG_ANSWER`, per-case failures listed, no solve row.
8. **Submit `while True: pass`** → times out at ~5s, error surfaces, the tab stays
   responsive, and the next Run works (worker respawned).
9. **Submit `print("expected literal")` for a stdin problem** → row stored with
   `flagged = true` and `flagReason = "accepted without reading stdin"`.
10. **Solve 6 problems in one IST day** → the 6th shows the cap message,
    `PracticeSolve.synergyAwarded === 0`, `score` still counted, practice score still
    advanced.
11. Pre-start student (a CLAUDE enrollment before `startsAt`) sees the tab bar; an
    `ABANDONED` student does not.
12. Admin → student detail → Practice tab lists attempts with the flagged row marked.

**Exactly these files should have changed** — the Section 4 table, no more.
`git status` showing anything else means the plan was exceeded.

## 10. Commit message

```
feat(practice): HackerRank-style Python + Problem Solving modules on the dashboard

Adds a Practice tab at /dashboard/practice with tracks, topics, and problems
graded client-side by Pyodide (stdin/stdout diff, no server runner). Ships a
vertical slice: 2 topics, 10 original problems.

Integrity: server derives status and test totals, stores submitted source,
caps synergy-credited solves per IST day, and flags accepted solves that never
read stdin. Practice score is uncapped; synergy is not. No certificate in v1.
```
