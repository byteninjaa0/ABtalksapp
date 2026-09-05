# 113-A — `T-040` schema diff: review sheet

**For:** Sohail · **From:** shashank · **Needed by:** Tue 9 Sep (before `T-041` migrates)
**Evidence:** [`113-talent-request-persistence-audit.md`](113-talent-request-persistence-audit.md)

---

## The finding (`T-039`)

**`TalentRequest` is a saved SEARCH, not a project.**

Criteria survive. Nothing else does:

| | |
|---|---|
| criteria | ✅ persists |
| matches | ⚠️ rows persist, **history does not** |
| viewed state | ❌ does not exist anywhere |
| shortlist | ⚠️ persists, but **global to the recruiter, cohort-only** |
| notes | ⚠️ same |

**Why:** `runMatchAction` (`hire-actions.ts:378`/`:403`) **deletes every match row and
recreates it on every run.** So `createdAt` means "last run", not "first seen", and no
per-match state can survive. Shortlist is FK'd to `ProgramMember`
(`schema:1001–1011`) — three of four candidate tracks can't be saved at all, and there's
no `requestId`, so it isn't per-project either.

A recruiter returning after three days gets their criteria back and 20 freshly-run
candidates, with no idea who they already saw, rejected or saved.

---

## The diff to sign (`T-040`)

```prisma
model TalentRequest {
+ name         String?              // board asked
+ lastViewedAt DateTime?            // extra — see below
+ archivedAt   DateTime?            // extra — see below
}

model TalentRequestMatch {
+ firstSeenAt DateTime            @default(now())   // board asked
+ viewedAt    DateTime?                             // board asked
+ decision    TalentMatchDecision @default(UNDECIDED) // board asked
}

+ enum TalentMatchDecision { UNDECIDED SHORTLISTED REJECTED }
```

Six columns, one enum. **All nullable or defaulted → purely additive, nothing breaks.**

**The two extras, and why:**
- `lastViewedAt` — `T-045` wants a NEW badge on candidates newer than the last visit.
  `firstSeenAt` alone can't do that; there's nothing to compare against. The board's own
  note for `T-045` says to store it.
- `archivedAt` — `T-042` requires archive. Using a status value would conflate
  "where is this in its lifecycle" with "the recruiter filed it away".

**Not proposed:** anything for shortlist/notes. Those belong to `T-058`/`T-061` on
`TalentList` / `CandidateNote` — which already exist with the right shape and **zero
usages**. Patching `RecruiterShortlistItem` here would build a second, doomed shortlist.

---

## Three things that will bite

1. ⚠️ **`firstSeenAt` is inert until `T-044` ships.** A column deleted and recreated every
   run can't hold a first-seen date. **`T-041` and `T-044` must go together.**
2. ⚠️ **Backfill `lastViewedAt` to `now()` in the migration.** Without it, every recruiter's
   first load after deploy flags **every** candidate NEW.
3. ⚠️ **Match counts are capped at 20** (`hire-actions.ts:363`) and reset each run. Any
   `T-103`/`T-104` metric built on them today understates and changes on re-run.

---

## Five decisions I need from you

| # | Question | My recommendation |
|---|---|---|
| 1 | `decision` overlaps `PipelineStage` (`T-058`/`T-060`). Both, or one? | Keep both: `decision` = narrow triage verdict on a *match* (3 values); `PipelineStage` owns the hiring process once on a talent list. If you disagree, drop `decision` and let `T-058` carry it. |
| 2 | `archivedAt` timestamp, or a new `ARCHIVED` status value? | Timestamp — records *when*, and keeps lifecycle separate from filing. |
| 3 | `lastViewedAt` on `TalentRequest`, or per-(recruiter, request)? | Single column is right *today* (one recruiter per request). Becomes wrong the moment org-wide projects land — which `T-042`'s org-scoping implies. Your call. |
| 4 | Confirm `T-044` ships with `T-041`? | Yes — see bite #1. |
| 5 | Should `runMatchAction` move from `prisma` to `writeClient()` when `T-044` rewrites it? Dual-write is ON in production. | Probably yes; I don't want to decide this one. |

---

## Status

| Task | Status |
|---|---|
| `T-039` | **DONE** |
| `T-040` | **Waiting on your signature.** Diff written; criterion says *"Sohail signs it before 9 Sep"*. |
| `T-102` | **BLOCKED** — D-9 isn't closed, and `AnalyticsEvent`/`track()`/C1–C5 don't exist on master yet. 12 table-sourced metrics traced; 9 event-sourced ones struck out with **no invented event names**. |

---

**Sign-off:** ☐ Approved as written  ☐ Approved with changes below  ☐ Needs discussion

_Signed: ................................  Date: ..............._

---

## Implementation status (branch `feat/talent-request-persistence`)

The diff above is **already written, typechecked and built** on that branch, so
approval costs almost nothing to act on. Nothing has been applied to any
database and nothing is merged.

| Done | |
|---|---|
| `T-040` schema | 6 columns + 1 enum, exactly as above |
| `T-041` migration | `20260905120000_talent_request_persistence` — **generated offline, NOT applied** |
| `T-044` | `runMatchAction` now upserts; `update` branch touches scoring only |
| Read path | `loadRequestMatches` selects and returns all six |
| Test | `npm run test:match-persistence` — 5 assertions, no DB |
| Validation | `tsc --noEmit`, `eslint`, `npm run build` all clean; 4 existing hire suites pass |

**What your answers change:**

| # | If you say... | Work left |
|---|---|---|
| 1 | keep both | none — shipped as written |
| 1 | drop `decision` | delete 1 enum + 1 column from schema, regenerate migration, delete 1 test assertion (~10 min) |
| 2 | prefer `ARCHIVED` status | swap 1 column for 1 enum value, regenerate migration (~10 min) |
| 3 | per-(recruiter, request) | **new join table — a real redesign, do not assume** |
| 4 | yes | none — already shipped together |
| 5 | use `writeClient()` | none — the write is a `$transaction([...])` batch, not an interactive one, so the direct endpoint is not required either way |

**Before applying, on the target database:**

```sql
SELECT "requestId", "candidateUserId", COUNT(*)
FROM "TalentRequestMatch" GROUP BY 1,2 HAVING COUNT(*) > 1;
```

Must return zero rows or the unique index fails. Dev DB: checked, 40 rows,
0 duplicates. **Production is a different Neon endpoint and is unchecked.**
