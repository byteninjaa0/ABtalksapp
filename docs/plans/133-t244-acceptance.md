# T-244 / TC-R-018 — Publish, assign, monitor and results (acceptance)

**Board:** R9 Assessments · B1 Build · Demo 1 · owner shashank · covers **TC-R-018**
**Depends on:** T-243 (plan 121), T-248. **Design:** T-203.
**Status:** **acceptance complete** (2026-09-11) on `feat/t244-assessment-acceptance`.

> **Done bar:** "Publish and assign work, notification is exactly one per candidate,
> and started/completed/result are visible."

---

## 1. Goal — why this plan exists

T-244's implementation was **already written and merged** before this branch opened:
`0f7e19f9` "T-244 Recruiter assessment wiring" and `cdaa8cf6` (T-218/T-243/T-244),
both by **Shivansh-Rai** via PR #296, with presets added afterwards in `773e400b`
(PR #298, manuVrtti). Plan 128 already documents the design.

So this is **not a build plan**. It is the acceptance pass the board row actually
asks for: make the merged feature runnable, prove it against TC-R-018 in a browser,
fix only what genuinely fails, and produce the evidence.

**Total feature-code change: one line** (`hire-chrome.tsx`). Everything else was
environment, fixtures, verification and documentation.

## 2. What was verified present (not assumed)

| Capability | Where |
|---|---|
| Publish DRAFT→PUBLISHED, idempotent, needs ≥1 MCQ worth points | `recruiter-assessments/service.ts:293-328`; DRAFT guard inside `updateMany`'s WHERE at `prisma-store.ts:240-248` |
| Assign from the live Shortlist union (legacy + T-149), never frozen `shortlistRefs` | `service.ts:330-400`; union `prisma-store.ts:250-299` |
| **Exactly one notification per candidate per assessment** | `recruiter-assessment-actions.ts:133-150` → `dispatch()`; dedupe key `eventType:recipientUserId:primaryEntityId` with `primaryEntityId` = the **assessment** id; enforced by a **DB unique index** on `UserNotification.dedupeKey` (`schema.prisma:1840`) via insert-then-catch-P2002, so it is race-safe |
| Monitor — started / completed / result vs pass mark | `app/hire/assessments/[assessmentId]/page.tsx`; `getAssessmentMonitor` `service.ts:402-445` |
| Results `scorePercent` / `passed` | read `service.ts:411-417`; written by T-218 `assessment-attempts/service.ts:229-230` |

## 3. Database

Migrations `20260911180000_recruiter_assessment_assignment` (T-244) and
`20260911210000_assessment_answer` (T-218) were applied to **no** database.

`prisma migrate deploy` on the dev Neon branch **failed** with P3018 / SQL 42710,
`type "AssessmentAssignmentStatus" already exists` — the objects were already there
from an earlier `prisma db push` on that shared branch, with no migration recorded.

Before touching the bookkeeping, the live objects were compared against the
migration SQL: enum values, all 11 columns and types, nullability, all three indexes
(including `assessmentId_candidateUserId_key`) and all four FKs with their
RESTRICT/CASCADE rules — **an exact match**. Both migrations were then reconciled
with `prisma migrate resolve --applied`, which writes only `_prisma_migrations`.
`migrate status` → *"Database schema is up to date!"*

**Production was never touched.** Target stayed `ep-young-shadow-amawetjy`.

⚠️ `20260909120000_workshop_events` exists in the dev DB with no folder in the repo.
Prisma stops reporting it once nothing is pending, but **`prisma migrate dev` would
still offer to reset the database** — never run it here.

⚠️ Unresolved and **for Sohail**: plan 128 §7 step 6 records a contradiction about
whether `prisma migrate deploy` runs on production — `project-context.md` §16 says it
cannot, the 2026-09-02 changelog says it does. Three assessment migrations land
together on the next `master` deploy. Not settled by this plan.

## 4. The clean-room problem (the serious finding)

The dev `/hire` pool was **69 searchable users, not 3**. `HIRE_OPEN_COHORT_IDS`
listed two live cohorts — "AI Cohort USA" (19) and "AI Cohort India Aug 26" (45) —
populated with **real teammates and students on real Gmail addresses**.

The first walkthrough attempt shortlisted three of them. `BREVO_API_KEY` was live and
`assessment.assigned` is `priority: "important"`, `emailExempt: false`,
`defaultEmailEnabled: true`, so **pressing Assign would have emailed three real
people from a dev box**. Caught before the assign step; nothing was created.

Pool isolation alone is **not** sufficient: `listAssignableCandidates` reads the
shortlist plus searchability, **not** cohort membership, so the real people stayed in
the assign panel until they were un-shortlisted through the UI.

**Clean-room recipe** (local `.env.local` only, restored byte-identically afterwards):

```
HIRE_OPEN_COHORT_IDS=      # -> published-only -> the fixture cohort alone
HIRE_CHALLENGE_POOL=       # -> hireChallengePool() enabled:false
BREVO_API_KEY=             # -> sendEmail returns skipped; no outbound mail possible
```

Verified afterwards: `fixtures=3  real=0`. In-app notifications are still written, so
the "exactly one notification" proof survives with zero mail sent.

## 5. Fixture gaps found and fixed (dev seeds only, both production-guarded)

1. **`CandidateVisibility` on only one of three.** `seed-demo-recruiter.ts` gave a row
   to `strong@` alone, so `narrow@` and `consistent@` failed
   `filterSearchableUserIds` — invisible to search and unassignable, making
   "assign to three candidates" impossible. The existing upsert now loops all three.
   *(There is no UI for this: `profile.test.ts:796` asserts the profile form has no
   visibility input; the column is written with `consentSource: "platform_default"`.)*
2. **No `StudentProfile`.** The post-auth gate is *"registered = has a
   StudentProfile"* (`registration-gate.ts`), so signing in as a fixture bounced to
   `/register`, where the form cannot be completed in dev because Vercel Blob is
   unconfigured and the resume upload fails. `resumeUrl` is **optional**, so seeding
   the profile lets the fixture reach `/assessments` and never see the form.
   **The registration gate itself was not weakened** — this is fixture data.

## 6. The one code fix

`hire-chrome.tsx` matched the nav link with `pathname === "/hire/assessments"`, so the
highlight and `aria-current="page"` were lost on the `/hire/assessments/<id>` monitor
route. Plan 128 §5 step 10 specified `startsWith`; it was never applied. Fixed, and
guarded by case 20 in `recruiter-assessments.test.ts`.

The desk deny-list at `:89` keeps its `!==` form deliberately — that one is about the
single `/hire/<requestId>` segment and must not match this two-segment route.

## 7. TC-R-018 evidence

**Script:** *"Publish and assign to three candidates. Confirm one notification each.
Have one complete it and confirm the result and pass/fail appear."*

Counter readings, from a verified zero baseline:

| Checkpoint | assignments | notifications | unique recipients |
|---|---|---|---|
| before assign | 0 | 0 | 0 |
| after first assign | `ASSIGNED=3` | 3 | 3 |
| after second assign | `ASSIGNED=3` | **3** | **3** |

Recipients confirmed to be the fixtures, **0 real people**. Delivery rows:
`in_app/sent x3`, `email/failed (skipped — missing API key)` x3 — in-app delivered,
no mail left the machine.

On the second assign the UI showed all three already-assigned, checked and disabled
(0 selectable), and the three notification **timestamps were unchanged** — proof the
dedupe rejected the re-send rather than rewriting.

Three independent layers hold that guarantee: the UI refuses, the service/store
refuse, and the database refuses.

Monitor verified: 3 assigned, one completed at 100% **Passed**, two **Not started**.

**Automated** — nothing new written for dedup; the existing suites already cover it:
`recruiter-assessments` **27/27** (incl. `9. assign 3 → 3 rows, 3 notifications`,
`10. assigning the same 3 again → no new rows, still 3 unique notifications`,
`2. publishing twice returns alreadyPublished and keeps publishedAt`),
`assessment-attempts` **29/29**, `notification-dispatch` **10/10**,
`notification-acceptance` **4/4** (incl. `TC-S-005-01: deduplicates on repeat dispatch`).

## 8. Defects found and deliberately NOT fixed here

None are in T-244's code. Each deserves its own ticket.

| Where | Issue |
|---|---|
| `src/lib/email.ts:98` | The test-address guard is `endsWith("@abtalks.dev")`, which is **false** for `strong@hire.abtalks.dev` — the character before `abtalks.dev` is `.`, not `@`. Seed fixtures therefore generate real Brevo sends to non-existent addresses: exactly the bounce/domain-reputation harm the guard exists to prevent. Same bug class as `prisma/cleanup.ts:14`, where `db:cleanup:test` misses these fixtures and `db:cleanup:real` would delete them. |
| `assessment-builder.tsx:82` | `crypto.randomUUID()` inside a lazy `useState` initialiser runs on both SSR and hydration, producing different `id="q-<uuid>"` → hydration mismatch. Pre-existing in T-243 (`b5095a98`). Harmless (`stripKeys` drops it before save) but noisy. Fix: key off the stable DB `id`. |
| `notification-provider.tsx:142-155` | `openPanel` performs side effects **inside a `setState` updater** (`writeCache`, `markNotificationsReadAction`), so React invokes them during render → "Cannot update a component (Router) while rendering a different component". Pre-existing (`38d549f4`). Can double-fire the action in StrictMode. Fix: hoist the effects out of the updater. |
| T-248 bookkeeping | `NotificationDelivery` records `failed` when `sendEmail` returned `skipped: true`. |
| Carried from plan 128 | No cron calls `retryFailedDeliveries()`; `template-renderer.ts` does not escape HTML (mitigated here by fixed literal copy); T-243 `sectionId` always null. |
| UX observation | Publish is reachable only by clicking the assessment **title** on `/hire/assessments`; the Actions column offers just "Open builder" and "Delete". Correct code, poor discoverability. |

## 9. Plan numbering

This is **133**. Upstream holds 128 (T-244), 129 (T-218), two 130s (presets and
T-232 outreach), 131 (assessment create-and-send) and 132 (profile completion), so
this plan moved 132 → 133 after a rebase. The T-239 plan on PR #297 still collides
with upstream's 130 and needs its own renumber.

## 10. Guardrails observed

No `prisma migrate dev`. No production migration or seed. No rewrite of the merged
T-244 implementation. No hand-inserted shortlist or assignment rows — every row came
through the real UI path. `notifyUser` (no-op stub) and `addToShortlist`
(not-implemented) never called. `primaryEntityId` left as the assessment id. `master`
never force-pushed or rebased.
