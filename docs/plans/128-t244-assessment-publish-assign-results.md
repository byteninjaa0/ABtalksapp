# Plan 128 — T-244 Publish, assign, monitor and results (R9, part 2)

**Ticket:** T-244, `docs/ABTalks88.xlsx` → Team Execution Board row 57. TC-R-018.
**Outcome:** "As a recruiter, I send my test to candidates and see what came back."
**Depends on:** T-243 (builder — plan 121) and T-248 (notification service — plan 118).
**Blocks:** T-218 (candidate taking + autosave), whose row says "Depends on: T-244".
**Board owner:** the workbook still lists **shashank** for T-244. Update the board to
the actual assignee before implementation starts so two people do not build it.
**Status:** **shipped.** Committed and on `master` in `0f7e19f9` (merged via PR #296);
`cdaa8cf6` brought the T-218 candidate side alongside it. `tsc` clean,
`npm run build` green, `test:recruiter-assessments` 27/27, isolation 9/9.
The §8 manual checks were completed on 2026-09-11 under **TC-R-018 acceptance
(plan 133)**, which also applied migration `20260911180000_…` to the dev Neon
branch — it had to be reconciled with `prisma migrate resolve --applied`, because
the objects already existed there from an earlier `db push`. Still **not applied
to production**: that happens on the next `master` deploy via `build:deploy`.
Plan 132 closed the one outstanding deviation from §5 step 10 (the
`hire-chrome.tsx` nav highlight).

> **Local prerequisite (same as plan 121):** `/hire` sign-in needs
> `ENABLE_RECRUITER_AUTH=true`. **And `.env.local` points at the production
> database** — see §7 before running `next dev`, `prisma generate` or any test
> that touches a database.

---

## 1. Goal

A recruiter opens a saved assessment, **publishes** it, **assigns** it to
candidates on their Shortlist, and each candidate is **notified exactly once**. The
recruiter then **monitors** every assignment — not started / in progress /
completed, score and pass/fail against the pass mark — and `/hire/assessments`
shows real **Students / Passed / Failed** numbers instead of `—`.

This ticket creates the per-candidate assignment record and everything the
recruiter sees. The candidate taking the test, saving answers, submitting and
being scored is **T-218**, which writes into the columns this plan creates (§10).

## 2. Current behavior

### What T-243 left (audited 2026-09-11, commit `b5095a98`, on `upstream/master`)
- `RecruiterAssessment` / `AssessmentQuestion` / `AssessmentQuestionOption`, enums
  `RecruiterAssessmentStatus` (DRAFT | PUBLISHED | ARCHIVED) and
  `AssessmentQuestionType` (MULTIPLE_CHOICE | PARAGRAPH | FILE_UPLOAD). Migration
  `20260911090000_recruiter_assessment_builder` is creates-only.
- `src/features/recruiter-assessments/service.ts` — store-injectable service.
  Every read and write takes `Scope = { organizationId, createdByUserId }`; a
  foreign id resolves to `null` → `NOT_FOUND`. `saveAssessmentDraft` refuses any
  status other than DRAFT with a `CONFLICT`. **Nothing ever sets PUBLISHED.**
- `deleteAssessment` has **no status check** — harmless while everything is DRAFT,
  wrong the moment a published assessment owns candidates' results.
- `src/app/actions/recruiter-assessment-actions.ts` — save + delete, both behind
  `requireRecruiterWorkspace()`, envelope `{ ok, data } | { ok: false, message, status? }`.
- `/hire/assessments` (`src/app/hire/assessments/page.tsx`) — lists the workspace's
  assessments. Students / Passed / Failed are hard-coded `—`. The title link and
  "Open builder" both go to a blank `/hire/create-test` (T-243 gap, not fixed here).
- `/hire/create-test` captures `shortlistRefs` from `getShortlist()` only — the
  legacy `RecruiterShortlistItem` store, AI-cohort members of the latest published
  cohort. They are `PROGRAM:<ProgramMember.id>` strings, **not** AB-#### labels
  as the schema comment claims. **This plan does not read `shortlistRefs`.**
- Tests: `npm run test:recruiter-assessments` 7/7; isolation suite 8/8 (when run
  directly — see §8); `tsc --noEmit` clean.

### The Shortlist today — two stores, merged in one place
`src/app/hire/layout.tsx` builds the Shortlist the recruiter sees from:
1. `getShortlist(userId)` — `src/features/talent-pool/pool.ts`. Legacy
   `RecruiterShortlistItem`, AI-cohort only, already filtered through
   `filterSearchableUserIds`. Each row has `memberId` and `userId`.
2. `listProjectShortlist(userId)` — `src/features/hire/project-shortlist.ts`.
   T-149 `TalentRequestMatch.decision = SHORTLISTED`, every track, keyed on
   `candidateUserId`. **Not** filtered for searchability.

Legacy wins on overlap. The desk's ref for a legacy row is
`encodeCandidateRef("PROGRAM", memberId)`; project rows carry their own
`candidateRef`.

### Notifications — T-248 is on master
`dispatch()` in `src/features/notification/notification-service.ts` writes one
`UserNotification` per `dedupeKey = eventType:recipientUserId:primaryEntityId`
(unique index → a repeat returns `{ ok: true, deduplicated: true }`), an in-app
`NotificationDelivery` (state `sent`) and, when the preference allows, an email
delivery sent inline. `"assessment.assigned"` is **already registered** in
`event-types.ts` (priority `important`). The bell (`get-notifications.ts`) reads
`UserNotification`. T-244 is the **first production caller** of `dispatch()`.

Two T-248 facts this plan designs around:
- `template-renderer.ts` interpolates `{{title}}` / `{{body}}` into email HTML
  **without escaping**. So notification text in this plan is fixed copy — no
  recruiter-authored string (assessment title, company) goes into it.
- `retryFailedDeliveries()` has **no caller** (no cron). A failed email stays
  failed; in-app is always delivered. Not fixed here — raise with T-248's owner.

### Reuse check — what exists and why each is or is not used
| Candidate for reuse | Used? | Why |
|---|---|---|
| `RecruiterAssessment` + questions (T-243) | **Yes** | The thing being published and assigned. |
| `dispatch()` + `"assessment.assigned"` (T-248) | **Yes** | The notification service. No new event type. |
| `getShortlist`, `listProjectShortlist`, `filterSearchableUserIds`, `listUserDisplayNames`, `refPublicId` | **Yes** | Existing readers; called, not modified. |
| `RecruiterAssessment.shortlistRefs` | **No** | Frozen at draft time, legacy-only, internal ids. |
| `AssessmentReport` / `AssessmentScore` | **No** | A hand-written evaluation report keyed on a candidate, with no link to a recruiter assessment or an attempt. Nothing in T-244's done-criteria needs a report. |
| `Question` / `QuestionOption` / `QuizActivityConfig` / `ActivityAttempt` | **No** | Plan 121 §2 decision stands; `ActivityAttempt` is enrollment-owned learning evidence. |
| `TalentEngagementRequest`, `TalentList*`, `PipelineStage` | **No** | Contact release and pipeline are other tickets. |
| `SkillEvidence` | **No** | T-220 / T-221. |

**Nothing existing stores "this candidate was assigned this assessment".** That is
the one new table (§5 step 1). Plan 121 §9 said T-244 could start without a
migration; that was wrong — started / completed / result need a row per
(assessment, candidate).

## 3. Files to touch

**Schema**
- `prisma/schema.prisma` [edit] — enum `AssessmentAssignmentStatus`, model
  `RecruiterAssessmentAssignment`, back-relations on `RecruiterAssessment` and `User`.
- `prisma/migrations/20260911180000_recruiter_assessment_assignment/migration.sql` [new] — creates-only.
- `prisma/cleanup.ts` [edit] — delete assignment rows before users (the new FK
  to `RecruiterAssessment` is `RESTRICT`, same pattern as the T-228 credit ledger).

**Server**
- `src/lib/validations/assessment.ts` [edit] — `MAX_ASSIGN_PER_CALL`,
  `publishAssessmentSchema`, `assignAssessmentSchema`.
- `src/features/recruiter-assessments/service.ts` [edit] — new types, store port
  methods, notifier port, `publishAssessment`, `assignAssessment`,
  `getAssessmentMonitor`, `candidateAssessmentHref`; `listAssessments` gains result
  counts; `deleteAssessment` becomes DRAFT-only.
- `src/features/recruiter-assessments/prisma-store.ts` [edit] — implement the new
  store methods.
- `src/app/actions/recruiter-assessment-actions.ts` [edit] —
  `publishRecruiterAssessmentAction`, `assignRecruiterAssessmentAction`, the real
  notifier built on `dispatch()`.

**Routes**
- `src/app/hire/assessments/[assessmentId]/page.tsx` [new] — Server. Header,
  summary counts, the publish/assign panel, the monitor table.
- `src/app/hire/assessments/page.tsx` [edit] — real Students / Passed / Failed,
  title links to the detail page, Delete shown only for DRAFT, new footnote.

**Components**
- `src/components/hire/assessment/assessment-assign-panel.tsx` [new] — Client.
  Publish confirm + candidate picker + assign.
- `src/components/hire/hire-chrome.tsx` [edit] — "Assessments" nav stays current on
  `/hire/assessments/*` (two expressions). Desk deny-list untouched.
- `src/app/hire/hire-scout.css` [edit] — detail page, stats row, assign panel.

**Tests**
- `src/features/recruiter-assessments/recruiter-assessments.test.ts` [edit] —
  in-memory store + fake notifier gain the new methods; new cases (§5 step 11).
- `src/features/hire/isolation.test.ts` [edit] — extend the existing
  "recruiter assessment actions go through the workspace gate" suite and add one
  for the detail page.

**Docs**
- `docs/CHANGELOG.md` [edit] — one dated line under `## Pending reconcile`.

**Explicitly NOT touched:** everything under `src/features/notification/`,
`assessment-builder.tsx`, `question-editor.tsx`, `candidate-assessment-screen.tsx`,
`assessment-types.ts`, `src/app/hire/create-test/page.tsx`, `src/app/hire/layout.tsx`,
`src/features/talent-pool/pool.ts`, `src/features/hire/project-shortlist.ts`,
`middleware.ts`, `src/auth.ts`, `src/auth.config.ts`, `package.json`.

## 4. Server vs Client

| File | Boundary | Notes |
|---|---|---|
| `src/app/hire/assessments/[assessmentId]/page.tsx` | **Server** | `requireRecruiter()` + `requireRecruiterWorkspace()`. Renders header, stats and the monitor table itself. Passes the panel **plain JSON only**. |
| `src/app/hire/assessments/page.tsx` | **Server** | Unchanged boundary. |
| `assessment-assign-panel.tsx` | **Client** | `"use client"`. Calls the two server actions via `useTransition`, then `router.refresh()`. |
| `service.ts` / `prisma-store.ts` | **Server only** | Both already `import "server-only"`. |
| `recruiter-assessment-actions.ts` | **Server** (`"use server"`) | |
| `validations/assessment.ts` | shared | Zod + a number constant only; already imported by the client builder. |

**Server→Client props for `AssessmentAssignPanel`** — strings, numbers, booleans only:

```ts
type AssignPanelProps = {
  assessmentId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  candidates: {
    candidateRef: string;
    label: string;       // display name, else AB-####
    jobRole: string;
    alreadyAssigned: boolean;
  }[];
};
```

No `Date`, no functions, no Lucide icon components cross the boundary. Icons are
imported inside the client component. `MAX_ASSIGN_PER_CALL` is imported by the
client from `@/lib/validations/assessment`, not passed as a prop.

## 5. Steps

### Step 1 — Schema (`prisma/schema.prisma`)

Add next to the T-243 models:

```prisma
enum AssessmentAssignmentStatus {
  ASSIGNED
  STARTED
  SUBMITTED
}

/// T-244: one row per (recruiter assessment, candidate). Created when a
/// recruiter assigns a PUBLISHED assessment to a candidate on their Shortlist.
///
/// T-244 writes: id, assessmentId, candidateUserId, candidateRef, assignedAt.
/// T-218 writes: status, startedAt, submittedAt, scorePercent, passed — and
/// nothing else. See docs/plans/128-t244-assessment-publish-assign-results.md §10.
///
/// RESTRICT on the assessment: a published assessment holds candidates'
/// results and must not vanish with a delete. deleteAssessment is DRAFT-only,
/// and a DRAFT can never have assignments, so this never blocks a real delete.
/// CASCADE on the candidate: a candidate deleting their account takes their
/// assignments with them.
model RecruiterAssessmentAssignment {
  id              String                     @id @default(cuid())
  assessmentId    String
  candidateUserId String
  /// The Shortlist handle the recruiter assigned from ("PROGRAM:<memberId>",
  /// "CLAUDE:<userId>", …). Stored so the monitor prints the same AB-#### label
  /// the desk shows. A name, never a capability.
  candidateRef    String
  status          AssessmentAssignmentStatus @default(ASSIGNED)
  assignedAt      DateTime                   @default(now())
  /// T-218 only.
  startedAt       DateTime?
  /// T-218 only.
  submittedAt     DateTime?
  /// T-218 only. 0–100, share of auto-gradeable points earned.
  scorePercent    Int?
  /// T-218 only. scorePercent >= RecruiterAssessment.passMarkPercent.
  passed          Boolean?
  updatedAt       DateTime                   @updatedAt

  assessment RecruiterAssessment @relation(fields: [assessmentId], references: [id], onDelete: Restrict)
  candidate  User                @relation("AssessmentAssignee", fields: [candidateUserId], references: [id], onDelete: Cascade)

  @@unique([assessmentId, candidateUserId])
  @@index([candidateUserId, assignedAt(sort: Desc)])
  @@index([assessmentId, status])
}
```

Back-relations:
- `RecruiterAssessment` — `assignments RecruiterAssessmentAssignment[]`
- `User` — `assessmentAssignments RecruiterAssessmentAssignment[] @relation("AssessmentAssignee")`
  (next to the existing `assessmentsAuthored` line).

Then `npx prisma format` and `npx prisma generate` (§7 first — generate is safe, but
do not start `next dev` against production afterwards).

### Step 2 — Migration

Generate the SQL **offline**, without touching any database:

```bash
git show HEAD:prisma/schema.prisma > "$TMP/schema.before.prisma"
npx prisma migrate diff \
  --from-schema-datamodel "$TMP/schema.before.prisma" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260911180000_recruiter_assessment_assignment/migration.sql
```

Review it. It must contain exactly: one `CREATE TYPE`, one `CREATE TABLE`, one
`CREATE UNIQUE INDEX`, two `CREATE INDEX`, two `ALTER TABLE … ADD CONSTRAINT …
FOREIGN KEY` (one `ON DELETE RESTRICT`, one `ON DELETE CASCADE`). **If it contains
`DROP`, `ALTER COLUMN`, or touches any other table, stop and report.** The
timestamp `20260911180000` sorts after `20260911090000`; confirm no other folder
uses it (`ls prisma/migrations`) before committing.

### Step 3 — Validation (`src/lib/validations/assessment.ts`)

Append:

```ts
/** One assign call notifies at most this many people (sequential sends). */
export const MAX_ASSIGN_PER_CALL = 25;

export const publishAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
});

export const assignAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  candidateRefs: z
    .array(z.string().trim().min(3).max(200))
    .min(1, "Pick at least one candidate")
    .max(MAX_ASSIGN_PER_CALL, `Assign at most ${MAX_ASSIGN_PER_CALL} candidates at a time`),
});

export type AssignAssessmentInput = z.infer<typeof assignAssessmentSchema>;
```

The client sends **refs only**. It never sends a user id.

### Step 4 — Service (`src/features/recruiter-assessments/service.ts`)

**New types** (exported):

```ts
export type AssignmentStatus = "ASSIGNED" | "STARTED" | "SUBMITTED";

export type AssignableCandidate = {
  candidateRef: string;
  candidateUserId: string;
  label: string;
  jobRole: string;
};

export type AssignmentRow = {
  id: string;
  candidateUserId: string;
  candidateRef: string;
  label: string;
  status: AssignmentStatus;
  assignedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  scorePercent: number | null;
  passed: boolean | null;
};

export type ResultCounts = { students: number; passed: number; failed: number };

export type AssessmentNotifier = {
  assigned(input: {
    recipientUserId: string;
    assessmentId: string;
    assignmentId: string;
  }): Promise<{ ok: boolean; deduplicated: boolean }>;
};
```

`AssessmentListRow` gains `results: ResultCounts | null` — `null` for DRAFT.
It is computed in `listAssessments`, so `store.listOwned` does not change.

**Store port — add** (every method that reads assignments takes `Scope` and
filters through the assessment relation, so it is safe even if a caller forgets
`findOwned`):

```ts
publish(assessmentId: string, scope: Scope, at: Date): Promise<boolean>;
listAssignableCandidates(recruiterUserId: string): Promise<AssignableCandidate[]>;
upsertAssignments(
  assessmentId: string,
  rows: { candidateUserId: string; candidateRef: string }[],
): Promise<{ id: string; candidateUserId: string; created: boolean }[]>;
listAssignments(assessmentId: string, scope: Scope): Promise<AssignmentRow[]>;
countResults(scope: Scope, assessmentIds: string[]): Promise<Map<string, ResultCounts>>;
```

**The candidate link — the contract with T-218:**

```ts
/** T-218 builds this route. Agreed here so notifications sent before it
 *  lands point at the right place. */
export function candidateAssessmentHref(assignmentId: string): string {
  return `/assessments/${assignmentId}`;
}
```

**`publishAssessment(store, scope, assessmentId)`**
1. `row = await store.findOwned(assessmentId, scope)`; missing → `NOT_FOUND("Assessment not found")`.
2. `PUBLISHED` → `OK({ id, alreadyPublished: true })` — no write. This is the idempotency.
3. `ARCHIVED` → `CONFLICT("This assessment is archived and can't be published.")`.
4. No `MULTIPLE_CHOICE` question with `points > 0` →
   `INVALID("Add at least one multiple-choice question worth points — the pass mark is measured on those.")`.
   (The pass mark is a percentage of auto-gradeable points; with none, T-218 could
   not grade it. See §11 decision D4.)
5. `const moved = await store.publish(assessmentId, scope, new Date())`.
6. `moved === false` (lost a race) → re-read with `findOwned`; `PUBLISHED` →
   `OK({ id, alreadyPublished: true })`, otherwise `NOT_FOUND`.
7. `OK({ id, alreadyPublished: false })`.

**`assignAssessment(store, notifier, scope, input: unknown)`**
1. `assignAssessmentSchema.safeParse(input)`; failure → `INVALID(first issue message)`.
2. `row = findOwned` → `NOT_FOUND`. `status !== "PUBLISHED"` →
   `CONFLICT("Publish this assessment before assigning it.")`.
3. `refs = [...new Set(parsed.candidateRefs)]`.
4. `pool = await store.listAssignableCandidates(scope.createdByUserId)`;
   `byRef = new Map(pool.map((c) => [c.candidateRef, c]))`.
5. Any ref not in `byRef` → `INVALID("Some of these candidates are no longer on your Shortlist. Refresh and try again.")`
   and **write nothing**. All-or-nothing keeps the result message honest.
6. `targets` = the matched candidates, de-duplicated on `candidateUserId`
   (first wins).
7. `const rows = await store.upsertAssignments(assessmentId, targets.map(...))`.
8. Notify **every** row in `rows` — new and already-existing — **sequentially**:
   ```ts
   let notificationFailures = 0;
   for (const r of rows) {
     try {
       const res = await notifier.assigned({
         recipientUserId: r.candidateUserId,
         assessmentId,
         assignmentId: r.id,
       });
       if (!res.ok) notificationFailures++;
     } catch {
       notificationFailures++;
     }
   }
   ```
   Notifying existing rows is safe because the dedupe key is
   `assessment.assigned:<candidateUserId>:<assessmentId>`: a candidate is notified
   once per assessment, ever, and a retry after a failure delivers the one that
   failed. Do **not** narrow this loop to `created` rows — that would lose a
   notification whose first send failed.
9. `OK({ assigned: <created count>, alreadyAssigned: <not created count>, notificationFailures })`.

**`getAssessmentMonitor(store, scope, assessmentId)`**
1. `row = findOwned` → `NOT_FOUND`.
2. `assignments = await store.listAssignments(assessmentId, scope)`.
3. `summary` computed here:
   `assigned = assignments.length`,
   `started = count(startedAt !== null)`,
   `completed = count(status === "SUBMITTED")`,
   `passed = count(passed === true)`, `failed = count(passed === false)`.
4. `candidates` — only when `row.status === "PUBLISHED"`, else `[]`:
   `pool = await store.listAssignableCandidates(scope.createdByUserId)`, each
   mapped with `alreadyAssigned = assignedUserIds.has(c.candidateUserId)`.
5. `OK({ assessment: { id, title, status, durationMinutes, passMarkPercent, questionCount: row.questions.length, publishedAt }, summary, assignments, candidates })`.

**`listAssessments`** — after `store.listOwned(scope)`:
`counts = await store.countResults(scope, rows.filter((r) => r.status !== "DRAFT").map((r) => r.id))`;
each row gets `results: r.status === "DRAFT" ? null : counts.get(r.id) ?? { students: 0, passed: 0, failed: 0 }`.

**`deleteAssessment`** — `findOwned` first; missing → `NOT_FOUND`;
`status !== "DRAFT"` → `CONFLICT("Published assessments can't be deleted — they hold candidates' results.")`;
then `store.delete`.

### Step 5 — Prisma store (`prisma-store.ts`)

New imports: `getShortlist` from `@/features/talent-pool/pool`,
`listProjectShortlist` from `@/features/hire/project-shortlist`,
`encodeCandidateRef`, `refPublicId` from `@/features/hire/candidate-ref`,
`filterSearchableUserIds` from `@/repositories/talent`,
`listUserDisplayNames` from `@/repositories/hire`.

Every query keeps an explicit `select`.

**`publish`**
```ts
const res = await prisma.recruiterAssessment.updateMany({
  where: { id: assessmentId, ...scopeWhere(scope), status: "DRAFT" },
  data: { status: "PUBLISHED", publishedAt: at },
});
return res.count === 1;
```
The `status: "DRAFT"` guard in the `where` is what makes a double click or two
tabs publish once — never a read-then-write.

**`listAssignableCandidates(recruiterUserId)`** — the same two stores and the same
precedence as `app/hire/layout.tsx` (legacy first), de-duplicated on
`candidateUserId`, then **re-filtered for searchability** (the project store is
not filtered today):

```ts
const [legacy, project] = await Promise.all([
  getShortlist(recruiterUserId),
  listProjectShortlist(recruiterUserId),
]);
const merged: { candidateRef: string; candidateUserId: string; name: string | null; jobRole: string }[] = [];
const seen = new Set<string>();
for (const r of legacy.ok ? legacy.data : []) {
  if (seen.has(r.userId)) continue;
  seen.add(r.userId);
  merged.push({
    candidateRef: encodeCandidateRef("PROGRAM", r.memberId),
    candidateUserId: r.userId,
    name: r.displayName,
    jobRole: r.jobRole ?? "Candidate",
  });
}
for (const r of project) {
  if (seen.has(r.candidateUserId)) continue;
  seen.add(r.candidateUserId);
  merged.push({
    candidateRef: r.candidateRef,
    candidateUserId: r.candidateUserId,
    name: r.displayName,
    jobRole: r.jobRole,
  });
}
const searchable = await filterSearchableUserIds(merged.map((m) => m.candidateUserId));
return merged
  .filter((m) => searchable.has(m.candidateUserId))
  .map((m) => ({
    candidateRef: m.candidateRef,
    candidateUserId: m.candidateUserId,
    label: m.name?.trim() || refPublicId(m.candidateRef),
    jobRole: m.jobRole,
  }));
```

`getShortlist` returning `{ ok: false }` (no published cohort) is **not** an error
here — it simply contributes no rows.

**`upsertAssignments(assessmentId, rows)`** — one interactive transaction:
```ts
return prisma.$transaction(async (tx) => {
  const userIds = rows.map((r) => r.candidateUserId);
  const before = await tx.recruiterAssessmentAssignment.findMany({
    where: { assessmentId, candidateUserId: { in: userIds } },
    select: { candidateUserId: true },
  });
  await tx.recruiterAssessmentAssignment.createMany({
    data: rows.map((r) => ({
      assessmentId,
      candidateUserId: r.candidateUserId,
      candidateRef: r.candidateRef,
    })),
    skipDuplicates: true,
  });
  const after = await tx.recruiterAssessmentAssignment.findMany({
    where: { assessmentId, candidateUserId: { in: userIds } },
    select: { id: true, candidateUserId: true },
  });
  const existed = new Set(before.map((b) => b.candidateUserId));
  return after.map((a) => ({ ...a, created: !existed.has(a.candidateUserId) }));
});
```
`skipDuplicates` + the unique index is the duplicate guard. Two concurrent assigns
may both report a row as `created`; the notification dedupe key still sends one.

**`listAssignments(assessmentId, scope)`**
```ts
const rows = await prisma.recruiterAssessmentAssignment.findMany({
  where: { assessmentId, assessment: scopeWhere(scope) },
  orderBy: { assignedAt: "asc" },
  select: {
    id: true, candidateUserId: true, candidateRef: true, status: true,
    assignedAt: true, startedAt: true, submittedAt: true,
    scorePercent: true, passed: true,
  },
});
const names = await listUserDisplayNames(rows.map((r) => r.candidateUserId));
return rows.map((r) => ({
  ...r,
  label: names.get(r.candidateUserId) || refPublicId(r.candidateRef),
}));
```
Names come from the same repository reader the desk uses. No email, phone or any
contact field is selected anywhere in this plan.

**`countResults(scope, assessmentIds)`** — one `groupBy`:
```ts
if (assessmentIds.length === 0) return new Map();
const groups = await prisma.recruiterAssessmentAssignment.groupBy({
  by: ["assessmentId", "passed"],
  where: { assessmentId: { in: assessmentIds }, assessment: scopeWhere(scope) },
  _count: { _all: true },
});
```
Fold into `Map<assessmentId, { students, passed, failed }>`:
`students` += every group's count; `passed` += count where `passed === true`;
`failed` += count where `passed === false`.

### Step 6 — Server actions (`recruiter-assessment-actions.ts`)

Add imports: `dispatch` from `@/features/notification/notification-service`,
`publishAssessmentSchema`, `assignAssessmentSchema`, and the new service functions
and types.

**The real notifier** — local to this file, fixed copy only:

```ts
function assessmentNotifier(): AssessmentNotifier {
  return {
    async assigned({ recipientUserId, assessmentId, assignmentId }) {
      const res = await dispatch({
        eventType: "assessment.assigned",
        recipientUserId,
        primaryEntityId: assessmentId,
        title: "You have a new assessment to take",
        body: "A recruiter on ABTalks has invited you to an assessment. Open it to read the instructions before you start.",
        href: candidateAssessmentHref(assignmentId),
        metadata: { assessmentId, assignmentId },
      });
      return res.ok
        ? { ok: true, deduplicated: res.deduplicated }
        : { ok: false, deduplicated: false };
    },
  };
}
```

`primaryEntityId` is the **assessment** id, not the assignment id — that is what
makes it "once per candidate per assessment". The title and body contain **no**
recruiter-authored text (see §2, template escaping).

**`publishRecruiterAssessmentAction(input: unknown)`**
- `requireRecruiterWorkspace()` → `{ ok: false, message, status: 403 }` on failure.
- `publishAssessmentSchema.safeParse(input)` → `{ ok: false, message: "Invalid input" }`.
- `publishAssessment(prismaAssessmentStore(), scopeFrom(workspace.data), id)`.
- Map codes: `NOT_FOUND` → 404, `CONFLICT` → 409, `INVALID` → no status.
- On ok: `revalidatePath("/hire/assessments")` and
  `revalidatePath(\`/hire/assessments/${id}\`)`; return
  `{ ok: true, data: { id, alreadyPublished } }`.
- try/catch → `logger.error("[recruiter-assessment-actions] publish", { error: String(error) })`,
  `{ ok: false, message: "Failed to publish assessment" }`.

**`assignRecruiterAssessmentAction(input: unknown)`**
- Same gate and error mapping.
- `assignAssessmentSchema.safeParse(input)` at the boundary (the service parses
  again — same double-parse as the save action).
- `assignAssessment(prismaAssessmentStore(), assessmentNotifier(), scope, parsed.data)`.
- On ok: revalidate both paths; return
  `{ ok: true, data: { assigned, alreadyAssigned, notificationFailures } }`.
- When `notificationFailures > 0`, also `logger.warn("[recruiter-assessment-actions] assign notification failures", { assessmentId, notificationFailures })`.
- try/catch → `logger.error("[recruiter-assessment-actions] assign", …)`,
  `{ ok: false, message: "Failed to assign assessment" }`.

`deleteRecruiterAssessmentAction` needs no edit: its existing mapping already
returns a service `CONFLICT` as `{ ok: false, message }`. Add `409` for
`CONFLICT` to its status mapping so it matches the save action.

### Step 7 — Detail page (`src/app/hire/assessments/[assessmentId]/page.tsx`)

```tsx
type Props = { params: Promise<{ assessmentId: string }> };

export const metadata: Metadata = { title: "Assessment | ABTalks Hire" };
// Assign sends up to MAX_ASSIGN_PER_CALL notifications inline; the server
// action runs under this page's function limit.
export const maxDuration = 60;

export default async function HireAssessmentDetailPage({ params }: Props) {
  await requireRecruiter();
  const workspace = await requireRecruiterWorkspace();
  if (!workspace.ok) notFound();
  const { assessmentId } = await params;
  const monitor = await getAssessmentMonitor(
    prismaAssessmentStore(),
    { organizationId: workspace.data.organizationId, createdByUserId: workspace.data.userId },
    assessmentId,
  );
  if (!monitor.ok) notFound();
  // render …
}
```

A foreign or unknown id is `notFound()` — a 404, never a 403.

**Layout** (reuse `hire-assess-list` container styles; new classes in step 10):
1. Back link "← All assessments" to `/hire/assessments`.
2. Header: kicker "Recruiter assessment", `<h1>` title, status chip, a facts line:
   "N questions · 30 min (or Untimed) · Pass mark 70% · Published 11 Sep 2026, 4:05 pm"
   (published part only when `publishedAt`; format `en-IN`, `Asia/Kolkata`, exactly
   as the list page formats `updatedAt`).
3. Stats row, only when not DRAFT — five tiles: **Assigned**, **Started**,
   **Completed**, **Passed**, **Failed** from `summary`.
4. `<AssessmentAssignPanel assessmentId status candidates />`.
5. Monitor table, only when not DRAFT (inside `hire-assess-list__table-wrap` so it
   scrolls on phones). Columns: **Candidate** (label, jobRole under it in muted
   text), **Status**, **Assigned**, **Started**, **Completed**, **Score**, **Result**.
   - Status: ASSIGNED → "Not started", STARTED → "In progress", SUBMITTED → "Completed".
   - Dates: formatted as above; null → "—".
   - Score: `scorePercent` → `"80%"`; null → "—".
   - Result: `passed === true` → "Passed"; `false` → "Failed";
     `null` with SUBMITTED → "Awaiting result"; otherwise "—".
   - Empty: "No candidates assigned yet. Pick candidates from your Shortlist above."
6. DRAFT: no stats, no table; one line under the panel: "This is a draft.
   Publish it to assign candidates — publishing locks the questions and pass mark."

Dates are formatted **in the Server Component**; only the panel receives props.

### Step 8 — Assign panel (`assessment-assign-panel.tsx`)

`"use client"`. Props from §4. `useTransition`, `useRouter`, `toast` from `sonner`.

**DRAFT:**
- A primary button **Publish assessment** (`buttonVariants({ variant: "default" })`
  on a `<button>` — it is an action, not a link).
- Clicking shows an inline confirm block (not a modal): "Publishing locks the
  questions and the pass mark. Every candidate you assign sees exactly this
  version." with **Cancel** and **Publish**.
- Publish → `publishRecruiterAssessmentAction({ assessmentId })`.
  `ok` → `toast.success(alreadyPublished ? "Already published" : "Published")`,
  `router.refresh()`. `!ok` → `toast.error(message)`; keep the confirm open.
- Buttons disabled while pending.

**PUBLISHED:**
- Heading "Assign to Shortlisted candidates".
- Empty `candidates`: "Your Shortlist is empty. Shortlist candidates on Hire, then
  come back to assign." + `<Link href="/hire">` styled `hire-assess-linkbtn`.
- Otherwise a list, one row per candidate: a checkbox, the label, the job role.
  `alreadyAssigned` rows render the checkbox **checked and disabled** with an
  "Assigned" tag and are never sent.
- "Select all not yet assigned" toggle above the list.
- Submit button "Assign to N candidate(s)" — disabled when N = 0, when pending, or
  when N > `MAX_ASSIGN_PER_CALL` (then show "Assign at most 25 at a time").
- Submit → `assignRecruiterAssessmentAction({ assessmentId, candidateRefs })`.
  `ok` → `toast.success` with
  "Assigned to {assigned}." plus " {alreadyAssigned} already had it." when > 0;
  when `notificationFailures > 0` also
  `toast.warning("{n} notification(s) could not be sent. Assign again to retry — nobody is notified twice.")`.
  Clear the selection, `router.refresh()`. `!ok` → `toast.error(message)`, keep
  the selection.

**ARCHIVED:** render nothing (nothing writes ARCHIVED yet).

Accessibility: the list is a `<fieldset>` with a `<legend>`; each checkbox has a
`<label>`; the pending state sets `aria-busy` on the fieldset.

### Step 9 — List page (`src/app/hire/assessments/page.tsx`)

- Title link: `href={\`/hire/assessments/${row.id}\`}`.
- "Open builder" link: **leave as is** (T-243's reopen gap is out of scope).
- Students / Passed / Failed: `row.results ? row.results.students : "—"` (and
  `.passed`, `.failed`). DRAFT keeps `—`; a published row shows real numbers,
  including `0`.
- Delete form: render only when `row.status === "DRAFT"`.
- Footnote replaced with: "Students counts candidates you assigned. Passed and
  Failed count completed attempts against the pass mark. Drafts show — until
  they're published."

### Step 10 — Chrome + CSS

`hire-chrome.tsx`: in the "Assessments" nav link, replace both
`pathname === "/hire/assessments"` expressions with
`pathname?.startsWith("/hire/assessments") === true`. Nothing else in the file
changes — `/hire/assessments/<id>` is two segments, so the desk regex already
treats it as a plain page.

`hire-scout.css`, next to the existing `hire-assess-*` rules:
`.hire-assess-detail`, `.hire-assess-detail__back`, `.hire-assess-detail__head`,
`.hire-assess-detail__facts`, `.hire-assess-detail__stats` (5-column grid, 2
columns under 640px), `.hire-assess-detail__stat`, `.hire-assess-assign`,
`.hire-assess-assign__list`, `.hire-assess-assign__row`,
`.hire-assess-assign__tag`, `.hire-assess-assign__confirm`. Reuse
`.hire-assess-list__table` / `__table-wrap` for the monitor table. Use the colours
and radii the existing `hire-assess-*` rules use — no new colour values.

### Step 11 — Tests

**`recruiter-assessments.test.ts`** — extend `inMemoryStore()` with the five new
methods (a `pool: AssignableCandidate[]` it returns for `listAssignableCandidates`,
an `assignments` map enforcing uniqueness on `assessmentId + candidateUserId`), and
add a `fakeNotifier()` that records calls and emulates `dispatch` dedupe with a
`Set` of `candidateUserId:assessmentId`, with a switch to fail the next N sends.
New cases:

1. publish moves DRAFT → PUBLISHED and sets `publishedAt`.
2. publishing twice returns `alreadyPublished: true` and does not change `publishedAt`.
3. publish of another workspace's id → `NOT_FOUND`.
4. publish with only PARAGRAPH / FILE_UPLOAD questions → `INVALID`.
5. `saveAssessmentDraft` after publish → `CONFLICT` (existing guard, now reachable).
6. assign on a DRAFT → `CONFLICT`, nothing written.
7. assign of another workspace's id → `NOT_FOUND`.
8. assign with a ref not in the pool → `INVALID`, **zero** rows written, zero notifications.
9. assign 3 → 3 rows, 3 notifications, result `{ assigned: 3, alreadyAssigned: 0 }`.
10. assign the same 3 again → no new rows, `{ assigned: 0, alreadyAssigned: 3 }`,
    still exactly 3 unique notifications.
11. the same candidate twice in one call (duplicate ref) → one row, one notification.
12. first send fails for one candidate → 3 rows, `notificationFailures: 1`;
    assigning again delivers it; total unique notifications 3.
13. 26 refs → `INVALID`.
14. delete a PUBLISHED assessment → `CONFLICT`; delete a DRAFT → ok.
15. `listAssessments`: DRAFT row has `results: null`; a PUBLISHED row with rows set
    to (SUBMITTED, passed true), (SUBMITTED, passed false), (ASSIGNED) reports
    `{ students: 3, passed: 1, failed: 1 }`.
16. `getAssessmentMonitor` summary counts `started` from `startedAt` and
    `completed` from SUBMITTED; `candidates` flags `alreadyAssigned`; a DRAFT
    returns `candidates: []`.
17. `getAssessmentMonitor` for another workspace's id → `NOT_FOUND`.

Plus two source-scan cases in the same file (the pattern `isolation.test.ts` uses):
18. `recruiter-assessment-actions.ts` passes `eventType: "assessment.assigned"`
    and `primaryEntityId: assessmentId`, and its notification `title` / `body`
    string literals contain no `${` interpolation.
19. `service.ts` and `prisma-store.ts` never reference `shortlistRefs` inside
    `assignAssessment` / `listAssignableCandidates` (assert the function bodies do
    not contain the word).

**`isolation.test.ts`** — extend the existing assessment suite:
- the action file contains `publishRecruiterAssessmentAction`,
  `assignRecruiterAssessmentAction`, and at least **4** occurrences of
  `requireRecruiterWorkspace()`;
- still no `session.user.id` used as a scope value;
- new suite "assessment detail page 404s a foreign id": the page source contains
  `requireRecruiterWorkspace`, `notFound()`, and does **not** contain
  `searchParams`.

### Step 12 — CHANGELOG

One line under `## Pending reconcile`, e.g.:

`- 2026-09-1X [schema|rule] T-244 (plan 128): RecruiterAssessmentAssignment (one row per assessment×candidate, RESTRICT on assessment) + publish (DRAFT→PUBLISHED, idempotent), assign from the live Shortlist union with one assessment.assigned notification per candidate per assessment, DRAFT-only delete, real Students/Passed/Failed; T-218 owns status/startedAt/submittedAt/scorePercent/passed.`

One line. No prose paragraph.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** touch `middleware.ts`, `src/auth.config.ts` or `src/auth.ts`. Nothing
  in this plan is reachable from the edge bundle.
- **DO NOT** edit anything under `src/features/notification/`. No new event type
  (`"assessment.assigned"` exists), no template file, no direct call to
  `processEmailDelivery`. Use `dispatch()` as it is.
- **DO NOT** put recruiter-authored text (assessment title, subheading, company
  name) into a notification `title` or `body`. The email renderer does not escape
  HTML.
- **DO NOT** use `RecruiterAssessment.shortlistRefs` to decide who can be assigned.
  Resolve candidates from the live Shortlist in `listAssignableCandidates`.
- **DO NOT** accept a `candidateUserId`, `memberId` or email from the client. The
  client sends `candidateRefs`; the server re-resolves every one against the
  recruiter's own Shortlist and refuses the whole call if any is not there.
- **DO NOT** put candidate refs, ids or names in a URL or query string.
- **DO NOT** notify only newly created rows, and **DO NOT** send notifications in
  parallel (`Promise.all`). Sequential, every row, capped at `MAX_ASSIGN_PER_CALL`.
- **DO NOT** build `/assessments/[assignmentId]` or any candidate-side page, answer
  storage, autosave, timer, submit or scoring — that is **T-218**. T-244 code
  never writes `status` (beyond the default), `startedAt`, `submittedAt`,
  `scorePercent` or `passed`.
- **DO NOT** use `Question` / `QuestionOption` / `QuizActivityConfig` /
  `ActivityAttempt` / `AssessmentReport` / `AssessmentScore` / `SkillEvidence` /
  `TalentEngagementRequest` / `TalentList*` / `PipelineStage`.
- **DO NOT** fix T-243's gaps here: no sections, no draft reopen/edit, no change to
  how `/hire/create-test` captures the Shortlist. Do not edit
  `assessment-builder.tsx`, `question-editor.tsx`, `candidate-assessment-screen.tsx`,
  `assessment-types.ts` or `create-test/page.tsx`.
- **DO NOT** edit `src/app/hire/layout.tsx`, `src/features/talent-pool/pool.ts` or
  `src/features/hire/project-shortlist.ts` — call their exports.
- **DO NOT** add archive, unpublish, reminders, deadlines or per-candidate
  un-assign.
- **DO NOT** return 403 for another workspace's assessment. Service → `NOT_FOUND`,
  action → `status: 404`, page → `notFound()`.
- **DO NOT** add `requireRole` / `requireAdmin`. Pages use `requireRecruiter()`;
  actions and the page's data read use `requireRecruiterWorkspace()`.
- **DO NOT** use `<Button asChild>` / `<Button render={<Link>}>`, and do not render a
  disabled `<Link>`.
- **DO NOT** return full Prisma records — explicit `select` everywhere. Multi-step
  writes go in `prisma.$transaction`.
- **DO NOT** use `console.*` (logging via `lib/logger.ts`), `any`, or `as` casts on
  the question union.
- **DO NOT** create files this plan does not list — no `use-assign.ts` hook, no
  `shortlist-union.ts`, no `constants.ts`.
- **DO NOT** run `prisma db push`, `prisma migrate dev`, `prisma migrate deploy`,
  seeds or ad-hoc SQL against the production database, and **do not run
  `next dev` with the new generated client while `.env.local` points at
  production** (plan 115's P2022 incident). §7 is the procedure.

## 7. DB safety

Schema change: **creates-only** — one enum, one table, three indexes, two FKs. No
existing table or column changes. No backfill.

1. **Checkpoint.** Commit the non-schema work first; record the hash in the PR body.
2. **Point away from production.** `.env.local` holds the production
   `DATABASE_URL`. Before any DB command or `next dev`, set `DATABASE_URL` and
   `DIRECT_URL` to either a local Postgres (e.g. the `.env.test.local` database
   plan 115 used) or a Neon **child branch of production**. Confirm the host
   `prisma migrate status` prints is not the production host
   (`PRODUCTION_NEON_HOST_ID`). If you cannot prove it, stop.
3. **Know what production has.** Create a Neon child branch from production and
   run `npx prisma migrate status` against it. It tells you whether T-243's
   `20260911090000_recruiter_assessment_builder` is applied on production — this
   plan's FK depends on that table. Record the result in the PR body.
4. **Generate the SQL offline** (step 2) and review it.
5. **Rehearse on the child branch:** `npx prisma migrate deploy` with the child's
   `DIRECT_URL`. Expected: applies `20260911180000_…` (and `20260911090000_…` too,
   if step 3 showed it missing). Then confirm in `psql`:
   `\d "RecruiterAssessmentAssignment"` shows the unique index
   `RecruiterAssessmentAssignment_assessmentId_candidateUserId_key` and both FKs.
6. **Production is not applied by this plan.** Sohail reviews the migration before
   merge (plan 112 §5.5). Note: `vercel.json` builds with `npm run build:deploy`,
   which runs `prisma migrate deploy` — so **merging to master is what applies it
   to production**, and Sohail's review is the gate. `project-context.md` §16 says
   `migrate deploy` cannot run on production, and the 2026-09-02 CHANGELOG entry
   says it does; confirm with Sohail which is true today before merging.
7. **Rollback:** `DROP TABLE "RecruiterAssessmentAssignment"; DROP TYPE "AssessmentAssignmentStatus";`
   No other table references it. Notifications already sent stay in
   `UserNotification` with a link that will 404.

## 8. Verification

**Build / typecheck** (Windows: the `test:demo1-security` npm script fails on
`NODE_OPTIONS` without `cross-env` — run the suite directly as below)
- `npx tsc --noEmit` — clean.
- `npx eslint` on every file in §3 — no new errors.
- `npm run build` — succeeds.
- `npm run test:recruiter-assessments` — all green (7 existing + 19 new).
- `npx cross-env NODE_OPTIONS=--conditions=react-server tsx src/features/hire/isolation.test.ts` — all green.

**Manual — against the local DB or the child branch from §7, never production.**
Setup: `ENABLE_RECRUITER_AUTH=true`; recruiter A and recruiter B (work-email
accounts); at least 4 searchable candidate accounts you can sign in as (the
`@abtalks.dev` seed users with `ENABLE_DEV_AUTH=true`). As recruiter A, shortlist
3 candidates — at least one through a talent project (T-149) so the project half
of the Shortlist is exercised.

1. Build a draft in `/hire/create-test` with one MCQ worth points. `/hire/assessments`
   shows it as DRAFT with `—` / `—` / `—` and a Delete button.
2. Click the title → `/hire/assessments/<id>`. "Assessments" in the nav is
   highlighted. The page shows the draft line and **Publish assessment**; no stats,
   no table.
3. Publish → confirm → toast "Published"; status chip PUBLISHED; stats all 0; the
   list page shows `0 / 0 / 0` and **no** Delete button for this row.
4. **Publish is idempotent:** in the DB,
   `SELECT status, "publishedAt" FROM "RecruiterAssessment" WHERE id = '<id>'` —
   one PUBLISHED, `publishedAt` set once. (The service tests cover double submits.)
5. **Assign:** the panel lists all 3 Shortlisted candidates, including the project
   one. Select all → **Assign to 3 candidates** → toast "Assigned to 3." The table
   shows 3 rows, "Not started"; stats Assigned 3.
6. **One notification each:**
   ```sql
   SELECT "recipientUserId", COUNT(*) FROM "UserNotification"
   WHERE "eventType" = 'assessment.assigned' AND "primaryEntityId" = '<id>'
   GROUP BY 1;
   ```
   3 rows, each count 1. `NotificationDelivery` has one `in_app` row (`sent`) per
   notification.
7. Shortlist a 4th candidate, return, and assign just them → "Assigned to 1." The
   first 3 show as "Assigned" and cannot be re-selected. Re-run the SQL: 4 rows,
   each still 1.
8. Sign in as one candidate: the bell shows "You have a new assessment to take"
   exactly once. Its link goes to `/assessments/<assignmentId>` and **404s until
   T-218 lands** — expected.
9. **Simulate T-218 (local/child DB only):**
   ```sql
   UPDATE "RecruiterAssessmentAssignment"
   SET status = 'SUBMITTED', "startedAt" = now() - interval '20 minutes',
       "submittedAt" = now(), "scorePercent" = 80, passed = true
   WHERE id = '<assignment A>';
   UPDATE "RecruiterAssessmentAssignment"
   SET status = 'STARTED', "startedAt" = now() WHERE id = '<assignment B>';
   ```
   Reload: A shows Completed · 80% · Passed; B shows In progress; stats
   Assigned 4 · Started 2 · Completed 1 · Passed 1 · Failed 0. The list page shows
   `4 / 1 / 0`. Set another row to `passed = false` and confirm Failed and the list
   update.
10. **Isolation:** as recruiter B (same email domain), `/hire/assessments` is empty,
    and `/hire/assessments/<A's id>` is a **404**.
11. **Delete rule:** a PUBLISHED row has no Delete button; a new DRAFT can still be
    deleted.
12. **Mobile (375px):** the detail page's stats wrap to 2 columns, the monitor
    table scrolls inside its wrapper, and the assign list is usable.
13. **Regression:** `/hire`, the Shortlist panel and its "Create assessment for
    Shortlisted" CTA, `/hire/create-test`, `/hire/requests`, `/hire/matches` and
    `/hire/evidence` look and behave as before.

**Files that should have changed** — exactly the list in §3, nothing else.

## 9. Deliberately out of scope

- **T-218:** the candidate route `/assessments/[assignmentId]`, answer storage,
  autosave and resume, the timer, submission, and scoring. Until it lands, a
  notification's link 404s — do not assign to real candidates on production before
  T-218 ships (release call: Sohail).
- **T-219:** integrity signals. **T-273:** admin assessment support.
- **T-249:** notifying the recruiter when a candidate completes.
- Manual grading of PARAGRAPH / FILE_UPLOAD answers; `AssessmentReport` /
  `AssessmentScore`; `SkillEvidence` (T-220 / T-221).
- **T-243 gaps:** sections (`sectionId` stays null), reopening/editing a saved
  draft, and the builder capturing only the legacy Shortlist.
- Archive, unpublish, un-assign, deadlines, reminders, resend.
- Credit or plan limits on assigning; rate limiting beyond the 25-per-call cap and
  Shortlist membership (T-258 can add it).
- T-248 fixes: HTML escaping in `template-renderer.ts`, and a cron for
  `retryFailedDeliveries`.

## 10. Contract handed to T-218

Proposed by T-244. **Confirm with T-218's owner before the migration merges** — the
table is the seam between the two tickets.

- **Route:** `candidateAssessmentHref(assignmentId)` = `/assessments/<assignmentId>`,
  exported from `src/features/recruiter-assessments/service.ts`. The page must
  `notFound()` unless `assignment.candidateUserId === session.user.id` and the
  assessment is PUBLISHED. The new route also needs adding to
  `protectedPaths` in `middleware.ts` (edge-safe string only).
- **T-218 writes only** `status`, `startedAt`, `submittedAt`, `scorePercent`,
  `passed`, always through guarded `updateMany`:
  - start: `where { id, candidateUserId: <session>, status: "ASSIGNED" }` →
    `status: "STARTED", startedAt: now`;
  - submit: `where { id, candidateUserId: <session>, status: { in: ["ASSIGNED", "STARTED"] } }` →
    `status: "SUBMITTED", submittedAt: now, scorePercent, passed`. A second submit
    matches nothing — that is T-218's "duplicate submission is refused".
- **Score** (what the monitor assumes): `scorePercent = round(100 × MCQ points
  earned ÷ total MCQ points)`; PARAGRAPH and FILE_UPLOAD are excluded, matching the
  schema comment on `passMarkPercent`. `passed = scorePercent >= passMarkPercent`.
  An MCQ with `allowMultipleCorrect` earns its points only when the selected set
  equals the correct set.
- **Answers** live in T-218's own table keyed on `assignmentId` (FK, cascade), in
  T-218's own migration. T-218 does not add columns to this table without the T-244
  owner's review.

## 11. Decisions made in this plan (change before implementing if you disagree)

| # | Decision | Why |
|---|---|---|
| D1 | Candidate link is `/assessments/<assignmentId>` | Notifications are stored with their link; agreeing it now means links sent before T-218 start working the day it lands. |
| D2 | Students = assigned; Passed / Failed = graded results; DRAFT shows `—` | Matches the ticket's "who started, who completed, result against the pass mark". |
| D3 | The Shortlist merge is repeated inside `listAssignableCandidates`, not extracted from `layout.tsx` | Keeps this plan out of the hire desk's files. The precedence rule is identical. If the hire owner prefers one shared function, swapping it in is a one-line change later. |
| D4 | Publishing needs at least one MCQ worth points | The pass mark is a share of auto-gradeable points; without any, T-218 cannot produce a result. |
| D5 | At most 25 candidates per assign call, sent one at a time | Emails send inline; this keeps a call well inside the 60s limit. |
| D6 | One notification per candidate per **assessment**, ever | `primaryEntityId = assessmentId`. Re-assigning never re-notifies. |
| D7 | Assignment → assessment `RESTRICT`; → candidate `CASCADE` | Results are not destroyed by a recruiter-side delete; a candidate's own deletion still removes theirs. |

**Risks to track:** T-218 must ship before assigning on production (dead link);
failed emails are never retried (no cron for `retryFailedDeliveries`); the email
renderer does not escape HTML (raise with T-248's owner); T-243's migration status
on production is unverified; the board still lists shashank as T-244's owner.

## 12. Commit message

```
feat(hire): publish, assign and monitor recruiter assessments (T-244)

Adds RecruiterAssessmentAssignment — one row per assessment and candidate,
RESTRICT on the assessment so published results survive, CASCADE on the
candidate. A recruiter publishes a DRAFT (idempotent: the DRAFT guard is in
the update's WHERE), then assigns it from their live Shortlist — legacy and
T-149 project halves, re-checked for searchability, never from the frozen
shortlistRefs. Each candidate gets exactly one assessment.assigned
notification per assessment through T-248's dispatch(); assigning again
retries a failed send without duplicating. /hire/assessments/[id] shows
publish, assign and a monitor (not started / in progress / completed,
score, pass/fail); the list shows real Students / Passed / Failed.
Published assessments can no longer be deleted. Candidate taking, submit
and scoring are T-218, which writes the status and result columns.
```
