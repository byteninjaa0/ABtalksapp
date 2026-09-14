# 140 — T-250 Job alerts (TC-C-009 / TC-C-010 / TC-C-011)

**Status:** DRAFT FOR REVIEW. Not signed, not approved, not started.
**Branch:** `feature/T-250-job-alerts` off `master` (created 2026-09-14).
**Owner (task):** Manuvrtti. **Executing:** Shivansh, cross-module authorized in
chat 2026-09-14 (jobs + notifications + schema).

## 1. Goal

As a candidate, I define alert criteria (skills, role, location, opportunity
type). When a recruiter first publishes a matching job I receive **exactly one**
in-app notification and one email. Non-matching candidates receive nothing.
Editing or re-publishing the same job sends nothing further. I can turn alerts
off. Everything is rule-based — no ML, no recommendation engine, no new
transports (no WhatsApp, no SMS).

Acceptance from task grid:
- One notification per candidate per job
- Nothing on edit or re-publish
- Nothing for non-matching candidates
- Alerts can be disabled
- Delivery state recorded (already handled by T-248)

## 2. Current behavior

- **T-245 recruiter jobs — done.**
  [src/features/recruiter-jobs/service.ts:184-197](../../src/features/recruiter-jobs/service.ts#L184-L197)
  `transitionJob` and the `lifecyclePatch` helper at
  [src/features/recruiter-jobs/lifecycle.ts:36-60](../../src/features/recruiter-jobs/lifecycle.ts#L36-L60)
  set `publishedAt = now` **only when `!current.publishedAt`** — so it fires
  once, on the first DRAFT→PUBLISHED transition. Reopen (CLOSED→PUBLISHED)
  preserves the original `publishedAt`. This is the exact primitive T-250
  needs.
- **T-248 notification service — done.**
  `dispatch()` at
  [src/features/notification/notification-service.ts:49-147](../../src/features/notification/notification-service.ts#L49-L147)
  is dedup-keyed on `${eventType}:${recipientUserId}:${primaryEntityId}` and
  swallows P2002 as `deduplicated: true`. `EVENT_TYPE_REGISTRY` at
  [src/features/notification/event-types.ts](../../src/features/notification/event-types.ts)
  gates email on `priority: "important"` and consults
  `NotificationPreference` for per-user opt-out. Templates loaded by filename
  at
  [src/features/notification/template-renderer.ts:53-70](../../src/features/notification/template-renderer.ts#L53-L70),
  falling back to a generic layout when the eventType file is missing.
- **No candidate-side job alerts today.** Grep for `JobAlert` / `jobAlert` /
  `job_alert` returns zero code hits. The only "alert" cron is
  [src/features/hire/run-hire-alerts.ts](../../src/features/hire/run-hire-alerts.ts)
  — that's the **recruiter-side** TalentRequest scan and is unrelated.
- **Publish is currently silent.**
  [src/app/actions/recruiter-job-actions.ts:180-182](../../src/app/actions/recruiter-job-actions.ts#L180-L182)
  calls `runTransition(input, "publish")`, which calls `transitionJob`, which
  updates the row and returns. No notification dispatch.

## 3. Files to touch

### Schema + migration
- `[edit]` `prisma/schema.prisma` — add `JobAlert` model + `User.jobAlerts` back-relation.
- `[new]` `prisma/migrations/20260914120000_t250_job_alerts/migration.sql`.

### Feature code
- `[new]` `src/features/job-alerts/types.ts` — `JobAlertCriteria`, `JobAlertRow`.
- `[new]` `src/features/job-alerts/matcher.ts` — pure function `matches(job, criteria)`.
- `[new]` `src/features/job-alerts/matcher.test.ts` — unit tests for the rule set.
- `[new]` `src/features/job-alerts/prisma-store.ts` — `prismaJobAlertStore()` + `findMatchingAlertsForJob(job)`.
- `[new]` `src/features/job-alerts/service.ts` — `upsertMyAlert`, `disableMyAlert`, `enableMyAlert`, `getMyAlert`, and `fanoutOnJobPublished(job)`.
- `[new]` `src/features/job-alerts/service.test.ts` — TC-C-009/010/011 scenarios against in-memory stores.

### Notification wiring
- `[edit]` `src/features/notification/event-types.ts` — add `"job.alert.match"` (priority `important`, defaultEmailEnabled `true`).
- `[new]` `src/features/notification/templates/job.alert.match.html`
- `[new]` `src/features/notification/templates/job.alert.match.txt`

### Publish hook
- `[edit]` `src/features/recruiter-jobs/service.ts` — `transitionJob` returns `{ id, status, firstPublish: boolean }` and, when `firstPublish`, invokes an injected `onFirstPublish?: (job) => Promise<void>` hook. Keeps the service pure — production wiring in the action passes the fanout.
- `[edit]` `src/app/actions/recruiter-job-actions.ts` — `publishRecruiterJobAction` wires `onFirstPublish` to `fanoutOnJobPublished`. Fanout is **await**-ed after the transaction commits and its failure is logged but does not fail the publish (the row is already updated and dispatch is idempotent — a retry cron / next publish would re-attempt cleanly).

### Server action + candidate UI
- `[new]` `src/app/actions/job-alert-actions.ts` — `getMyJobAlertAction`, `saveMyJobAlertAction`, `disableMyJobAlertAction`, `enableMyJobAlertAction`. Zod at the boundary.
- `[new]` `src/lib/validations/job-alert.ts`.
- `[new]` `src/app/jobs/alerts/page.tsx` — Server Component page, candidate-only.
- `[new]` `src/components/jobs/job-alert-form.tsx` — `"use client"`. Skills chip input (reuses `SkillCombobox` if practical, else a plain tag input to avoid coupling Shivansh's skill catalog to Manuvrtti's job-alerts surface), work-mode radio, JobType radio, location text, master toggle.

## 4. Server vs Client

| Component | Kind | Notes |
|---|---|---|
| `src/app/jobs/alerts/page.tsx` | Server | Reads current alert via `getMyJobAlertAction`, passes plain-object props to the client form. |
| `src/components/jobs/job-alert-form.tsx` | Client | Submits via server actions. Receives only serializable props. |
| `src/features/job-alerts/*` | Server | `import "server-only"` in `service.ts` + `prisma-store.ts`. |
| `src/app/actions/job-alert-actions.ts` | Server Action | `"use server"` header. |

No Server→Client function / icon / class-instance props.

## 5. Steps

### Step 1 — Schema
Add to `prisma/schema.prisma` beside `Notification*` block:

```prisma
/// T-250 candidate job alert. Rule-based, not a recommendation engine.
/// Exactly one row per candidate (`@@unique([candidateUserId])`); disabling
/// keeps the row and flips `enabled = false` so the same criteria come back
/// on re-enable.
model JobAlert {
  id              String      @id @default(cuid())
  candidateUserId String      @unique
  enabled         Boolean     @default(true)
  skills          String[]    @default([])
  role            String?
  location        String?
  workMode        JobWorkMode?
  opportunityType JobType?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  candidate User @relation("CandidateJobAlerts", fields: [candidateUserId], references: [id], onDelete: Cascade)

  @@index([enabled])
}
```

Add on `User`:
```prisma
jobAlerts JobAlert[] @relation("CandidateJobAlerts")
```

### Step 2 — Migration
`prisma/migrations/20260914120000_t250_job_alerts/migration.sql`:
- `CREATE TABLE "JobAlert" (…)` with the columns above.
- `CREATE UNIQUE INDEX "JobAlert_candidateUserId_key" ON "JobAlert"("candidateUserId")`.
- `CREATE INDEX "JobAlert_enabled_idx" ON "JobAlert"("enabled")`.
- FK `JobAlert_candidateUserId_fkey` → `User("id") ON DELETE CASCADE`.

### Step 3 — Event registry
In [event-types.ts](../../src/features/notification/event-types.ts) add:
```ts
"job.alert.match": {
  key: "job.alert.match",
  label: "Job alert match",
  priority: "important",
  suppressionExempt: false,
  emailExempt: false,
  defaultEmailEnabled: true,
},
```
`suppressionExempt: false` is deliberate — the T-248 preference row can turn
the *email* off; the master alert toggle (`JobAlert.enabled`) turns the whole
match off before dispatch even runs.

### Step 4 — Templates
Copy `application.received.html` / `.txt` as the starting point; retitle
"A new job matches your alert" and swap the CTA to `/jobs/{{jobId}}`.

### Step 5 — Matcher (pure, testable)
`src/features/job-alerts/matcher.ts`:

```ts
export type JobAlertCriteria = {
  enabled: boolean;
  skills: string[];               // case-insensitive contains-any
  role: string | null;            // case-insensitive substring on job.title
  location: string | null;        // case-insensitive substring on job.location
  workMode: JobWorkMode | null;   // exact
  opportunityType: JobType | null;// exact
};

export type MatchableJob = Pick<
  JobRow,
  "title" | "location" | "workMode" | "type" | "skills"
>;

export function matches(job: MatchableJob, criteria: JobAlertCriteria): boolean;
```

Rules (all set fields must pass; unset fields are wildcards):
- `enabled === false` → never matches.
- `skills.length > 0` → job.skills must intersect (case-insensitive, trimmed).
- `role` set → substring match on `job.title` (case-insensitive).
- `location` set → substring match on `job.location` (case-insensitive; null job.location fails only if criteria.location is set).
- `workMode` set → exact enum match.
- `opportunityType` set → exact enum match against `job.type`.
- A criteria with **every field null and skills empty and enabled true** matches everything by design — it's the "alert me for all published jobs" case. Documented in the form copy.

### Step 6 — Store
`prismaJobAlertStore()` exposes:
- `getByCandidate(userId)`
- `upsert(userId, data)` — creates or updates the single row.
- `setEnabled(userId, enabled)`
- `findEnabledMatching(job)` — server-side prefilter using array-contains
  on skills to keep the fanout scan small; the pure `matches()` function
  runs on the returned candidates to enforce the full rule set.

### Step 7 — Fanout
`fanoutOnJobPublished(job)`:
1. `findEnabledMatching(job)` → alert rows.
2. For each alert, call `dispatch({
     eventType: "job.alert.match",
     recipientUserId: alert.candidateUserId,
     primaryEntityId: job.id,                       // ← dedup vs job, so edit/re-publish never sends twice
     title: "A new job matches your alert",
     body: `${job.title} at ${job.company} — ${job.location ?? "location TBD"}`,
     href: `/jobs/${job.id}`,
     metadata: { alertId: alert.id },
   })`.
3. Collect `{ deduplicated, ok }` counts, log at info; a single failure does
   not abort the loop.

### Step 8 — Hook publish
- `transitionJob(deps, actor, jobId, action)` returns
  `{ id, status, firstPublish }` where `firstPublish = action === "publish" && !oldRow.publishedAt`. Compute from the pre-image already loaded by `loadOwned`.
- Extend `ServiceDeps` with optional `onFirstPublish?: (job: JobRow) => Promise<void>`. Purity preserved for tests.
- `publishRecruiterJobAction` injects `onFirstPublish: (job) => fanoutOnJobPublished(job)` and awaits it inside a try/catch, logging failures without failing the publish response.

### Step 9 — Server actions
Standard shape (Zod → workspace/session gate → service → revalidate).
Candidate gate (not recruiter): use `auth()` from `@/auth`, not
`requireRecruiterWorkspace`.

### Step 10 — UI
- `/jobs/alerts` — Server Component fetches current alert; renders empty state
  when none; renders form when one exists. Master toggle at the top.
- `job-alert-form.tsx` — controlled form, calls save/disable/enable actions,
  shows the result envelope's message on failure.

### Step 11 — Tests
`src/features/job-alerts/service.test.ts` covers the exact task-grid manual test:
- Criteria: React, full-time, Bengaluru.
- Publish matching job → one dispatch, ok/deduplicated:false. **TC-C-009**.
- Edit the same job and re-transition (there is no explicit re-publish
  because status is already PUBLISHED; simulate by calling
  `fanoutOnJobPublished` again with the same job id) → dedup path returns
  `deduplicated: true`; no new notification row. **TC-C-010**.
- Publish a non-matching job (e.g. Python, part-time, Mumbai) → zero
  dispatches. **TC-C-011**.
- Disable alert (`enabled = false`) → publish matching job → zero dispatches.
- Re-enable → prior criteria come back (upsert didn't wipe skills/role).
- Matcher unit tests: skills case-insensitive, empty-criteria matches all,
  workMode exact, opportunityType exact, missing job.location vs
  criteria.location.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** introduce a recommendation engine, embeddings, ML scoring, or
  any second notification transport (no WhatsApp, no SMS). T-250 is
  rule-based matching; task grid explicitly forbids the rest.
- **DO NOT** fire alerts on job **update**. Update never transitions
  `publishedAt`; the hook is on `transitionJob` only.
- **DO NOT** fire alerts on **reopen** (CLOSED→PUBLISHED). `firstPublish`
  is guarded by `!oldRow.publishedAt`.
- **DO NOT** rely on client-side dedup; the guarantee comes from
  `UserNotification.dedupeKey`'s unique index.
- **DO NOT** import `@/lib/*` from anything in the edge/middleware path.
  This plan touches none of that path — flag if the compiler suggests
  otherwise.
- **DO NOT** wire outreach.reply_received or other T-249 events here; T-249
  is a separate task and still blocked by T-247.
- **DO NOT** use `<Button asChild>` or `Button render={<Link>}` — use
  `buttonVariants` on `<Link>` per CLAUDE.md.
- **DO NOT** use `console.error` — `lib/logger.ts` only.
- **DO NOT** touch `NotificationRead` / the broadcast `Notification` model —
  those are the T-067 bell, not T-248 transactional path.
- **DO NOT** modify `TalentList*`, `RecruiterProfile`, `TalentRequest*`, or
  anything else Shashank/Zainab own. If a compiler error suggests it,
  stop and ask.
- **DO NOT** widen `transitionJob` return type without updating both call
  sites and the test that asserts against it.

## 7. DB safety

Schema/data change ⇒ mandatory checklist per CLAUDE.md §7:
- [ ] Commit checkpoint on `master` head (`41e2179f`) before creating the
      Neon branch snapshot.
- [ ] Neon branch snapshot named `pre-t250-2026-09-14`.
- [ ] Record commit hash of the snapshot in the plan's execution log.
- [ ] Migration order:
  1. `npx prisma format`
  2. `npx prisma migrate dev --name t250_job_alerts` locally
  3. Regenerate client: `npx prisma generate`
  4. Verify the migration file at
     `prisma/migrations/20260914120000_t250_job_alerts/migration.sql`.
- [ ] No backfill required — new table starts empty; existing users have
      no alerts and receive nothing (correct behavior).
- [ ] `ENABLE_NEW_*` flags: untouched. This ticket is 078-adjacent, not a
      migration of any legacy read/write path.

## 8. Verification

- Type check: `npx tsc --noEmit`.
- Unit tests: `npx tsx src/features/job-alerts/service.test.ts` and
  `npx tsx src/features/job-alerts/matcher.test.ts` — expect all green.
- Regression: `npx tsx src/features/recruiter-jobs/recruiter-jobs.test.ts`
  and `npx tsx src/features/candidate-jobs/candidate-jobs.test.ts` —
  neither is touched functionally; must still pass.
- Manual walk-through against a local database:
  1. Two candidate accounts A (React/full-time/Bengaluru) and B (Python/
     part-time/Mumbai) each set their alert on `/jobs/alerts`.
  2. Recruiter creates a draft job matching A's criteria — no
     notification for either.
  3. Recruiter **publishes** it — A gets one bell entry and one email; B
     none.
  4. Recruiter edits the job title, then presses "Save"; the row is
     updated. **No new notification for A** (publish transition did not
     re-run).
  5. Recruiter closes, then reopens (CLOSED→PUBLISHED). **No new
     notification for A** (`publishedAt` already set).
  6. Toggle A's alert off. Recruiter publishes another matching job — A
     receives nothing.
  7. Toggle A's alert on. Recruiter publishes another matching job — A
     receives one bell + email.
- Only these files should change (git diff): the ones listed in §3, plus
  the migration folder.

## 9. Commit message

```
feat(jobs): T-250 candidate job alerts (rule-based matching)

Add JobAlert schema and candidate-side criteria (skills, role, location,
work mode, opportunity type, master toggle). On first-time DRAFT→PUBLISHED
transition, fan out one job.alert.match notification per matching alert.
Idempotent via UserNotification.dedupeKey — edit and reopen never re-send.
No recommendation engine, no second transport.

Refs: T-250, TC-C-009, TC-C-010, TC-C-011
```

---

## Follow-ups shipped after the initial cut

- **Admin path fanout** — `admin-job-actions.createJobAction` and
  `toggleJobOpenAction` also fire the alert fanout when a job publishes.
  `createJobAction` always publishes on create, so the fanout runs
  unconditionally. `toggleJobOpenAction` reads the prior status and only
  fanouts when the toggle is a real DRAFT/CLOSED → PUBLISHED transition.
  Same dedup key as the recruiter path, so an accidental double-toggle
  never double-sends.

## Not in scope (documented so nobody expands it mid-execution)

- T-249 recruiter notification events. Still blocked by T-247, which is
  blocked by T-240 pipeline stages.
- T-247 applicant/sourced convergence into a single pipeline. Same block.
- Any change to the T-067 admin broadcast Notification model.
- Any change to `NotificationRead` bell behavior.
- Digest batching. T-248 spec allows batching low-priority notices; T-250
  is `important`, ships as single events.
- Cron re-scan of published jobs against new alerts. If a candidate sets an
  alert *after* a matching job has already published, no notification
  fires — this matches T-250's "when a recruiter PUBLISHES a matching job"
  wording. Adding a retroactive backfill is a separate plan.
