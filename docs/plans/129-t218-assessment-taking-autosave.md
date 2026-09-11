# Plan 129 — T-218 Assessment taking with autosave and resume (R9, candidate side)

**Ticket:** T-218, `docs/ABTalks88.xlsx` → Team Execution Board row 43. Owner: Shivansh. Demo 1.
**Outcome:** "As a candidate, I take an assessment without losing answers, even if I close the browser."
**Covers:** TC-C-012, TC-C-013 (E2E Tests rows 12–13). Requirement Traceability R27, R28, R29.
**Depends on:** T-244 (plan 128, commit `0f7e19f9`), T-243 (plan 121). **Design:** T-203 — see §2.6.
**Blocks:** T-219 (integrity signals, "recorded as fact against the attempt").
**Status:** **shipped.** Implemented and on `master` in `cdaa8cf6`
("RECRUITER SIDE ASSESSMENT and Candidate side v1 — T-218, T-243, T244").
`src/features/assessment-attempts/{service,prisma-store}.ts`, the
`/assessments` and `/assessments/[assignmentId]` routes and migration
`20260911210000_assessment_answer` are all present;
`npm run test:assessment-attempts` is 29/29. The candidate take-and-submit flow
was exercised end to end on 2026-09-11 during TC-R-018 acceptance (plan 133).
*(This line previously read "plan only. No code written." — it was already false
when written.)*

> **Local prerequisites (same as plans 121 / 128):** `/hire` sign-in needs
> `ENABLE_RECRUITER_AUTH=true`, and **`.env.local` points at the production
> database** (`ep-young-shadow-amawetjy`, verified by row count in plans 114-A,
> 115 and 126). Read §7 before `next dev`, `prisma generate` or any test that
> touches a database.

### What the sources require (quoted, not paraphrased)

| Source | Text |
|---|---|
| DailyTask88, 10 Sep, Shivansh — **Test** | "Start an assessment, answer all four question types, close the browser mid-way, reopen on another device and confirm every answer is still there." |
| DailyTask88 — **Done** | "All four question types work, answers autosave and survive a device change, and duplicate submission is refused server-side." |
| Board row 43 — **What must be true** | "…Closing the browser and reopening - including on another expected device or session - restores every answer. Submission is idempotent and produces the appropriate result." |
| Board row 43 — **Manual test** | "…reopen on another device and confirm every answer is still there. Submit twice and confirm one result." |
| Board row 43 — **Regression guard** | "Answers must never live only in React state or localStorage." |
| **TC-C-012** "Assessment answers survive a device change" | Setup: an assigned assessment. Steps: 1. Start it and answer MCQ, multi-select, subjective and file-upload questions. 2. Close the browser mid-way. 3. Reopen on another device. **Expected: "Every answer is restored exactly."** |
| **TC-C-013** "Duplicate assessment submission is refused" | Setup: an in-progress assessment. Steps: 1. Submit the assessment. 2. Submit it again. **Expected: "One result exists; the second submission is refused server-side."** |
| Platform Readiness row 12 | "One result per attempt regardless of resubmission." |
| Architecture rule 2 | "Persistent business state lives in the database… assessment answers… survive refresh, sign-out and a device change." |
| Architecture rule 5 | "…assessment submission… safe under retry and duplication. Replay and concurrency tests produce exactly one effect each." |
| User Journey 5 | "Receive the assignment → read instructions → answer four question types → close the browser → resume on another device → submit → see the result" |
| UI-UX UX-04 (T-203) | "Candidate side: instructions, question types, autosave indicator, resume-later state, submission and result." — **Not Approved** |

### Decisions confirmed with the ticket owner (2026-09-11)

| # | Decision |
|---|---|
| **D-1** | After submitting, the candidate sees **"Submitted" only**. Score and pass/fail are recruiter-only: they never reach the candidate's page props, action responses or list. "See the result" in User Journey 5 is satisfied by the submitted state. |
| **D-2** | Automated evidence = **in-memory service tests + source scans**, mirroring the T-243/T-244 suites. The browser recording is the end-to-end evidence. The repo has no Playwright/Cypress and no local test database. Known gap: Postgres row-locking is argued in §5 step 5 and exercised manually (§8 step 9), not proven by an automated test. |
| **D-3** | Required questions **block submission** — client-side and server-side. |
| **D-4** | Add a **`/assessments` list page** and an **"Assessments" candidate sidebar link**. The bell shows only the latest 5 notifications (`FEED_LIMIT = 5`) and failed emails are never retried, so the notification alone is not a durable way back in. |
| **D-5** | Duration is **shown, not enforced**: chip reads "Suggested time: 30 minutes" (or "Untimed"). No countdown, no auto-submit, no proctoring (T-219). Per the ticket owner's stated preference. |

---

## 1. Goal

A shortlisted candidate who was assigned a recruiter's assessment opens it from
the notification or `/assessments`, reads the instructions, starts, answers all
four question types with every change **autosaved to the database**, can close
the browser and resume on any device with every answer restored exactly, and
submits **once** — the server scores it (MCQ only) onto the assignment row the
T-244 monitor already reads, and refuses any second submission.

## 2. Current behavior — verified, not taken from status lines

### 2.1 Schema audit — **GO**

Checked against `prisma/schema.prisma`, both migration files, **and** the generated
client (`node_modules/.prisma/client/schema.prisma`, which is byte-identical to the repo
schema except two whitespace-only lines in T-259's `OutboundDelivery`).

**T-243** — `20260911090000_recruiter_assessment_builder/migration.sql`

| Object | Verified columns / facts |
|---|---|
| enum `RecruiterAssessmentStatus` | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| enum `AssessmentQuestionType` | `MULTIPLE_CHOICE`, `PARAGRAPH`, `FILE_UPLOAD` |
| `RecruiterAssessment` | `id`, `organizationId`, `createdByUserId`, `title`, `subheading?`, `instructions?`, `status` (default DRAFT), `durationMinutes?` (null = untimed), `passMarkPercent` (default 60), `shortlistRefs text[]`, `publishedAt?`, `archivedAt?`, `createdAt`, `updatedAt` |
| `AssessmentQuestion` | `id`, `assessmentId` (FK cascade), `position` (unique per assessment), `type`, `title`, `helpText?`, `isRequired` (default true), `points` (default 1), `allowMultipleCorrect`, `maxWords?`, `uploadDestinationUrl?`, `sectionId?` (reserved, no FK) |
| `AssessmentQuestionOption` | `id`, `questionId` (FK cascade), `position` (unique per question), `body`, `isCorrect` |
| File storage | **None.** FILE_UPLOAD is `uploadDestinationUrl` (recruiter) + a link the candidate pastes. No blob/multipart code exists. |

**T-244** — `20260911180000_recruiter_assessment_assignment/migration.sql`

| Object | Verified |
|---|---|
| enum `AssessmentAssignmentStatus` | `ASSIGNED`, `STARTED`, `SUBMITTED` |
| `RecruiterAssessmentAssignment` — T-244 owns | `id`, `assessmentId`, `candidateUserId`, `candidateRef`, `assignedAt` |
| — **T-218 owns** | `status` (default ASSIGNED), `startedAt?`, `submittedAt?`, `scorePercent?`, `passed?` (+ auto `updatedAt`) |
| Constraints | unique `(assessmentId, candidateUserId)`; index `(candidateUserId, assignedAt DESC)`; index `(assessmentId, status)`; FK assessment **RESTRICT**; FK candidate **CASCADE** |

Nothing in the live schema contradicts plan 128 §10. **No parallel assignment table is added.**

### 2.2 What T-218 adds to the schema

One new table, T-218's own migration, keyed on `assignmentId` exactly as §10 asks:

| `AssessmentAnswer` | |
|---|---|
| `id` | cuid |
| `assignmentId` | FK → `RecruiterAssessmentAssignment`, **CASCADE** |
| `questionId` | FK → `AssessmentQuestion`, **RESTRICT** |
| `selectedOptionIds text[]` | MULTIPLE_CHOICE only — option ids |
| `text?` | PARAGRAPH only — stored exactly as typed |
| `fileUrl?` | FILE_UPLOAD only — an http(s) link |
| `createdAt`, `updatedAt` | |
| unique `(assignmentId, questionId)` · index `(questionId)` | |

**No column is added to `RecruiterAssessmentAssignment`.** Prisma needs a back-relation
field (`answers AssessmentAnswer[]`) on it and on `AssessmentQuestion`; those are
virtual and generate no SQL.

### 2.3 Contract check against plan 128 §10 — two refinements, no redesign

§10's guards are kept verbatim. Two implementation details are called out so T-244's
owner can object before merge:

- **R1 — submit is one interactive transaction, not one statement.** §10 writes
  "`updateMany` … → `status: SUBMITTED, submittedAt, scorePercent, passed`". This plan
  runs, inside one transaction: (a) the **same guarded `updateMany`** flipping to
  `SUBMITTED` + `submittedAt` — `count 0` → refuse; (b) read the answers **under the row
  lock (a) just took**; (c) score; (d) write `scorePercent` + `passed`. Same guard, same
  single result, and the score can never miss an autosave that raced the submit. If the
  required-question check fails, the transaction throws and **the flip rolls back**.
  Nobody outside the transaction can ever observe `SUBMITTED` without a score.
- **R2 — autosave takes the same row lock first.** Each save starts with a no-op guarded
  `updateMany` (`where { id, candidateUserId, status: "STARTED" }` → `status: "STARTED"`).
  It writes only a T-218-owned column (to its current value), and it serializes saves
  against submit, so **no answer can land after a submission**.

### 2.4 Verified code facts

- `candidateAssessmentHref(assignmentId)` returns `` `/assessments/${assignmentId}` ``
  (`src/features/recruiter-assessments/service.ts:170`). The T-244 notifier stores it:
  `href: candidateAssessmentHref(assignmentId)` (`recruiter-assessment-actions.ts:142`).
- **Bell:** `notification-provider.tsx:351` renders a relative href as a Next `<Link>`, so
  `/assessments/<id>` opens in-app on any device. It shows only the **latest 5**
  (`get-notifications.ts:19`) — hence D-4.
- **Email:** `template-renderer.ts` renders `{{baseUrl}}{{href}}` with
  `baseUrl = NEXT_PUBLIC_APP_URL || "https://abtalks.in"`, so the email link works. Failed
  emails are never retried (no cron for `retryFailedDeliveries`).
- **Recruiter monitor** (`src/app/hire/assessments/[assessmentId]/page.tsx`) already maps
  ASSIGNED/STARTED/SUBMITTED → "Not started / In progress / Completed", shows
  `startedAt`, `submittedAt`, `scorePercent` and Passed/Failed/"Awaiting result". The list
  page counts Students/Passed/Failed. **T-218 filling the columns makes those real; no
  recruiter file changes.**
- **Middleware** (`middleware.ts:55`): `/assessments` is **not** in `protectedPaths`.
  Adding the plain string sends a signed-out candidate to `/login?from=/assessments/<id>`
  (the candidate door; only `/hire` and `/talent` go to `/talent/login`).
- **Candidate page pattern** (`src/app/jobs/[id]/page.tsx`): `auth()` →
  `redirect("/login")` → `DashboardShell user isAdmin showSectionNav={false}` → `<main>`.
  Production sign-in is Google OAuth only, so "another device" = the same Google account.
- **Writes:** `writeClient()` (`src/lib/db.ts:32`) returns the direct Neon endpoint while
  dual-write is on (it is, in production). Its doc comment: "Interactive transactions /
  SAVEPOINT dual-write must use the Neon session (direct) endpoint". The closest analog,
  `features/quiz/submit-quiz.ts`, uses `writeClient().$transaction`. T-218 follows it.
- **No E2E harness:** `package.json` has no Playwright/Cypress/Vitest/Jest. All 42 `test:*`
  scripts are `tsx` scripts. No local Postgres test setup exists on the dev machine — hence D-2.

### 2.5 `CandidateAssessmentScreen` — the real candidate UI, with three blockers

`src/components/hire/assessment/candidate-assessment-screen.tsx` is the screen the builder
preview mounts (`assessment-builder.tsx:332`, `<CandidateAssessmentScreen draft={previewDraft} readOnly />`).
It is the only importer. T-218 extends it; **no second candidate screen is built**. As-is,
it cannot be mounted for a candidate:

1. **It would ship the answer key.** Its prop type is `AssessmentDraft`
   (= the builder's Zod input), whose MCQ options carry `isCorrect`. A server page
   passing that shape would serialize the correct answers into the RSC payload. → The prop
   becomes a structural *subset* type with no `isCorrect` (the builder's draft still fits
   it, so **the builder file does not change**), and the candidate query never selects
   `isCorrect` at all.
2. **Answers can't persist.** Answers live in `useState` keyed by question *index*, options
   by *position* (`String(oi)`), and Submit is hard-coded `disabled`. → Answers become
   controlled, keyed by question id and option id (index fallback kept for the preview).
3. **It would render unstyled at `/assessments`.** Its rules (`.hire-cand-assess*`,
   `hire-scout.css` from `.hire-cand-assess__banner` to `.hire-cand-assess__submit`) load
   only through `src/app/hire/layout.tsx`, and four of them use `var(--h-primary)` with no
   fallback — a token defined only on `.hire-app`. The file-upload input also borrows the
   builder's `.hire-assess-field`. → Move the block into a stylesheet the component
   imports itself (precedent: `profile-wizard.tsx` imports `./profile-wizard.css`), add
   light fallbacks, and give the file input its own class.

**Security, found while auditing:** Zod 4.3.6 `z.string().url()` **accepts**
`javascript:alert(document.cookie)` and `data:text/html,<script>…` (tested). T-243's
builder validates `uploadDestinationUrl` with exactly that, and the screen renders it as
`<a href>`. Today only the recruiter's own preview renders it; **T-218 is what puts it in
front of candidates.** → The screen renders the destination as a link only when it is
http(s); candidate `fileUrl` answers are http(s)-only on write.

### 2.6 T-203 design is not approved

UI-UX UX-04 is "Not Approved". T-218 builds the states it names — instructions, question
types, autosave indicator, resume-later, submission and submitted — on the existing
screen's visual language, and re-skins when UX-04 is approved. Flag this in the PR.

## 3. Files to touch

**Schema**
- `prisma/schema.prisma` [edit] — model `AssessmentAnswer`; back-relation fields `answers`
  on `RecruiterAssessmentAssignment` and `AssessmentQuestion` (virtual, no column).
- `prisma/migrations/20260911210000_assessment_answer/migration.sql` [new] — creates-only.

**Shared**
- `src/lib/validations/assessment.ts` [edit] — answer schemas + three pure helpers used by
  both the screen and the server (`countWords`, `isHttpUrl`, `isAnswerComplete`).

**Server**
- `src/features/assessment-attempts/service.ts` [new] — store-injectable candidate service
  + pure scoring. No Prisma import.
- `src/features/assessment-attempts/prisma-store.ts` [new] — the real store.
- `src/features/assessment-attempts/assessment-attempts.test.ts` [new] — in-memory suite +
  source scans.
- `src/app/actions/assessment-attempt-actions.ts` [new] — start / save / submit actions.

**Routes**
- `src/app/assessments/page.tsx` [new] — Server. The candidate's own assignments.
- `src/app/assessments/[assignmentId]/page.tsx` [new] — Server. Instructions → taking →
  submitted.
- `middleware.ts` [edit] — `"/assessments"` in `protectedPaths` (**edge path — string only**).

**Components**
- `src/components/assessments/assessment-attempt.tsx` [new] — Client. Owns the autosave
  queue, start/submit calls and the save indicator; renders `CandidateAssessmentScreen`.
- `src/components/hire/assessment/candidate-assessment-screen.tsx` [edit] — candidate
  stages, controlled answers by id, submit, http(s) link guard, own stylesheet.
- `src/components/hire/assessment/candidate-assessment-screen.css` [new] — the moved
  `.hire-cand-assess*` block + rules for the new states.
- `src/components/hire/assessment/assessment-types.ts` [edit] — `CandidateAssessmentView`,
  `CandidateQuestion`, `CandidateAnswer` (types only).
- `src/app/hire/hire-scout.css` [edit] — **remove** the moved `.hire-cand-assess*` block.
- `src/components/dashboard-hub/nav-items.ts` [edit] — `"clipboard"` icon key + the
  "Assessments" item.
- `src/components/dashboard-hub/dashboard-sidebar.tsx` [edit] — map `clipboard` →
  `ClipboardCheck`.

**Tests / config / docs**
- `src/features/hire/isolation.test.ts` [edit] — two source-scan suites (page, middleware).
- `package.json` [edit] — `test:assessment-attempts` script.
- `docs/CHANGELOG.md` [edit] — one line under `## Pending reconcile`.

**Explicitly NOT touched:** `assessment-builder.tsx`, `question-editor.tsx`,
`assessment-assign-panel.tsx`, `src/app/hire/create-test/page.tsx`, everything under
`src/app/hire/assessments/`, `src/features/recruiter-assessments/*`,
`src/app/actions/recruiter-assessment-actions.ts`, `hire-chrome.tsx`,
`src/app/hire/layout.tsx`, everything under `src/features/notification/`, `src/auth.ts`,
`src/auth.config.ts`, `src/components/ui/*`, `prisma/cleanup.ts` (answers cascade from the
assignments it already deletes — see §7), `src/app/dashboard/loading.tsx`,
`src/features/dashboard/hub-search-index.ts` (it reads `NAV_ITEMS`, so "Assessments"
becomes searchable with no edit).

## 4. Server vs Client

| File | Boundary | Notes |
|---|---|---|
| `src/app/assessments/page.tsx` | **Server** | Renders rows itself; formats dates with `formatDateIST` on the server. No client component. |
| `src/app/assessments/[assignmentId]/page.tsx` | **Server** | `auth()` + `loadAttempt`. Passes `AssessmentAttempt` **plain JSON only** (below). |
| `assessment-attempt.tsx` | **Client** | `"use client"`. Calls the three actions; passes callbacks to the screen (Client→Client — fine). |
| `candidate-assessment-screen.tsx` | **Client** | Already `"use client"`. Still mounted by the builder (Client→Client). |
| `service.ts`, `prisma-store.ts` | **Server only** | `import "server-only"` at the top of both. |
| `assessment-attempt-actions.ts` | **Server** (`"use server"`) | Every export async. Helpers not exported. |
| `validations/assessment.ts`, `assessment-types.ts` | shared | Zod, constants, pure functions, types. No server-only imports. |
| `nav-items.ts` / `dashboard-sidebar.tsx` | shared / Client | Icons stay inside the client sidebar's `ICON_MAP`; `nav-items.ts` carries string keys only (existing pattern). |

**Server→Client props for `AssessmentAttempt`** — strings, numbers, booleans, plain objects:

```ts
type AssessmentAttemptProps = {
  assignmentId: string;
  status: "ASSIGNED" | "STARTED" | "SUBMITTED";
  submittedAtLabel: string | null;          // formatDateTimeIST on the server
  view: CandidateAssessmentView;            // ids, no isCorrect
  initialAnswers: Record<string, CandidateAnswer>; // keyed by question id
};
```

No `Date`, no function, no Lucide component crosses. **No `isCorrect`, `scorePercent` or
`passed`** — not in the props, not in any action response (D-1).

## 5. Steps

### Step 1 — Schema (`prisma/schema.prisma`)

Add after `RecruiterAssessmentAssignment`:

```prisma
/// T-218: one candidate's answer to one question on one assignment.
///
/// Written only while the assignment is STARTED: every save first takes the
/// assignment row lock with a guarded no-op update, so no answer can land after
/// a submission. Frozen once the assignment is SUBMITTED.
/// ABTalks stores no files — FILE_UPLOAD answers are a link the candidate pasted.
///
/// CASCADE on the assignment: answers go with the attempt they belong to.
/// RESTRICT on the question: a PUBLISHED assessment's questions never change
/// (saveAssessmentDraft is DRAFT-only and a DRAFT has no assignments), so this
/// never blocks a real delete; it stops an answer silently losing its question.
model AssessmentAnswer {
  id                String   @id @default(cuid())
  assignmentId      String
  questionId        String
  /// MULTIPLE_CHOICE only. AssessmentQuestionOption ids, stable once published.
  selectedOptionIds String[] @default([])
  /// PARAGRAPH only. Stored exactly as typed — never trimmed.
  text              String?
  /// FILE_UPLOAD only. An http(s) link. Null = cleared.
  fileUrl           String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  assignment RecruiterAssessmentAssignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  question   AssessmentQuestion            @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([assignmentId, questionId])
  @@index([questionId])
}
```

Back-relations (virtual — **no column**):
- in `RecruiterAssessmentAssignment`, after `candidate`: `answers AssessmentAnswer[]`
- in `AssessmentQuestion`, after `options`: `answers AssessmentAnswer[]`

`npx prisma format` then `npx prisma validate`. If `format` realigns any model this plan
does not touch, revert those lines (plan 128 hit this with `OutboundDelivery`).
`npx prisma generate` — offline, writes `node_modules` only.

### Step 2 — Migration

Offline, exactly as plan 128 did (bash — PowerShell 5.1 `>` writes UTF-16):

```bash
git show HEAD:prisma/schema.prisma > "$TMP/schema.before.prisma"
mkdir -p prisma/migrations/20260911210000_assessment_answer
npx prisma migrate diff \
  --from-schema-datamodel "$TMP/schema.before.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260911210000_assessment_answer/migration.sql
```

It must contain exactly: one `CREATE TABLE "AssessmentAnswer"`, one `CREATE UNIQUE INDEX`
(`assignmentId`, `questionId`), one `CREATE INDEX` (`questionId`), two `ADD CONSTRAINT …
FOREIGN KEY` (assignment `ON DELETE CASCADE`, question `ON DELETE RESTRICT`). **No
`CREATE TYPE`, no `DROP`, no `ALTER COLUMN`, no other table.** Otherwise stop and report.
Confirm `20260911210000` is unused and sorts after `20260911180000`.

### Step 3 — Shared validation + helpers (`src/lib/validations/assessment.ts`)

Append:

```ts
/** Longest paragraph answer stored, in characters. The word cap is per question
 *  and is enforced at submit, so nothing a candidate types is ever refused. */
export const MAX_ANSWER_CHARS = 20_000;
export const MAX_ANSWER_URL_CHARS = 2_000;

/** One definition, so the screen's counter and the server's cap agree. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** http(s) only. Zod 4's .url() also accepts javascript: and data: URLs. */
export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const answerPayloadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("choice"),
      selectedOptionIds: z.array(z.string().min(1).max(64)).max(12),
    })
    .strict(),
  z
    .object({
      kind: z.literal("text"),
      text: z.string().max(MAX_ANSWER_CHARS), // NOT trimmed: restored exactly
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      fileUrl: z.union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(MAX_ANSWER_URL_CHARS)
          .refine(isHttpUrl, "Paste a full link starting with https://"),
      ]),
    })
    .strict(),
]);
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

export const attemptActionSchema = z.object({
  assignmentId: z.string().min(1).max(64),
});

export const saveAnswerSchema = attemptActionSchema.extend({
  questionId: z.string().min(1).max(64),
  answer: answerPayloadSchema,
});

/** Whether an answer satisfies a required question. Shared by the screen's
 *  "N required left" hint and the server's submit check. */
export function isAnswerComplete(
  type: "MULTIPLE_CHOICE" | "PARAGRAPH" | "FILE_UPLOAD",
  answer: AnswerPayload | undefined,
): boolean {
  if (!answer) return false;
  if (type === "MULTIPLE_CHOICE") {
    return answer.kind === "choice" && answer.selectedOptionIds.length > 0;
  }
  if (type === "PARAGRAPH") {
    return answer.kind === "text" && answer.text.trim().length > 0;
  }
  return answer.kind === "file" && isHttpUrl(answer.fileUrl);
}
```

No existing export in the file changes. (Tightening the builder's own
`uploadDestinationUrl` to http(s) is T-243's call — see §11.)

### Step 4 — Service (`src/features/assessment-attempts/service.ts`)

`import "server-only"`. Imports from `@/lib/validations/assessment` and **type-only**
imports of `CandidateAssessmentView` / `CandidateAnswer` from
`@/components/hire/assessment/assessment-types`.

**Types (exported):**

```ts
export type AttemptStatus = "ASSIGNED" | "STARTED" | "SUBMITTED";
type QuestionType = "MULTIPLE_CHOICE" | "PARAGRAPH" | "FILE_UPLOAD";

/** A question as the candidate may see it. NO isCorrect — ever. */
export type AttemptQuestionRow = {
  id: string;
  position: number;
  type: QuestionType;
  title: string;
  helpText: string | null;
  isRequired: boolean;
  points: number;
  allowMultipleCorrect: boolean;
  maxWords: number | null;
  uploadDestinationUrl: string | null;
  options: { id: string; position: number; body: string }[];
};

export type AnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  text: string | null;
  fileUrl: string | null;
};

/** The candidate's own assignment. NO scorePercent, NO passed (D-1). */
export type AttemptRow = {
  assignmentId: string;
  status: AttemptStatus;
  startedAt: Date | null;
  submittedAt: Date | null;
  assessment: {
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    title: string;
    subheading: string | null;
    instructions: string | null;
    durationMinutes: number | null;
    passMarkPercent: number;
  };
  questions: AttemptQuestionRow[];
  answers: AnswerRow[];
};

export type AttemptListRow = {
  assignmentId: string;
  title: string;
  status: AttemptStatus;
  assignedAt: Date;
  submittedAt: Date | null;
  durationMinutes: number | null;
  questionCount: number;
};

/** What is written for one answer — exactly one of the three is meaningful. */
export type AnswerValue = {
  selectedOptionIds: string[];
  text: string | null;
  fileUrl: string | null;
};

/** Read inside the submit transaction only — this is where isCorrect lives. */
export type GradeQuestion = {
  id: string;
  type: QuestionType;
  points: number;
  isRequired: boolean;
  maxWords: number | null;
  correctOptionIds: string[];
};
export type FinishInput = {
  questions: GradeQuestion[];
  answers: AnswerRow[];
  passMarkPercent: number;
};
export type FinishResult =
  | { ok: true; scorePercent: number; passed: boolean }
  | { ok: false; missingRequired: number; overLimit: number };

export type AttemptStore = {
  /** Only when candidateUserId owns it. Never selects isCorrect/scorePercent/passed. */
  findAttempt(assignmentId: string, candidateUserId: string): Promise<AttemptRow | null>;
  /** This candidate's assignments on PUBLISHED assessments, newest first. */
  listAttempts(candidateUserId: string): Promise<AttemptListRow[]>;
  /** ASSIGNED → STARTED in one guarded write. False when nothing moved. */
  start(assignmentId: string, candidateUserId: string, at: Date): Promise<boolean>;
  /** Upsert one answer under the row lock, only while STARTED. */
  saveAnswer(
    assignmentId: string,
    candidateUserId: string,
    questionId: string,
    value: AnswerValue,
  ): Promise<"SAVED" | "NOT_OPEN">;
  /** Guarded flip, read answers under the lock, finish(), write the score.
   *  finish() returning ok:false rolls the flip back. */
  submit(
    assignmentId: string,
    candidateUserId: string,
    at: Date,
    finish: (input: FinishInput) => FinishResult,
  ): Promise<
    | { outcome: "SUBMITTED" }
    | { outcome: "NOT_OPEN" }
    | { outcome: "INCOMPLETE"; missingRequired: number; overLimit: number }
  >;
};
```

`Result<T>` / `OK` / `NOT_FOUND` / `INVALID` / `CONFLICT` — copy the pattern from
`recruiter-assessments/service.ts` (not exported there, so redeclare locally).

**Pure helpers (exported for the tests):**

- `toCandidateAnswer(type, row: AnswerRow | undefined): CandidateAnswer | undefined` —
  MCQ → `{ kind: "choice", selectedOptionIds: row.selectedOptionIds }`; PARAGRAPH →
  `{ kind: "text", text: row.text ?? "" }`; FILE_UPLOAD → `{ kind: "file", fileUrl: row.fileUrl ?? "" }`;
  no row → `undefined`.
- `finishAttempt(input: FinishInput): FinishResult`:
  1. `byQuestion = new Map(answers by questionId)`.
  2. `missingRequired` = required questions where
     `!isAnswerComplete(q.type, toCandidateAnswer(q.type, byQuestion.get(q.id)))`.
  3. `overLimit` = PARAGRAPH questions whose saved text has
     `countWords(text) > (q.maxWords ?? MAX_PARAGRAPH_WORDS)`.
  4. Either > 0 → `{ ok: false, missingRequired, overLimit }`.
  5. Score, per plan 128 §10: over MCQs with `points > 0`, `total += points`;
     a question earns its points only when the **selected set equals the correct set**
     (sizes equal and every correct id picked; an empty correct set never earns). Single-
     and multi-select use the same rule. PARAGRAPH and FILE_UPLOAD are excluded.
  6. `scorePercent = total === 0 ? 0 : Math.round((100 * earned) / total)`;
     `passed = scorePercent >= passMarkPercent`.
- `incompleteMessage(missingRequired, overLimit): string` — exact copy:
  - missing only: `` `Answer the ${n} required question${n === 1 ? "" : "s"} left before submitting.` ``
  - over only: `` `Shorten ${m} answer${m === 1 ? "" : "s"} over the word limit before submitting.` ``
  - both: `` `Answer the ${n} required question${…} left and shorten ${m} answer${…} over the word limit before submitting.` ``

**Service functions:**

```ts
export async function loadAttempt(store, candidateUserId, assignmentId): Promise<Result<{
  assignmentId: string; status: AttemptStatus; submittedAt: Date | null;
  view: CandidateAssessmentView; answers: Record<string, CandidateAnswer>;
}>>
```
1. `row = await store.findAttempt(assignmentId, candidateUserId)`.
2. `!row || row.assessment.status !== "PUBLISHED"` → `NOT_FOUND("Assessment not found")`.
3. Build `view` **field by field** — no spread of `row` or of a question/option:
   `title`, `subheading`, `instructions`, `durationMinutes`, `passMarkPercent`, and each
   question → `{ id, type, title, helpText, isRequired, points, … }` by type (MCQ adds
   `allowMultipleCorrect` and `options: [{ id, body }]`; PARAGRAPH adds `maxWords`;
   FILE_UPLOAD adds `uploadDestinationUrl`).
4. `answers` = `toCandidateAnswer` for every question that has a row, keyed by question id.

```ts
export async function startAttempt(store, candidateUserId, input: unknown): Promise<Result<{ alreadyStarted: boolean }>>
```
1. `attemptActionSchema.safeParse` → `INVALID("Invalid input")`.
2. `findAttempt`; missing or not PUBLISHED → `NOT_FOUND`.
3. `SUBMITTED` → `CONFLICT("You've already submitted this assessment.")`.
4. `STARTED` → `OK({ alreadyStarted: true })` — no write.
5. `moved = await store.start(id, candidateUserId, new Date())`. `false` → re-read:
   `STARTED` → `OK({ alreadyStarted: true })`; `SUBMITTED` → the step-3 CONFLICT; else `NOT_FOUND`.
6. `OK({ alreadyStarted: false })`.

```ts
export async function saveAnswer(store, candidateUserId, input: unknown): Promise<Result<{ savedAt: Date }>>
```
1. `saveAnswerSchema.safeParse` → `INVALID(first issue message)`.
2. `findAttempt`; missing or not PUBLISHED → `NOT_FOUND`.
3. `SUBMITTED` → `CONFLICT("This assessment has been submitted — answers can no longer change.")`;
   `ASSIGNED` → `CONFLICT("Start the assessment before answering.")`.
4. `q = row.questions.find(id === questionId)`; missing → `NOT_FOUND("Question not found")`.
5. Match kind to type, else `INVALID("That answer doesn't match this question type.")`:
   - MCQ + `choice`: `ids = [...new Set(selectedOptionIds)]`; any id not in `q.options` →
     `INVALID("That option isn't part of this question.")`; `!q.allowMultipleCorrect && ids.length > 1`
     → `INVALID("Pick one option for this question.")`. Value `{ selectedOptionIds: ids, text: null, fileUrl: null }`.
   - PARAGRAPH + `text`: value `{ selectedOptionIds: [], text, fileUrl: null }`. **No
     word-cap check here** — an over-limit draft is saved, not lost; submit refuses it.
   - FILE_UPLOAD + `file`: value `{ selectedOptionIds: [], text: null, fileUrl: fileUrl === "" ? null : fileUrl }`.
6. `res = await store.saveAnswer(…)`; `"NOT_OPEN"` → re-read: `SUBMITTED` → the step-3
   submitted CONFLICT, else `NOT_FOUND`.
7. `OK({ savedAt: new Date() })`.

```ts
export async function submitAttempt(store, candidateUserId, input: unknown): Promise<Result<{ submittedAt: Date }>>
```
1. `attemptActionSchema.safeParse` → `INVALID("Invalid input")`.
2. `findAttempt`; missing or not PUBLISHED → `NOT_FOUND`.
3. `SUBMITTED` → `CONFLICT("This assessment has already been submitted.")` — **the TC-C-013
   refusal**.
4. `at = new Date()`; `out = await store.submit(id, candidateUserId, at, finishAttempt)`.
5. `NOT_OPEN` → the step-3 CONFLICT (lost a race: someone else's submit won).
   `INCOMPLETE` → `INVALID(incompleteMessage(out.missingRequired, out.overLimit))`.
6. `OK({ submittedAt: at })` — **no score in the result (D-1).**

```ts
export async function listCandidateAttempts(store, candidateUserId): Promise<Result<AttemptListRow[]>>
```
`OK(await store.listAttempts(candidateUserId))`.

### Step 5 — Prisma store (`src/features/assessment-attempts/prisma-store.ts`)

`import "server-only"`; `import { prisma, writeClient } from "@/lib/db"`. **Reads use
`prisma`; every write uses `writeClient()`.** Every query has an explicit `select`.

**Guarded writes use scalar columns of `RecruiterAssessmentAssignment` only** —
`id`, `candidateUserId`, `status`. No relation filter (e.g. `assessment: { … }`) inside a
guarded `updateMany`'s `where`: Prisma may execute a relation-filtered `updateMany` as a
read followed by an update-by-id, which would lose the atomicity the guard exists for.
The PUBLISHED check is done by the service from `findAttempt`; nothing moves a PUBLISHED
assessment back (no unpublish exists; nothing writes ARCHIVED).

**`findAttempt(assignmentId, candidateUserId)`**

```ts
const a = await prisma.recruiterAssessmentAssignment.findFirst({
  where: { id: assignmentId, candidateUserId },
  select: {
    id: true, status: true, startedAt: true, submittedAt: true,
    assessment: {
      select: {
        status: true, title: true, subheading: true, instructions: true,
        durationMinutes: true, passMarkPercent: true,
        questions: {
          orderBy: { position: "asc" },
          select: {
            id: true, position: true, type: true, title: true, helpText: true,
            isRequired: true, points: true, allowMultipleCorrect: true,
            maxWords: true, uploadDestinationUrl: true,
            options: {
              orderBy: { position: "asc" },
              select: { id: true, position: true, body: true }, // NO isCorrect
            },
          },
        },
      },
    },
    answers: { select: { questionId: true, selectedOptionIds: true, text: true, fileUrl: true } },
  },
});
```
Map to `AttemptRow` (`assignmentId: a.id`, `questions: a.assessment.questions`, …). The
`where` carries `candidateUserId`, so a foreign id returns `null` — the non-enumeration rule.

**`listAttempts(candidateUserId)`** — `findMany` where
`{ candidateUserId, assessment: { status: "PUBLISHED" } }` (a plain read, so a relation
filter is fine here), `orderBy: { assignedAt: "desc" }`, select `id, status, assignedAt,
submittedAt` and `assessment: { select: { title, durationMinutes, _count: { select: { questions: true } } } }`.

**`start(assignmentId, candidateUserId, at)`**

```ts
const res = await writeClient().recruiterAssessmentAssignment.updateMany({
  where: { id: assignmentId, candidateUserId, status: "ASSIGNED" },
  data: { status: "STARTED", startedAt: at },
});
return res.count === 1;
```

**`saveAnswer(assignmentId, candidateUserId, questionId, value)`**

```ts
return writeClient().$transaction(async (tx) => {
  // Takes the assignment row lock and re-checks the guard in one statement.
  // A concurrent submit either committed first (this matches 0 rows) or waits
  // for this transaction to commit — so no answer can land after a submission.
  const open = await tx.recruiterAssessmentAssignment.updateMany({
    where: { id: assignmentId, candidateUserId, status: "STARTED" },
    data: { status: "STARTED" },
  });
  if (open.count !== 1) return "NOT_OPEN" as const;
  await tx.assessmentAnswer.upsert({
    where: { assignmentId_questionId: { assignmentId, questionId } },
    create: { assignmentId, questionId, ...value },
    update: { ...value },
    select: { id: true },
  });
  return "SAVED" as const;
});
```

**`submit(assignmentId, candidateUserId, at, finish)`**

```ts
class IncompleteSubmission extends Error {
  constructor(readonly missingRequired: number, readonly overLimit: number) {
    super("incomplete submission");
  }
}

try {
  return await writeClient().$transaction(async (tx) => {
    // The TC-C-013 guard (plan 128 §10). A second submit matches 0 rows.
    const flipped = await tx.recruiterAssessmentAssignment.updateMany({
      where: { id: assignmentId, candidateUserId, status: { in: ["ASSIGNED", "STARTED"] } },
      data: { status: "SUBMITTED", submittedAt: at },
    });
    if (flipped.count !== 1) return { outcome: "NOT_OPEN" as const };

    // Under the row lock the flip took: no save can land between this read and
    // the commit. The answer key is read here and nowhere else.
    const a = await tx.recruiterAssessmentAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        assessment: {
          select: {
            passMarkPercent: true,
            questions: {
              select: {
                id: true, type: true, points: true, isRequired: true, maxWords: true,
                options: { where: { isCorrect: true }, select: { id: true } },
              },
            },
          },
        },
        answers: { select: { questionId: true, selectedOptionIds: true, text: true, fileUrl: true } },
      },
    });
    const result = finish({
      passMarkPercent: a.assessment.passMarkPercent,
      answers: a.answers,
      questions: a.assessment.questions.map((q) => ({
        id: q.id, type: q.type, points: q.points, isRequired: q.isRequired,
        maxWords: q.maxWords, correctOptionIds: q.options.map((o) => o.id),
      })),
    });
    if (!result.ok) {
      // Throwing rolls the flip back: the attempt stays STARTED.
      throw new IncompleteSubmission(result.missingRequired, result.overLimit);
    }
    await tx.recruiterAssessmentAssignment.update({
      where: { id: assignmentId },
      data: { scorePercent: result.scorePercent, passed: result.passed },
      select: { id: true },
    });
    return { outcome: "SUBMITTED" as const };
  });
} catch (e) {
  if (e instanceof IncompleteSubmission) {
    return { outcome: "INCOMPLETE" as const, missingRequired: e.missingRequired, overLimit: e.overLimit };
  }
  throw e;
}
```

`isCorrect` appears in this file **only** inside `submit` (a source scan enforces it).

### Step 6 — Server actions (`src/app/actions/assessment-attempt-actions.ts`)

`"use server"`. Mirror `recruiter-assessment-actions.ts`'s envelope:
`{ ok: true, data } | { ok: false, message, status? }`.

- Local, not exported: `async function sessionUserId(): Promise<string | null>` →
  `(await auth())?.user?.id ?? null`. No session →
  `{ ok: false, message: "Please sign in to continue.", status: 401 }`.
- **The candidate is always the session user. No action reads a user id from its input.**
- `statusFor(code)`: `NOT_FOUND` → 404, `CONFLICT` → 409, `INVALID` → `undefined`.

| Export | Parse | Service | Success data | Revalidate |
|---|---|---|---|---|
| `startAssessmentAttemptAction(input: unknown)` | `attemptActionSchema` | `startAttempt` | `{ alreadyStarted }` | `/assessments`, `` `/assessments/${id}` `` |
| `saveAssessmentAnswerAction(input: unknown)` | `saveAnswerSchema` | `saveAnswer` | `{ savedAt: iso }` | none (hot path) |
| `submitAssessmentAttemptAction(input: unknown)` | `attemptActionSchema` | `submitAttempt` | `{ submittedAt: iso }` | `/assessments`, `` `/assessments/${id}` `` |

Each body is wrapped in try/catch → `logger.error("[assessment-attempt-actions] start|save|submit", { assignmentId, error: String(error) })`
and a fixed message (`"Couldn't start the assessment. Try again."`, `"Couldn't save that answer. Try again."`,
`"Couldn't submit. Your answers are saved — try again."`). **Never log answer contents.**
No `console.*`. No score in any response.

### Step 7 — `CandidateAssessmentView` types (`assessment-types.ts`)

Append (types only; existing exports unchanged):

```ts
import type { AnswerPayload } from "@/lib/validations/assessment";

/**
 * What CandidateAssessmentScreen renders. A structural SUBSET of the builder
 * draft, so the builder preview passes its draft unchanged. Deliberately has no
 * isCorrect: the candidate page builds it from a query that never selects it.
 * Ids are present for a real attempt and absent in the builder preview.
 */
export type CandidateOption = { id?: string; body: string };

type CandidateQuestionBase = {
  id?: string;
  title: string;
  helpText?: string | null;
  isRequired: boolean;
  points: number;
};

export type CandidateQuestion =
  | (CandidateQuestionBase & {
      type: "MULTIPLE_CHOICE";
      allowMultipleCorrect: boolean;
      options: CandidateOption[];
    })
  | (CandidateQuestionBase & { type: "PARAGRAPH"; maxWords?: number | null })
  | (CandidateQuestionBase & { type: "FILE_UPLOAD"; uploadDestinationUrl: string | null });

export type CandidateAssessmentView = {
  title: string;
  subheading?: string | null;
  instructions?: string | null;
  durationMinutes: number | null;
  passMarkPercent: number;
  questions: CandidateQuestion[];
};

/** One answer, in the exact shape the autosave action sends. */
export type CandidateAnswer = AnswerPayload;
```

`tsc` is what proves `previewDraft: AssessmentDraft` is still assignable — if it is not,
fix the new types, **never** the builder.

### Step 8 — Extend `CandidateAssessmentScreen` (`candidate-assessment-screen.tsx`)

1. `import "./candidate-assessment-screen.css";` at the top.
2. Replace the local `wordCount` with `countWords` from `@/lib/validations/assessment`;
   also import `isHttpUrl`, `isAnswerComplete`, `MAX_ANSWER_CHARS`.
3. **Props** — `draft` keeps its name (the builder passes `draft=`); its type becomes
   `CandidateAssessmentView`. Add, all optional:

   ```ts
   stage?: "preview" | "instructions" | "taking" | "submitted"; // default "preview"
   answers?: Record<string, CandidateAnswer>;        // controlled when present
   onAnswerChange?: (questionId: string, answer: CandidateAnswer) => void;
   questionErrors?: Record<string, string>;         // shown under that question
   statusSlot?: React.ReactNode;                    // the autosave indicator
   onStart?: () => void;
   onSubmit?: () => void;
   confirmingSubmit?: boolean;
   onConfirmSubmit?: () => void;
   onCancelSubmit?: () => void;
   submitBlockedReason?: string | null;
   busy?: boolean;
   submittedAtLabel?: string | null;
   ```
   `readOnly` stays as-is (it disables inputs). The builder passes `draft` + `readOnly`
   only, so it gets `stage="preview"` — **its behavior is unchanged**.
4. **Keys:** question key = `q.id ?? String(qi)`; option value = `opt.id ?? String(oi)`.
   DOM ids stay index-based (`cand-q${qi}-o${oi}`).
5. **Answers:** `const [local, setLocal] = useState<Record<string, CandidateAnswer>>({})`;
   `current = answers ?? local`; a change calls `onAnswerChange` when given, else updates
   `local`. Values are `CandidateAnswer`: radio → `{ kind: "choice", selectedOptionIds: [value] }`;
   checkbox → the full current set, never a delta; textarea → `{ kind: "text", text }`
   (untrimmed, `maxLength={MAX_ANSWER_CHARS}`); URL input → `{ kind: "file", fileUrl }`.
6. **Duration chip** in every stage: `durationMinutes == null ? "Untimed" :
   \`Suggested time: ${n} minute${n === 1 ? "" : "s"}\`` (D-5 — it is a guide, not a timer).
7. **Stages:**
   - `preview` — exactly as today: preview banner, disabled list, disabled Submit.
   - `instructions` — header + instructions, then "`{N} questions · {R} required`", the line
     "Your answers save automatically as you go. You can close this page and come back on
     any device.", and a **Start assessment** button (`onStart`, disabled while `busy`).
     **No question list** — questions stay unseen until Start.
   - `taking` — `statusSlot` rendered first (sticky), the question list enabled, then the
     submit area: if `confirmingSubmit`, the text "Submit your answers? You can't change
     them after this." with **Cancel** (`onCancelSubmit`) and **Submit** (`onConfirmSubmit`),
     both disabled while `busy`; otherwise **Submit assessment** (`onSubmit`) disabled when
     `busy || submitBlockedReason`, with `submitBlockedReason` printed beside it.
   - `submitted` — banner "Submitted {submittedAtLabel}. Your answers are with the
     recruiter." (**no score, no pass/fail** — D-1), the list disabled showing the
     candidate's answers, no submit area.
8. **File upload:** render "Open upload destination" as
   `<a target="_blank" rel="noopener noreferrer">` **only when**
   `q.uploadDestinationUrl && isHttpUrl(q.uploadDestinationUrl)`; otherwise the text
   "The recruiter's upload link isn't a valid web address — ask them for a new one." The
   URL input's label uses the new class `hire-cand-assess__field` (not `hire-assess-field`).
   When the input is non-empty and `!isHttpUrl(value.trim())`, show the hint
   "Paste a full link starting with https://".
9. **Paragraph:** counter uses `countWords`; the existing `is-over` class stays.
10. **Per-question error:** `questionErrors[key]` in a `<p className="hire-cand-assess__error">`,
    referenced from the input via `aria-describedby`.
11. **Never** `dangerouslySetInnerHTML`. Recruiter text (title, instructions, question,
    options) and candidate text render as React text.

### Step 9 — The attempt wrapper (`src/components/assessments/assessment-attempt.tsx`)

`"use client"`. Props from §4. Uses `useRouter`, `useState`, `useRef`, `useEffect`,
`useTransition`, `toast` from `sonner`. **All logic inline — no hook file.**

**Stage:** `ASSIGNED` → `"instructions"`, `STARTED` → `"taking"`, `SUBMITTED` → `"submitted"`
(held in state so it can move without waiting for a refresh).

**Start:** `startAssessmentAttemptAction({ assignmentId })` → ok → stage `"taking"`,
`router.refresh()`; `!ok` → `toast.error(res.message)` (a 409 also calls `router.refresh()`).

**Answers:** `useState(initialAnswers)`. **Never** `localStorage` / `sessionStorage`.

**Autosave queue** (refs; one in-flight save per tab, so saves reach the server in order):
- `pendingRef: Map<questionId, CandidateAnswer>` — the latest unsent value per question.
- `inFlightRef: boolean`, `timersRef: Map<questionId, timeout>`, `idleWaitersRef: (() => void)[]`.
- `onAnswerChange(qid, a)`: set local state; clear that question's error; then
  - `choice` → enqueue now;
  - `text` → enqueue after **800 ms** of no typing on that question;
  - `file` → if `a.fileUrl.trim() === ""` or `isHttpUrl(a.fileUrl.trim())`, enqueue after
    800 ms with the trimmed value; otherwise enqueue nothing (the screen shows the hint).
- `enqueue(qid, a)`: `pendingRef.set(qid, a)`; `flush()`.
- `flush()`: if `inFlightRef` or `pendingRef` is empty, return. Take the first entry, delete
  it, set `inFlightRef = true`, indicator `"saving"`, call
  `saveAssessmentAnswerAction({ assignmentId, questionId, answer })` in try/catch:
  - `ok` → indicator `"saved"` with the local time when nothing is pending.
  - `!ok && status === 409` → the attempt was submitted elsewhere: clear pending, stage
    `"submitted"`, `toast("This assessment was already submitted.")`, `router.refresh()`.
  - `!ok && status === 404` → `toast.error(res.message)`, `router.refresh()`.
  - `!ok` otherwise (INVALID) → set `questionErrors[qid] = res.message`; don't retry.
  - **throw** (network / server down) → put the value back **unless a newer one is already
    pending** for that question, indicator `"retrying"`, retry `flush()` after
    2 s, then 5 s, then every 10 s.
  - finally → `inFlightRef = false`; if pending is non-empty, `flush()` again; else resolve
    and clear `idleWaitersRef`.
- `waitForIdle(): Promise<void>` — flushes any debounce timers immediately, then resolves
  when pending is empty and nothing is in flight.
- `beforeunload`: when `pendingRef.size > 0 || inFlightRef`, `e.preventDefault()`.

**Indicator** (`statusSlot`, `role="status"`, `aria-live="polite"`,
class `hire-cand-assess__status`): idle "Your answers save automatically" · "Saving…" ·
"All answers saved · {h:mm a}" · "Couldn't save — retrying…".

**Submit:**
- `submitBlockedReason` computed from `view` + local answers with `isAnswerComplete` and
  `countWords`, using the same `incompleteMessage` wording as the server
  (reimplemented inline — the service is server-only).
- `onSubmit` → `setConfirming(true)`. `onConfirmSubmit` → in a transition:
  `await waitForIdle()`; if any question still has an error or the indicator is
  `"retrying"`, `toast.error("Some answers aren't saved yet — check your connection and try again.")`
  and stop. Otherwise `submitAssessmentAttemptAction({ assignmentId })`:
  - `ok` → stage `"submitted"`, `router.refresh()`.
  - `409` → `toast("This assessment was already submitted.")`, `router.refresh()`.
  - `!ok` → `toast.error(res.message)`, keep `confirming` false, stay in `"taking"`.

Render: `<CandidateAssessmentScreen draft={view} readOnly={stage !== "taking"} stage={stage} … />`.

### Step 10 — Styles

`src/components/hire/assessment/candidate-assessment-screen.css` [new]:
1. **Cut** from `src/app/hire/hire-scout.css` every rule from `.hire-cand-assess__banner {`
   through the end of `.hire-cand-assess__submit { … }` (they are contiguous; nothing else
   in the repo references `hire-cand-assess`), and paste them here **unchanged except**:
   - the four bare `var(--h-primary)` become `var(--h-primary, #03535F)` (the `.hire-app`
     light value, so `/hire` keeps its tokens in both themes and `/assessments` gets teal);
   - `.hire-cand-assess__submit` loses `opacity: 0.55; cursor: not-allowed;`, which move to
     a new `.hire-cand-assess__submit:disabled` rule (the button was never enabled before).
2. Add, reusing values already in these rules (no new colours):
   `.hire-cand-assess__field` (+ `input`) — copy the values of `.hire-assess-field` and its
   input rules from `hire-scout.css`; `.hire-cand-assess__status` —
   `position: sticky; top: 0; z-index: 5;` pill using the banner's radius, `#f5f5f4`
   background; `.hire-cand-assess__start`, `.hire-cand-assess__confirm`,
   `.hire-cand-assess__submitted` (the banner's shape), `.hire-cand-assess__error`
   (`#b91c1c`, 12px), `.hire-cand-assess__hint` (`var(--h-gray-500, #78716c)`, 12px).

Dark-mode styling on `/assessments` is left to T-203's approved design.

### Step 11 — Pages

**`src/app/assessments/[assignmentId]/page.tsx`**

```tsx
type Props = { params: Promise<{ assignmentId: string }> };
export const metadata: Metadata = { title: "Assessment | ABTalks" };

export default async function AssessmentAttemptPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { assignmentId } = await params;
  const loaded = await loadAttempt(prismaAttemptStore(), session.user.id, assignmentId);
  // Someone else's assignment, an unknown id or an unpublished assessment: 404, never 403.
  if (!loaded.ok) notFound();
  // shellUser exactly as src/app/jobs/[id]/page.tsx builds it
  return (
    <DashboardShell user={shellUser} isAdmin={session.user.isAdmin ?? false} showSectionNav={false}>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <Link href="/assessments" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-4")}>
          ← All assessments
        </Link>
        <AssessmentAttempt
          assignmentId={loaded.data.assignmentId}
          status={loaded.data.status}
          submittedAtLabel={loaded.data.submittedAt ? formatDateTimeIST(loaded.data.submittedAt) : null}
          view={loaded.data.view}
          initialAnswers={loaded.data.answers}
        />
      </main>
    </DashboardShell>
  );
}
```
No `searchParams`. Not added to any public allow-list.

**`src/app/assessments/page.tsx`** — `metadata` "Assessments | ABTalks"; same `auth()` /
`DashboardShell` / `<main>` shell; `h1` "Assessments"; `listCandidateAttempts`. Each row:
title, status label (ASSIGNED "Not started", STARTED "In progress", SUBMITTED "Submitted"),
"Assigned {formatDateIST(assignedAt)}", duration ("30 min" / "Untimed"), question count,
and a `<Link href={\`/assessments/${id}\`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>`
labelled **Start** / **Continue** / **View**. **No score or pass/fail column (D-1).**
Empty state: "No assessments yet. When a recruiter invites you to one, it appears here and
in your notifications." Rows stack as cards under 640px (Tailwind, like `/jobs`).

### Step 12 — Middleware, sidebar

- `middleware.ts`: add `"/assessments",` to `protectedPaths` (after `"/jobs",`). **Nothing
  else changes. No import is added** — the edge bundle rule.
- `nav-items.ts`: add `| "clipboard"` to `NavIconKey`; insert
  `{ label: "Assessments", href: "/assessments", icon: "clipboard" }` after "Jobs".
- `dashboard-sidebar.tsx`: import `ClipboardCheck` from `lucide-react`; `ICON_MAP.clipboard = ClipboardCheck`.
  The existing active rule (`pathname.startsWith(\`${href}/\`)`) already highlights it on
  `/assessments/<id>`.

### Step 13 — Tests

**`src/features/assessment-attempts/assessment-attempts.test.ts`** — same harness as
`recruiter-assessments.test.ts` (`suite`/`assert`, `process.exit`). An `inMemoryStore()`
holds assignments, assessments (status, pass mark, questions **with** `isCorrect` kept in a
separate key map the view never reads) and answers keyed `` `${assignmentId}:${questionId}` ``.
`start`, `saveAnswer` and `submit` check-and-write **without an `await` between**, so they
are atomic like the Postgres guards. `submit` emulates rollback: if `finish` returns
`ok: false`, it restores the pre-flip status.

Fixture: one PUBLISHED assessment (pass mark 60) with Q1 single-select (2 pts), Q2
multi-select (3 pts, 2 of 3 correct), Q3 PARAGRAPH (required, maxWords 20), Q4 FILE_UPLOAD
(required, https destination); candidate C owns assignment A; candidate D owns another.

*Start*
1. start: ASSIGNED → STARTED, `startedAt` set.
2. start twice → `alreadyStarted: true`, `startedAt` unchanged.
3. start after submit → CONFLICT.

*Isolation*
4. D using C's `assignmentId` → NOT_FOUND on load, start, save and submit; nothing written.
5. assessment DRAFT or ARCHIVED → NOT_FOUND on load and start.
6. unknown `questionId`, or a question of another assessment → NOT_FOUND on save.

*Save*
7. save before start → CONFLICT, nothing written.
8. single-select with two ids → INVALID; an option id from another question → INVALID;
   `text` payload for an MCQ → INVALID.
9. paragraph **over** `maxWords` → **saved** (nothing typed is lost); submit then refuses it.
10. `fileUrl` `javascript:alert(1)` → INVALID; `data:text/html,x` → INVALID; `""` → saved as
    `null`; `"  https://drive.example.com/f  "` → saved trimmed.
11. saving the same question twice leaves one row with the second value.

*TC-C-012*
12. **"TC-C-012: every answer survives a device change"** — C starts, saves Q1, Q2 (two
    options), Q3 (`"  line one\n\tline two — ünïcode  "`), Q4 (an https link). Then a
    **fresh `loadAttempt`** — nothing from the first calls is reused, as on another device —
    returns every answer exactly: Q1/Q2 as the same sets, Q3 **byte-identical** (not
    trimmed), Q4 equal.
13. `JSON.stringify(loadAttempt(...).data)` contains none of `isCorrect`, `scorePercent`,
    `passed`.

*Submit — TC-C-013*
14. **"TC-C-013: a duplicate submission is refused server-side"** — submit → ok; submit
    again → CONFLICT "This assessment has already been submitted."; `scorePercent`,
    `passed` and `submittedAt` on the row unchanged by the second call.
15. `Promise.all([submit, submit])` → exactly one ok, one CONFLICT.
16. save after submit → CONFLICT; the stored answer is unchanged.
17. required Q4 unanswered → INVALID naming 1 required question; the status is still
    STARTED (rolled back); after answering, submit → ok.
18. a whitespace-only Q3 counts as unanswered.
19. `Object.keys(submitResult.data)` is exactly `["submittedAt"]` (D-1).

*Scoring (`finishAttempt`)*
20. single-select right → its points; wrong → 0.
21. multi-select: the exact set → points; a subset → 0; a superset → 0.
22. PARAGRAPH / FILE_UPLOAD never change the score.
23. weights and rounding: 2 of 5 MCQ points → 40; 2 of 3 → 67; 1 of 3 → 33.
24. `scorePercent === passMarkPercent` → passed; one below → not passed.
25. an unanswered MCQ earns 0.

*List*
26. `listCandidateAttempts(C)` returns only C's assignments on PUBLISHED assessments,
    newest first, with no score fields.

*Source scans (same file, `readFileSync` like `isolation.test.ts`)*
27. `prisma-store.ts`: the `findAttempt` and `listAttempts` bodies contain none of
    `isCorrect`, `scorePercent`, `passed:`; `isCorrect` occurs only inside `submit`.
28. `prisma-store.ts`: `start` guards on `status: "ASSIGNED"` and `candidateUserId`; `submit`
    on `status: { in: ["ASSIGNED", "STARTED"] }` and `candidateUserId`; `saveAnswer` on
    `status: "STARTED"`. None of those three `updateMany` `where` blocks contains `assessment:`.
29. `assessment-attempt-actions.ts`: every exported action calls `sessionUserId()`; the file
    never contains `candidateUserId:` taken from input (`parsed.data.candidateUserId`,
    `input.candidateUserId`) and has no `console.`.

**`src/features/hire/isolation.test.ts`** — add:
- "candidate assessment page 404s a foreign assignment": the page source contains
  `auth()` and `notFound()`, and none of `searchParams`, `isCorrect`, `scorePercent`.
- "middleware protects /assessments and stays edge-safe": `middleware.ts` contains
  `"/assessments"` and no `from "@/lib`.

**`package.json`** — `"test:assessment-attempts": "cross-env NODE_OPTIONS=--conditions=react-server tsx src/features/assessment-attempts/assessment-attempts.test.ts"`.

### Step 14 — CHANGELOG

One line under `## Pending reconcile`, e.g.:

`- 2026-09-1X [schema|rule] T-218 (plan 129): AssessmentAnswer (one row per assignment×question, CASCADE on assignment, RESTRICT on question) + candidate /assessments and /assessments/[assignmentId] (protectedPaths); start/save/submit guarded on RecruiterAssessmentAssignment.status per plan 128 §10, saves and submit serialized by the assignment row lock, submit scores MCQ (exact-set) onto scorePercent/passed in one transaction; required questions block submit; candidate sees "Submitted" only — isCorrect/scorePercent/passed never reach candidate paths; upload links rendered only when http(s).`

## 6. Guardrails for Cursor (DO NOT)

**Standing**
- **DO NOT** import anything into `middleware.ts`. The only change is one string in
  `protectedPaths`. No `@/lib/*` on the edge path.
- **DO NOT** touch `src/auth.ts` or `src/auth.config.ts`.
- **DO NOT** use `<Button asChild>` / `<Button render={<Link>}>`; `buttonVariants` on the
  `<Link>`. Never a disabled `<Link>`.
- **DO NOT** use `any`, `console.*`, or `as` casts on the question/answer unions — narrow
  on `type` / `kind`.
- **DO NOT** return full Prisma records — explicit `select` everywhere. Multi-step writes
  inside `writeClient().$transaction`.
- **DO NOT** create files this plan does not list — no `use-autosave.ts`, no `scoring.ts`,
  no `src/app/assessments/layout.tsx`, no `loading.tsx`.
- **DO NOT** modify `src/components/ui/*`.

**T-218**
- **DO NOT** send `isCorrect`, `scorePercent` or `passed` to the candidate — not in page
  props, action responses, the list page or logs (D-1). The candidate query does not
  select them; build the view field by field, never by spreading a row.
- **DO NOT** accept `candidateUserId` (or any user id) from the client. The candidate is
  `session.user.id`.
- **DO NOT** add columns to `RecruiterAssessmentAssignment` or change its constraints. The
  `answers` back-relation is the only line added to that model.
- **DO NOT** write `assessmentId`, `candidateRef` or `assignedAt`. T-218 writes only
  `status`, `startedAt`, `submittedAt`, `scorePercent`, `passed` and `AssessmentAnswer` rows.
- **DO NOT** put a relation filter inside a guarded `updateMany`'s `where`.
- **DO NOT** keep answers in `localStorage`, `sessionStorage` or only in React state — every
  change goes to the server (board regression guard).
- **DO NOT** trim paragraph text on save.
- **DO NOT** render a recruiter- or candidate-supplied URL as a link unless it is http(s).
- **DO NOT** render recruiter or candidate text with `dangerouslySetInnerHTML`.
- **DO NOT** build a countdown, auto-submit, fullscreen, tab or paste tracking — T-219.
- **DO NOT** edit the builder, publish, assign or monitor: `assessment-builder.tsx`,
  `question-editor.tsx`, `assessment-assign-panel.tsx`, `create-test/page.tsx`,
  `src/app/hire/assessments/*`, `src/features/recruiter-assessments/*`,
  `recruiter-assessment-actions.ts`.
- **DO NOT** edit `src/features/notification/*`, add an event type or call `dispatch()`.
  (Recruiter "candidate completed" notification is T-249.)
- **DO NOT** write `AssessmentReport`, `AssessmentScore`, `SkillEvidence`, `ActivityAttempt`,
  `Question`, `QuestionOption` or `QuizActivityConfig`.
- **DO NOT** fire GA4 events (`assessment_submitted` is T-253) and never send an answer to
  analytics or a log.
- **DO NOT** put assignment or candidate ids in a query string. (The existing middleware
  `?from=/assessments/<id>` login redirect is pre-existing behaviour for every protected
  path — do not add another.)
- **DO NOT** run `prisma db push`, `migrate dev`, `migrate deploy`, seeds or SQL against the
  production database, and **do not run `next dev` with the new client while `.env.local`
  points at production**. §7 is the procedure.

## 7. DB safety

**Additive only:** one table, two indexes, two FKs. No enum, no existing column or table
changes, no backfill.

1. **Checkpoint.** Commit the non-schema work first; record the hash in the PR body.
2. **Point away from production.** Production is `ep-young-shadow-amawetjy` (plans 114-A,
   115, 126 — verified by row count). **The `PRODUCTION_NEON_HOST_ID` constants in
   `prisma/scripts/` and `src/repositories/points.ts` name `ep-nameless-term-ams9a5e3` and
   are stale — do not use them as the check.** Set `DATABASE_URL` **and** `DIRECT_URL` to a
   Neon **child branch of production** (both matter: reads use the pooled URL, T-218's
   writes use `writeClient()` → the direct URL while dual-write is on). Confirm the host
   `npx prisma migrate status` prints is the child's. If you cannot prove it, stop.
3. **Know the chain.** On the child, `npx prisma migrate status` shows whether T-243's
   `20260911090000_…` and T-244's `20260911180000_…` are applied. **T-218's FKs need both
   tables.** Record the result in the PR body — plan 128 left production unverified.
4. **Generate the SQL offline** (step 2) and review it.
5. **Rehearse on the child:** `npx prisma migrate deploy` — expect it to apply any missing
   T-243/T-244 migration, then `20260911210000_assessment_answer`. In `psql`,
   `\d "AssessmentAnswer"` shows `AssessmentAnswer_assignmentId_questionId_key` and both FKs.
   Also run §8's two-tab submit on the child: it exercises the interactive transactions
   through the real endpoints (T-243/T-244 use `prisma.$transaction` on the pooled URL;
   T-218 uses `writeClient()`).
6. **Production is not applied by this plan.** `vercel.json` builds with
   `npm run build:deploy` → `prisma migrate deploy`, so **merging to master applies T-243,
   T-244 and T-218 migrations to production in order.** Sohail's review is the gate
   (plan 112 §5.5). `project-context.md` §16 says `migrate deploy` cannot run on production;
   the 2026-09-02 CHANGELOG entry says it does — confirm with Sohail before merging.
7. **Rollback:** `DROP TABLE "AssessmentAnswer";` — nothing else references it.
   `scorePercent`/`passed`/`status` values written by T-218 stay on the assignment rows.

`prisma/cleanup.ts` needs no change: a doomed candidate's assignments cascade (→ answers
cascade); a doomed recruiter's assignments are already deleted explicitly (plan 128), which
cascades their answers before the assessment → question cascade runs.

## 8. Verification

**Build / typecheck** (offline)
- `npx tsc --noEmit` — clean. This also proves the builder's `previewDraft` still fits the
  screen's new prop type.
- `npx eslint` on every file in §3 — no new errors.
- `npm run build` — succeeds; `/assessments` and `/assessments/[assignmentId]` are `ƒ`.
- `npm run test:assessment-attempts` — 29/29.
- `npm run test:recruiter-assessments` — still 26/26 (regression).
- `npx cross-env NODE_OPTIONS=--conditions=react-server tsx src/features/hire/isolation.test.ts`
  — all green, including the two new suites.

**Manual — on the child branch from §7, never production.** Recruiter R (work email,
`ENABLE_RECRUITER_AUTH=true`); candidate C and candidate D (`@abtalks.dev` seed users,
`ENABLE_DEV_AUTH=true`). R builds an assessment with all four types (Q3 required, maxWords
20; Q4 required), publishes, assigns C. **Record steps 3–9 for the evidence.**

1. As C: the bell shows "You have a new assessment to take" → it opens
   `/assessments/<assignmentId>`. The sidebar shows **Assessments**, highlighted.
   `/assessments` lists it as "Not started".
2. The page shows the instructions and "Start assessment" — **no questions yet**. The chip
   reads "Suggested time: …".
3. Start → questions appear. Answer MCQ, multi-select (two options), paragraph (with a line
   break), file link (https). The indicator goes "Saving…" → "All answers saved · …".
   Typing `javascript:alert(1)` in the file field shows the hint and is not saved.
4. Mid-way (after "All answers saved"), **close the browser**.
5. **TC-C-012:** open a different browser (or another device) → sign in as C →
   `/assessments` shows "In progress" → **Continue** → every answer is restored exactly,
   paragraph line breaks included.
   ```sql
   SELECT "questionId", "selectedOptionIds", text, "fileUrl"
   FROM "AssessmentAnswer" WHERE "assignmentId" = '<id>';
   ```
   One row per answered question.
6. Clear the required paragraph → Submit is disabled with "Answer the 1 required question
   left before submitting." Type 25 words → the counter turns red and Submit says to
   shorten 1 answer. Fix it.
7. Submit → confirm → "Submitted …. Your answers are with the recruiter." **No score and
   no pass/fail anywhere on the candidate side** (page, `/assessments`, network responses).
8. **TC-C-013:** keep a second tab open on the taking stage from before step 7; press
   Submit → confirm there → "This assessment was already submitted." and the tab shows the
   submitted state.
   ```sql
   SELECT status, "submittedAt", "scorePercent", passed
   FROM "RecruiterAssessmentAssignment" WHERE id = '<id>';
   ```
   One row, SUBMITTED, one `submittedAt`, score set once.
9. As R: `/hire/assessments/<assessmentId>` shows C as Completed with the score and
   Passed/Failed; `/hire/assessments` counts update.
10. **Isolation:** as D, `/assessments/<C's assignmentId>` → 404; D's `/assessments` is
    empty. Signed out, `/assessments/<id>` → `/login?from=…`.
11. **Autosave under failure:** DevTools offline, type in the paragraph → "Couldn't save —
    retrying…"; closing the tab warns about unsaved changes; back online → "All answers saved".
12. **Preview regression:** `/hire/create-test` → Preview looks as before (styled, Submit
    disabled), and an upload destination set to `javascript:alert(1)` shows the
    "isn't a valid web address" text, not a link.
13. **Mobile 375px:** instructions, all four inputs, the sticky indicator (not hidden under
    the DashboardShell header) and the confirm step are usable; `/assessments` rows stack.

**Files that should have changed** — exactly §3, nothing else.

## 9. Commit message

```
feat(assessments): candidate taking with server autosave and one submit (T-218)

Adds AssessmentAnswer — one row per assignment and question, CASCADE on
the assignment, RESTRICT on the question — and the candidate routes
/assessments and /assessments/[assignmentId], behind protectedPaths.
Start, save and submit are guarded on RecruiterAssessmentAssignment.status
exactly as plan 128 §10 agreed; each save and the submit take the
assignment row lock first, so no answer lands after a submission and a
second submit matches nothing. Submit scores the multiple-choice questions
(exact-set match for multi-select) onto scorePercent/passed in the same
transaction, which is what the T-244 monitor already shows. Required
questions block submission. Answers restore from the database on any
device. The candidate sees "Submitted" only: the answer key, score and
pass/fail never reach a candidate page or response. CandidateAssessmentScreen
is extended rather than forked, its styles now load outside /hire, and
recruiter upload links render only when they are http(s).
```

## 10. Decisions made in this plan (change before implementing if you disagree)

| # | Decision | Why |
|---|---|---|
| P1 | Submit = guarded flip + read under lock + score, one transaction (R1) | Same §10 guard; the score can't miss a racing autosave; a refused submit leaves the attempt STARTED. |
| P2 | Save takes the row lock with a no-op guarded update (R2) | Serializes saves against submit without raw SQL (`FOR UPDATE`). |
| P3 | Answer FK: CASCADE to assignment, RESTRICT to question | Matches T-244 D7: results don't vanish with a recruiter-side delete. |
| P4 | Word cap enforced at submit, not on save | "Without losing answers": an over-limit draft is stored, never refused. |
| P5 | File link must be http(s) on save; a half-typed link isn't stored | The link is later rendered to recruiters/admins; the DB must never hold `javascript:`. Links are pasted, not typed. |
| P6 | Autosave: choice immediately, text/file after 800 ms, one in-flight save per tab | Ordered writes from a tab; low load on Neon. Across devices, last write wins per question (no live sync). |
| P7 | Questions hidden until Start | Instructions first, per the ticket; gives T-219 a clean "started" boundary. |
| P8 | Screen styles move to a component stylesheet with fallbacks | Only way the one screen renders on both routes without loading the whole hire desk CSS on candidate pages. |

## 11. Out of scope, follow-ups and risks

- **T-219** integrity signals — record them against `RecruiterAssessmentAssignment.id` (the
  attempt). **T-273** admin assessment support reads `AssessmentAnswer`. **T-249** notifies
  the recruiter on completion. **T-220/T-221** `SkillEvidence` from results — not written.
  **T-253** owns the `assessment_submitted` GA4 event (the submit action's success path is
  where it would hook).
- Manual grading of PARAGRAPH / FILE_UPLOAD; showing the candidate their score (D-1);
  retakes; timer enforcement; sections.
- **T-243 follow-up (raise with shashank):** the builder accepts `javascript:` / `data:`
  upload destinations (Zod 4 `.url()`). This plan neutralizes it at render; the builder's
  schema should also require http(s).
- **Risk — T-203 not approved:** UI may need re-skinning after UX-04 approval.
- **Risk — migration chain:** T-243, T-244 and T-218 migrations are all unverified on
  production and all apply on the next master deploy.
- **Risk — pooled vs direct transactions:** T-243/T-244 run interactive transactions on the
  pooled `prisma` client; the codebase rule (`writeClient()` doc) says direct. §7 step 5
  exercises both on the child.
- **Risk — concurrency proof:** automated tests prove the guard logic, not Postgres locking
  (D-2). §8 step 8 is the real-database check; a DB-backed test can be added later if a
  local Postgres is set up.
- Email notification links use `NEXT_PUBLIC_APP_URL || "https://abtalks.in"` — in local
  testing, use the bell, not the email.
