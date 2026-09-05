# 113 — TalentRequest persistence audit, project model design, and the R10 metric inventory

> **Covers task-board items `T-039`, `T-040` and `T-102`** for Saturday 05 September 2026.
> Owner: shashank. See [`112-A-daily-task-board.md`](112-A-daily-task-board.md).
>
> **Documentation only.** No application code, schema or migration was changed.
> `T-040`'s schema diff is a proposal for Sohail to review and sign before 9 September;
> the migration itself is `T-041` and has not been written.
>
> Evidence was gathered by reading the repository at `e7026ecb` (master, in sync with
> upstream). Every claim below cites a file and a line. Where a Prisma model exists but
> nothing reads or writes it, that is stated as a finding rather than assumed to work.

---

## Contents

1. [T-039 — the audit](#t-039--the-audit)
2. [T-039 — evidence table](#t-039--evidence-table)
3. [T-039 — conclusion: SEARCH or PROJECT?](#t-039--conclusion-search-or-project)
4. [T-040 — proposed schema diff](#t-040--proposed-schema-diff)
5. [T-040 — migration considerations](#t-040--migration-considerations)
6. [T-102 — metric inventory](#t-102--metric-inventory)
7. [Blockers and open questions](#blockers-and-open-questions)

---

# T-039 — the audit

**The question:** if a recruiter uses `/hire` today, signs out, and comes back later,
what survives and what does not?

## What exists on the two models

`TalentRequest` — `prisma/schema.prisma:1052–1088`

It is a well-populated criteria record. It already carries:

| Column | Line |
|---|---|
| `title` | 1056 |
| `seniority` | 1057 |
| `openings` | 1058 |
| `mustHaveStack` / `niceToHaveStack` | 1059–1060 |
| `evidencePriority` | 1062 |
| `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` | 1063–1066 |
| `workMode` | 1067 |
| `locationCity` | 1068 |
| `employmentType` | 1069 |
| `noticePeriodDays` | 1070 |
| `minExperience` / `maxExperience` | 1071–1072 |
| `requiresDegree` | 1073 |
| `extra` (Json, "never used for matching") | 1075 |
| `status`, `alertWhenAvailable`, `createdAt`, `updatedAt` | 1055, 1076–1078 |

Indexes: `[recruiterUserId, createdAt desc]` and `[status, createdAt desc]` (1086–1087).

**There is no `name` column, and no per-recruiter last-visit timestamp.**

`TalentRequestMatch` — `prisma/schema.prisma:1110–1130`

| Column | Line |
|---|---|
| `requestId`, `candidateUserId` | 1112–1113 |
| `programMemberId` (provenance only, no FK) | 1115 |
| `score`, `tier`, `scoreBreakdown`, `evidence` | 1116–1119 |
| `rationale`, `gaps`, `availabilityUnknown`, `source` | 1120–1123 |
| `createdAt` | 1124 |

**There is no `firstSeenAt`, no `viewedAt` and no `decision`.** `createdAt` is the only
timestamp, and the next section shows why it cannot stand in for `firstSeenAt`.

## The match lifecycle — the central finding

`runMatchAction` — `src/app/actions/hire-actions.ts:318`

```
line 378   await prisma.talentRequestMatch.deleteMany({ where: { requestId: req.id } })
line 403   await prisma.talentRequestMatch.createMany({ data: persistable.map(...) })
```

Every run **deletes every match row for the request and recreates them from scratch.**

Three consequences follow directly, and they are the reason this task exists:

1. `createdAt` is reset on every run, so it records *the last time the search ran*, not
   the first time a candidate appeared. Nothing in the schema can answer "is this
   candidate new since my last visit?"
2. Any per-match state a recruiter set — viewed, dismissed, marked interesting — would be
   destroyed by the next run. That is why no such column exists: there is nowhere for it
   to survive.
3. A candidate who matched last week and no longer matches simply vanishes. There is no
   record they were ever there.

`searchCandidates(spec, { limit: 20 })` at line 363 also caps the stored set at 20.

## What the read path returns

`loadRequestMatches` — `src/features/hire/load-request-matches.ts:28`

Selects `candidateUserId`, `programMemberId`, `source`, `score`, `tier`,
`scoreBreakdown`, `rationale`, `gaps`, `availabilityUnknown`, `evidence`
(lines 47–58), ordered by score.

It reads **no state of any kind** — nothing about viewing, dismissing or deciding, because
none is stored. It does re-apply the candidate visibility gate on read (lines 67–70), so a
candidate who has since opted out disappears from a saved request. That is correct
behaviour, and worth preserving.

The recruiter *can* return: `/hire/requests` and `/hire` both list past requests
(`src/app/hire/page.tsx:26`, `src/app/actions/hire-actions.ts:657`), and
`/hire/[requestId]` reloads one.

## Shortlist — three separate stores, none of them project-scoped

This is the messiest area, and the audit found three different mechanisms:

**1. `RecruiterShortlistItem`** — `prisma/schema.prisma:1001–1011`

```
recruiterUserId  String
memberId         String          → ProgramMember (FK, onDelete: Restrict)
note             String?
@@unique([recruiterUserId, memberId])
```

- **It has no `requestId`.** It is scoped to a recruiter, not to a project. A candidate
  shortlisted while working on Project A is shortlisted globally.
- It is FK'd to `ProgramMember`, so **only cohort candidates can be stored at all.**
  Challenge, hackathon and Claude candidates cannot be written to this table.
- Read/write paths: `src/features/talent-pool/pool.ts:300, 403, 411, 415, 440, 446, 460,
  470, 486` and `src/features/hire/recruiter-account.ts:32`.

**2. The `/hire` desk shortlist** — `src/components/hire/desk-shortlist.ts`

`localStorage`, key `abtalks-hire-star` (line 4). Device-local. Not on any server.

**3. The guest cart** — `src/components/hire/guest-cart.ts:141, 155`

`localStorage` again.

Which one runs is decided in `src/components/talent/shortlist-button.tsx:56`:

```ts
const useDb = Boolean(approved && programMemberId);
```

So: an approved recruiter shortlisting a **cohort** candidate writes to the database
(globally, not per project). Everyone else — and every non-cohort candidate — writes to
`localStorage` and loses it on another device.

**`TalentList` and `TalentListItem` exist in the schema and are referenced by ZERO
application code.** Verified by grep across `src/`: 0 hits. They are the tables the
September plan intends to adopt (`T-058`), but today they hold nothing.

## Notes

**`CandidateNote`** — `prisma/schema.prisma:2979–2993`. Correctly org-scoped, has
`organizationId`, `candidateUserId`, `authorUserId`, `body`. **Referenced by ZERO
application code** — grep across `src/` returns 0 hits.

The only note that persists today is `RecruiterShortlistItem.note`
(`prisma/schema.prisma:1005`), written at `src/features/talent-pool/pool.ts:472`. It is:

- one note per (recruiter, cohort member) pair,
- not scoped to a project,
- unavailable for non-cohort candidates,
- private to the individual recruiter, not shared with their organisation.

## Criteria

Criteria **do** persist. `TalentRequest` is created at
`src/app/actions/hire-actions.ts:224` and updated at `:264`, `:441`, `:526`, `:578`,
`:609`, `:680`. `dbToSpec` (`:121`) reads the columns back into a spec, and
`runMatchAction:333–358` re-reads all of them on a later visit.

Two qualifications:

- `extra` (Json, line 1075) is explicitly documented as **never used for matching**, so
  anything Scout captured that has no column is remembered but has no effect.
- The task board's `T-043` criteria list also wants education, graduation year, candidate
  type, role family and open-to-work. **None of those five have columns today.**

`TalentRequestMessage` (`prisma/schema.prisma:1090–1100`) persists the Scout conversation,
so the *reasoning* behind the criteria survives too.

---

# T-039 — evidence table

| Item | Survives? | Storage / model | Column(s) | Write path | Read path | Evidence |
|---|---|---|---|---|---|---|
| **criteria** | **YES** (partially complete) | `TalentRequest` | `title`, `seniority`, `openings`, `mustHaveStack`, `niceToHaveStack`, `evidencePriority`, salary ×4, `workMode`, `locationCity`, `employmentType`, `noticePeriodDays`, `minExperience`, `maxExperience`, `requiresDegree`, `extra` | `hire-actions.ts:224` (create), `:264/:441/:526/:578/:609/:680` (update) | `dbToSpec` `hire-actions.ts:121`; re-read `hire-actions.ts:333–358`; `load-request-matches.ts:38–44` | schema `1052–1088`. Persists. `extra` is stored but never matched on (line 1075). Five criteria the board wants (education, grad year, candidate type, role family, open-to-work) have **no column**. |
| **matches** | **PARTIALLY** — the rows persist, their history does not | `TalentRequestMatch` | `score`, `tier`, `scoreBreakdown`, `evidence`, `rationale`, `gaps`, `availabilityUnknown`, `source`, `createdAt` | `hire-actions.ts:378` `deleteMany` then `:403` `createMany` | `load-request-matches.ts:45–58` | schema `1110–1130`. The set is rebuilt from zero on every run, so `createdAt` means "last run", not "first seen". Capped at 20 by `searchCandidates(spec, { limit: 20 })` at `:363`. |
| **viewed state** | **NO** | *nowhere* | *none* | *none* | *none* | No `viewedAt` / `firstSeenAt` / `lastViewedAt` column exists on either model, and a repo-wide grep for viewed-state tracking in the hire workstream returns nothing. Even if a column existed, `deleteMany` at `:378` would erase it on the next run. |
| **shortlist** | **PARTIALLY, and never per project** | three stores: `RecruiterShortlistItem`; `localStorage` `abtalks-hire-star`; `localStorage` guest cart | `recruiterUserId`, `memberId`, `note` | `pool.ts:415, 446` | `pool.ts:300, 486`; `recruiter-account.ts:32` | schema `1001–1011`. **No `requestId`** — shortlists are global to the recruiter. FK to `ProgramMember` means **only cohort candidates persist**; all others live in `localStorage` (`desk-shortlist.ts:4`, `guest-cart.ts:141`), chosen at `shortlist-button.tsx:56`. `TalentList`/`TalentListItem` exist but have **0 usages** in `src/`. |
| **notes** | **PARTIALLY, and never per project** | `RecruiterShortlistItem.note` | `note` | `pool.ts:472` | `pool.ts:307, 490` | schema `1005`. One note per (recruiter, cohort member); not project-scoped, not org-shared, unavailable for non-cohort candidates. `CandidateNote` (`2979–2993`) is correctly designed and has **0 usages** in `src/`. |

---

# T-039 — conclusion: SEARCH or PROJECT?

> **Today `TalentRequest` is a SEARCH.**

It is a *saved* search — the criteria survive, the recruiter can navigate back to it, and
the Scout conversation that produced it is kept. That is more than a throwaway query.

But it fails every test that would make it a project:

1. **It has no name.** `title` is the role being hired for, not a name the recruiter chose
   for a piece of work. Two projects for the same role are indistinguishable in a list.
2. **It has no memory of what the recruiter did.** There is no viewed state, no decision,
   no dismissal — anywhere in the schema.
3. **It cannot tell the recruiter what changed.** Because `runMatchAction` deletes and
   recreates every match (`:378`/`:403`), `createdAt` resets on each run and "new since
   your last visit" is unanswerable.
4. **Its shortlist is not its own.** `RecruiterShortlistItem` has no `requestId`, so
   shortlisting is global to the recruiter; and it is FK'd to `ProgramMember`, so
   three of the four candidate tracks cannot be shortlisted persistently at all.
5. **Its notes are not its own either**, for the same reason.

A recruiter returning after three days gets their criteria back and a freshly-run list of
20 candidates with no indication of which they have already seen, already rejected, or
already saved — and, unless those candidates were cohort members, their shortlist is
whatever happens to be in that browser's `localStorage`.

**That is a saved search re-run on arrival, not a project resumed.**

---

# T-040 — proposed schema diff

Extending the existing models. **No parallel `Project` table**, per the task board.

## The three fields the board specifies

### `TalentRequest.name`

```prisma
name String?
```

- **Why:** `title` is the role. A recruiter running two searches for "Backend Engineer"
  cannot tell them apart in a list. `name` is the recruiter's own label for the work.
- **Represents:** the project's display name, e.g. *"Senior Backend Engineer — Delhi NCR"*.
- **Nullable:** **yes.** Every existing row would otherwise need a value invented for it.
  The UI falls back to `title` when `name` is null, so nothing looks broken.
- **Default:** none. A default would put the same string on every historical row.
- **Existing rows:** unchanged; they render under `title` until renamed.
- **Index:** no. It is displayed, not filtered on. Add one only if search-by-name ships.
- **Use:** the project list (`T-042`) and its header; the recruiter renames in place.

### `TalentRequestMatch.firstSeenAt`

```prisma
firstSeenAt DateTime @default(now())
```

- **Why:** the single field that makes "new since last visit" possible. `createdAt` cannot
  serve, because `runMatchAction:378` deletes the row on every run and the recreated row
  gets a fresh `createdAt`.
- **Represents:** the first time this candidate ever appeared on this project.
- **Non-nullable with `@default(now())`.** Every match has a first appearance.
- **Existing rows:** backfill to `now()` at migration time. This is deliberate and must be
  called out to Sohail: on the first load after deploy every existing match would
  otherwise be flagged NEW. Defaulting to `now()` and setting each recruiter's
  `lastViewedAt` to `now()` in the same migration means nobody sees a false wall of NEW.
- **Index:** covered by the existing `[requestId, score desc]` for the common read. Add
  `[requestId, firstSeenAt desc]` only if a "newest first" sort ships.
- **Use:** compared against the recruiter's last visit to draw the NEW badge (`T-045`).

> ⚠️ **`firstSeenAt` is worthless until `T-044` lands.** A column that is deleted and
> recreated every run cannot hold a first-seen date. `T-044` (delete+create → upsert) is
> not an optimisation; it is what makes this column mean anything. They must ship
> together, and Sohail should treat them as one change.

### `TalentRequestMatch.viewedAt`

```prisma
viewedAt DateTime?
```

- **Why:** the audit found no viewed state anywhere. This is it.
- **Represents:** when this recruiter first opened this candidate on this project.
- **Nullable:** **yes** — null *is* the meaning "not yet viewed".
- **Default:** none.
- **Existing rows:** null. Correct: nothing was ever recorded, so nothing is known.
- **Index:** no.
- **Use:** the "who have I already looked at" column of the Talent Hub (`T-062`); feeds
  `T-104`'s per-project *viewed* count.

### `TalentRequestMatch.decision`

```prisma
enum TalentMatchDecision {
  UNDECIDED
  SHORTLISTED
  REJECTED
}

decision TalentMatchDecision @default(UNDECIDED)
```

- **Why:** lets a recruiter clear a list without losing the fact that they cleared it. A
  rejected candidate should not silently return on the next run.
- **Represents:** the recruiter's judgement on this candidate for this project.
- **Non-nullable with a default**, so no row is ever in an unknown state.
- **Existing rows:** all `UNDECIDED`.
- **Index:** `[requestId, decision]` if the Talent Hub filters by it — decide when `T-062`
  is designed, not now.
- **Use:** filtering the project list; `T-104`'s shortlisted count.

> **Open question for Sohail.** `decision` overlaps `PipelineStage` on `TalentListItem`
> (`T-058`/`T-060`). Two vocabularies for "where is this candidate" is exactly the kind of
> duplication that causes drift. **Recommendation:** keep `decision` deliberately narrow —
> a triage verdict on a *match*, three values, nothing more — and let `PipelineStage` own
> the hiring process once the candidate is on a talent list. If that split is not wanted,
> drop `decision` here and let `T-058` carry it. **This needs a decision before 9 Sep.**

## Additional changes the audit proves are necessary

These are **not** in the board's three-field list, but the evidence above shows the
acceptance criteria cannot be met without them.

### `TalentRequest.lastViewedAt` — required by `T-045`

```prisma
lastViewedAt DateTime?
```

`T-045`'s criterion is *"a NEW badge on exactly the candidates whose firstSeenAt is after
the recruiter's last visit to that project"*. `firstSeenAt` alone cannot answer that —
there is nothing to compare it against. The board's own "Start here" note for `T-045` says
*"Store lastViewedAt on TalentRequest per recruiter"*.

A request today belongs to exactly one recruiter (`recruiterUserId`, line 1054), so a
single nullable column on `TalentRequest` is sufficient **for now**. If organisation-wide
projects arrive (they are implied by the org-scoping in `T-042`), this must become a
per-(recruiter, request) row instead. Flagging it rather than pre-building it.

- Nullable; null means "never opened since this column existed".
- Backfill to `now()` at migration time — see the `firstSeenAt` note above.

### `TalentRequest.archivedAt` — required by `T-042`

```prisma
archivedAt DateTime?
```

`T-042` requires archive, and *"archived projects leave the default list but are not
deleted"*. `TalentRequestStatus` (schema `1015`) has `DRAFT`/`ACTIVE`/… — using a status
value for archive conflates "where is this request in its lifecycle" with "has the
recruiter filed it away". A nullable timestamp keeps them separate and records *when*.

Sohail may prefer a new `ARCHIVED` status value instead; either is defensible. Raising it
rather than choosing unilaterally.

### Deliberately **not** proposed

- **Anything to do with shortlist or notes on `TalentRequest`.** The audit shows both are
  broken in ways this migration cannot fix — global scope, a `ProgramMember` FK, and
  `localStorage`. That is `T-058`/`T-059`/`T-061`'s work on `TalentList`/`TalentListItem`
  and `CandidateNote`, which already exist and already carry the right shape. **Adding a
  `requestId` to `RecruiterShortlistItem` here would build a second, doomed shortlist.**
- **The five missing criteria columns** (education, graduation year, candidate type, role
  family, open-to-work) that `T-043` will need. They are real gaps, recorded here so they
  are not rediscovered — but `T-043` is not until 11 September and `D-12` (role families)
  does not close until 8 September. Adding a `roleFamily` column before that enum is
  frozen would be premature.

## Diff summary for review

```prisma
model TalentRequest {
  // ... unchanged ...
+ name         String?
+ lastViewedAt DateTime?
+ archivedAt   DateTime?
}

model TalentRequestMatch {
  // ... unchanged ...
+ firstSeenAt DateTime            @default(now())
+ viewedAt    DateTime?
+ decision    TalentMatchDecision @default(UNDECIDED)
}

+ enum TalentMatchDecision {
+   UNDECIDED
+   SHORTLISTED
+   REJECTED
+ }
```

Six columns and one enum. Every column is nullable or defaulted, so the migration is
purely additive and no existing row stops loading.

---

# T-040 — migration considerations

For `T-041` (9 September), not to be run now.

1. **Additive only.** Every new column is nullable or has a default; no column is dropped,
   renamed or retyped. Existing `TalentRequest` and `TalentRequestMatch` rows keep loading
   with no code change.
2. **Rehearse on a Neon child branch first**, per `D-2` and the AGENTS.md Neon rule. Never
   the default branch.
3. **Backfill, in the same migration:**
   - `firstSeenAt` → `now()` for existing matches (the column default handles this).
   - `lastViewedAt` → `now()` for existing requests. **Without this, every recruiter's
     first load after deploy shows every candidate flagged NEW.** This is the single
     highest-risk detail in the change.
   - `viewedAt` → null, `decision` → `UNDECIDED`, `name` → null, `archivedAt` → null: all
     handled by the defaults.
4. **078 posture.** Per `D-1`, these are extensions to existing 078-era models using plain
   cuids. Dual-write stays on; no legacy table is touched. Writes to `TalentRequestMatch`
   go through `runMatchAction`, which uses `prisma` directly — confirm with Sohail whether
   that should move to `writeClient()` when `T-044` rewrites it.
5. **Sequencing.** `T-044` (upsert) must land with or immediately after this migration.
   `firstSeenAt` on a table that is deleted every run is a column that is always "today".
6. **No index is added in this migration.** The existing `[requestId, score desc]` covers
   the read path. Indexes for `firstSeenAt`/`decision` should wait until `T-062` and
   `T-045` show the actual query shapes — and `T-047` is the task that owns index work,
   using `CREATE INDEX CONCURRENTLY`.
7. **Rollback.** Six additive columns and one enum drop cleanly. No data is lost by
   reverting, because nothing depended on them before.

---

# T-102 — metric inventory

## Status: **BLOCKED — partially**

`T-102`'s own note reads *"Do this AFTER D-9 so the event names are fixed."* Verified
against the repository today:

| Prerequisite | Present? | Evidence |
|---|---|---|
| `AnalyticsEvent` model | **No** | 0 matches for `model AnalyticsEvent` in `prisma/schema.prisma` |
| `track()` stub (C2) | **No** | no `src/features/analytics/`; no `track(event, userId, props)` export in `src/` |
| D-9 decision record | **No** | no `docs/decisions/` directory; "D-9" appears only inside the task board itself |
| `emitSkillEvidence` (C1) | **No** | 0 matches in `src/` |
| `notify()` (C3) | **No** | 0 matches in `src/` |
| `assertEntitlement` (C5) | **No** | 0 matches; `src/features/entitlement/` absent |

**No event name is invented below.** Every event-sourced metric is marked ⛔ and left for
after D-9 (Sohail, 7 September) and `T-158` (Manuvrtti, 9–11 September).

What *can* be done today, and is done below, is the half that does not need events: every
metric whose source is an existing table. Those are traced to real columns.

## Metrics with a traceable source today

| Metric | Question it answers | Source | Field(s) | Period | Query logic | Implementable now? |
|---|---|---|---|---|---|---|
| **Projects (total / active)** | How many pieces of hiring work do I have open? | `TalentRequest` | `recruiterUserId`, `status`, `archivedAt`* | all-time; active = not archived | `count where recruiterUserId = me` (+ `archivedAt is null` once `T-040` lands) | **Yes** (archive filter needs `T-040`) |
| **Candidates matched (per project)** | How many people did this search surface? | `TalentRequestMatch` | `requestId` | current run only | `count where requestId = X` | **Yes**, with the caveat below |
| **Candidates matched (overall)** | How many people has my hiring surfaced? | `TalentRequestMatch` → `TalentRequest` | `requestId`, `candidateUserId` | current runs only | `count distinct candidateUserId` over my requests | **Yes**, same caveat |
| **New since last visit** | Who is new since I was last here? | `TalentRequestMatch`, `TalentRequest` | `firstSeenAt` vs `lastViewedAt` | since last visit | `count where firstSeenAt > request.lastViewedAt` | **No — needs `T-040` + `T-044`** |
| **Candidates viewed** | Who have I already looked at? | `TalentRequestMatch` | `viewedAt` | any | `count where viewedAt is not null` | **No — needs `T-040`** |
| **Shortlisted (cohort candidates only)** | Who have I saved? | `RecruiterShortlistItem` | `recruiterUserId`, `memberId` | all-time | `count where recruiterUserId = me` | **Partially** — cohort only, and **not per project** (no `requestId`, schema `1001–1011`) |
| **Shortlisted (all tracks, per project)** | Who have I saved on *this* project? | `TalentList` / `TalentListItem` | — | — | — | **No — tables have 0 usages in `src/`; needs `T-058`/`T-059`** |
| **Contact requests placed** | How many people did I ask to reach? | `TalentEngagementRequest` | `recruiterUserId`, `requestId`, `status`, `submittedAt` | by `submittedAt` | `count where recruiterUserId = me and status <> DRAFT` | **Yes** — and **project-scoped**, because `requestId` exists (schema `3148`) |
| **Contact requests granted** | How many were approved? | `TalentEngagementRequest` | `status`, `decidedAt` | by `decidedAt` | `count where status = CONTACT_SHARED` | **Yes** |
| **Contact grant rate** | What share of my asks get through? | `TalentEngagementRequest` | `status` | period | granted ÷ placed | **Yes** |
| **Scout conversations** | How much did I use Scout? | `TalentRequestMessage` | `requestId`, `role`, `createdAt` | period | `count where role = 'user'` over my requests | **Yes** |
| **Demand analytics** (by status / skill / stack / role / location / experience) | *Platform-level*, not recruiter-facing | `TalentRequest` | criteria columns | all-time | `src/features/hire/demand-analytics.ts:81` `getDemandAnalytics()` | **Yes — already built** |

\* `archivedAt` is proposed in `T-040`, not present today.

> **Caveat on every match count.** `runMatchAction:378` deletes all match rows before
> recreating them, and `searchCandidates` is called with `{ limit: 20 }` at `:363`. So
> "candidates matched" today means *"up to 20, from the most recent run"* — not a
> cumulative total. Any metric built on it before `T-044` will silently understate and will
> change value when a recruiter re-runs a search. **This must be said on the tile, or the
> metric must wait.**

## ⛔ Metrics that require D-9 / `AnalyticsEvent` — struck out until then

Per the task's rule — *any metric without a traceable source is struck out rather than
estimated* — these are recorded as unsupported, with no invented event names:

- ~~Searches run~~ — no counter and no event; `runMatchAction` records nothing.
- ~~Profile unlocks~~ — no entitlement system (`assertEntitlement` absent).
- ~~Outreach emails sent~~ — `OutreachMessage` does not exist (`T-067`, 15 Sep).
- ~~Response rate~~ — needs outreach + replies; neither is modelled.
- ~~Assessments sent / completed~~ — `RecruiterAssessment` and friends do not exist
  (`T-092`, 9 Sep).
- ~~Applications received~~ — `JobApplication` exists but has no `stage`
  (`T-081`, 9 Sep), and `Job` has no `organizationId` (`T-080`), so it cannot be scoped
  to a recruiter's organisation.
- ~~Candidate profile views~~ — `CandidateProfileView` does not exist (`T-162`, 13 Sep).
- ~~Pipeline conversion (any stage → any stage)~~ — no pipeline is persisted
  (`T-060`, 12 Sep).
- ~~Time-to-first-contact, time-to-hire~~ — no stage timestamps exist.

**Nine of the fourteen metrics `T-103` names are not sourceable today.** That is the honest
answer, and it is the finding — not a gap in this document.

---

# Blockers and open questions

## For Sohail, before 9 September

1. **`decision` vs `PipelineStage`** — do both exist, with `decision` as a narrow triage
   verdict on a match and `PipelineStage` owning the hiring process? Or does `T-058` carry
   it alone? *(See the note under `T-040`.)*
2. **`archivedAt` vs an `ARCHIVED` status value** — which does `T-042` build against?
3. **`lastViewedAt` placement** — a single column on `TalentRequest` is correct while a
   request has one recruiter. If org-wide projects are intended, it must be a
   per-(recruiter, request) row. Which is it?
4. **`T-044` sequencing** — confirm that `T-044` ships with `T-041`. `firstSeenAt` is inert
   until the delete+create becomes an upsert.
5. **`writeClient()`** — should `runMatchAction` move off `prisma` onto `writeClient()`
   when `T-044` rewrites it? Dual-write is on in production.

## Blocking `T-102`

6. **D-9 is not closed** (Sohail, 7 September) and there is no `docs/decisions/`
   directory. The event-sourced half of the metric table cannot be written without it.
7. **`AnalyticsEvent` and `track()` do not exist** (`T-158`, Manuvrtti, 9–11 September).
8. **None of C1–C5 are on master.** The board expects them by 8 September; today
   `emitSkillEvidence`, `notify()` and `assertEntitlement` all return 0 grep hits.

## Recorded so they are not rediscovered

9. **Five criteria columns are missing** for `T-043`: education, graduation year, candidate
   type, role family, open-to-work. Role family waits on `D-12` (8 September).
10. **Match persistence is capped at 20** (`hire-actions.ts:363`). Whether that is the
    intended project size is a product question nobody has been asked.
11. **`extra` (Json) is stored but never matched on** (schema `1075`). Anything Scout
    captured into it is remembered and ignored.

---

## Task status against the acceptance criteria

| Task | Criterion | Status |
|---|---|---|
| **T-039** | *"A written answer naming exactly what persists between two visits and what does not. Must state whether criteria, matches, viewed state, shortlist and notes each survive a sign-out — with the file and column that proves each answer."* | **DONE** — all five covered with model, column, write path, read path and line-level evidence; conclusion stated. |
| **T-040** | *"A reviewed schema diff adding: TalentRequest.name, and TalentRequestMatch.firstSeenAt / viewedAt / decision. Sohail signs it before 9 Sep."* | **PARTIALLY DONE** — the diff is written with all four fields plus three the evidence proves are needed, each with rationale, nullability, default, backfill and index decisions. **The criterion also requires Sohail's review and signature, which has not happened.** Not done until he signs. |
| **T-102** | *"A table with one row per metric: the recruiter question it answers, the source table or AnalyticsEvent, and its period. Any metric with no traceable source is struck out rather than estimated."* | **PARTIALLY BLOCKED** — twelve table-sourced metrics traced to real columns; nine event-sourced metrics struck out as unsupported, with no event names invented. Cannot be completed until D-9 closes (7 Sep) and `AnalyticsEvent` exists (9–11 Sep). |
