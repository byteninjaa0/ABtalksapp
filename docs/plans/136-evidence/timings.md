# T-235 — Realistic search load test: results

**Date:** 2026-09-12 · **Branch:** `feat/t235-search-load-test` · **DB:** Neon dev branch
`ep-young-shadow-amawetjy` (never production) · **Harness:** `npm run bench:hire`,
`npm run explain:hire`

---

## Verdict in one line

**Postgres is not the bottleneck. The search has no `LIMIT` on its largest reads, so the
number of rows it pulls out of the database grows linearly and without bound with the
candidate pool — ~20 rows transferred per candidate in the pool, to produce 20 results.
No index fixes this; it needs the architectural change plan 112 §8 already prescribes.**

---

## 1. How to read these numbers

Wall-clock was measured from a developer laptop, where a trivial `SELECT 1` to the Neon dev
branch costs **306 ms median**. One search makes 15–69 round trips, so wall-clock here is
dominated by network latency production does not have (Vercel runs in-region). Publishing
those seconds as "search p95" would overstate production by roughly 30× on the network
component.

**Primary metrics are therefore location-independent**, read from `pg_stat_database` either
side of each search:

| metric | why |
|---|---|
| **rows returned per search** (`tup_returned` delta) | what the query actually costs, independent of where it runs |
| **statements per search** (`xact_commit` delta) | round trips; multiplies by RTT wherever you run |
| `EXPLAIN (ANALYZE, BUFFERS)` | true DB-side execution, warm-cache |

The dev server was stopped during measurement so nothing else touched the counters. Each
EXPLAIN was run three times and only warm runs compared — a cold plan shows `read=` buffers
and an inflated planning time, and comparing cold against warm manufactures differences that
are cache state, not query shape.

---

## 2. THE HEADLINE — unbounded row transfer

Rows the database returns **per single search**, to produce **20 results**:

### Challenge tracks OFF (the PROGRAM path)

| scenario | pool 69 | pool 569 | pool 2,069 | pool 5,069 |
|---|---|---|---|---|
| unscoped (no filters) | 4,244 | 9,717 | 68,076 | **100,562** |
| role only | 1,189 | 3,672 | 42,827 | **103,074** |
| one must-have skill | 1,780 | 3,652 | 45,611 | **101,052** |
| two must-have skills | 1,972 | 9,035 | 42,827 | **100,379** |
| skill + experience band | 1,183 | 3,683 | 42,839 | **100,370** |
| skill + salary ceiling | 991 | 6,012 | 45,611 | **100,270** |
| location + work mode | 1,100 | 3,618 | 45,611 | **100,290** |

### Challenge tracks ON

| scenario | pool 69 | pool 569 | pool 2,069 | pool 5,069 |
|---|---|---|---|---|
| unscoped | 60,072 | 44,734 | 86,777 | **153,691** |
| role only | 42,132 | 51,231 | 68,124 | **150,329** |
| one must-have skill | 41,801 | 46,216 | 89,587 | **150,241** |
| location + work mode | 42,324 | 50,089 | 74,807 | **150,201** |

### The relationship is linear

| pool | rows ("role only", OFF) | rows per candidate |
|---|---|---|
| 69 | 1,189 | 17.2 |
| 569 | 3,672 | 6.5 |
| 2,069 | 42,827 | **20.7** |
| 5,069 | 103,074 | **20.3** |

Stable at **~20 rows transferred per candidate in the pool** above ~2k. Extrapolating that
fit — **labelled as extrapolation, not measured** — the ~12,800-user pool plan 112 names
would transfer roughly **250,000 rows per search**. The 10,069 wave was seeded but its
benchmark was stopped deliberately; the four measured points already establish the slope.

**Why:** `ProgramMember.findMany` has no `take` at all — `CHALLENGE_POOL_CAP` is never passed
to `loadProgram()` — and `ProgramMissionSubmission` is then fetched for every member found,
plus four nested relations. Filtering happens in JavaScript afterwards.

---

## 3. Challenge tracks cost a fixed, pool-independent tax

At pool 69 — **69 searchable people** — enabling the challenge tracks took "role only" from
1,189 rows to 42,132: a **35× amplification**, and statements from 15 to 51.

That tax does not scale with the searchable pool, because
`listChallengeCandidates` has no `take`, no `orderBy` and no day predicate: it reads every
`Enrollment` with any submission (**3,188 enrolments, 15,645 submissions** on this branch)
regardless of how many of those users are searchable. `CHALLENGE_POOL_CAP = 600` is applied
in JavaScript *after* all of it is in the Node heap.

The code comment claiming the cap stops "a future track with thousands of enrolments" turning
a search into "a full table scan" is **incorrect** — `EXPLAIN` confirms a `Seq Scan on
"Enrollment"` on every search.

---

## 4. Postgres itself is fast — no index is justified

Warm `EXPLAIN (ANALYZE, BUFFERS)`, three runs each (`explain-before.txt`):

| query | warm execution | planning |
|---|---|---|
| Challenge `Enrollment` scan (the amplifier) | **1.41 ms** | 7.6 ms |
| Same, filtering the denormalised `Enrollment.domain` | **1.47 ms** | 7.3 ms |
| Discovery gate (`ProgramMember × User × CandidateVisibility`) | **0.34 ms** | 5.4 ms |
| Wasted `interview` join | 0.092 ms vs 0.050 ms without | — |

**Planning time exceeds execution time** on every one. **Conclusion: no index is added by
this PR, because EXPLAIN justifies none.** The ticket says "any query needing an index gets
one" — measured, none does. The cost is rows transferred and round trips, which an index
cannot reduce.

Two corrections to this plan's own §6, both found by measuring rather than assuming:

1. **The "free fix" of filtering `Enrollment.domain` instead of joining `Challenge` buys
   nothing** (1.47 ms vs 1.41 ms). A cold-vs-warm first reading suggested 23 ms → 1.4 ms, a
   16× win that does not exist. The planner seq-scans either way, because all four domains
   match nearly every row.
2. **`CandidateVisibility` is already indexed for the gate**, by a partial index
   `candidate_visibility_searchable` — `("updatedAt" DESC) WHERE "searchableByRecruiters"`.
   The proposed new index was largely redundant.

⚠️ **Schema drift found:** `candidate_visibility_searchable` **exists in the database but not
in `prisma/schema.prisma`**, which declares a differently-shaped
`@@index([searchableByRecruiters, updatedAt(sort: Desc)])`. It was created out of band. Not
fixed here — flagged.

---

## 5. Correctness: pre-filter truncation — NOT demonstrated, and why

| pool | needles in DB | examined | returned | miss rate |
|---|---|---|---|---|
| 569 | 2 | 567 | 2 | **0%** |
| 2,069 | 8 | 2,067 | 8 | **0%** |
| 5,069 | 20 | 5,067 | 20 | **0%** |

The synthetic pool placed rare-skill candidates at the **bottom** of the evidence order
specifically so a cap applied before filtering would drop them. It never did — because
**the PROGRAM track has no cap to apply.** `examined` reached 5,067, far above 600.

So plan 136 §8's hypothesis is **correct in principle but does not apply to the track tested**.
The two defects are mutually exclusive per track:

| track | cap | consequence |
|---|---|---|
| **PROGRAM** | none | correct results, **unbounded rows** (§2) |
| **PROFILE** | `take: 600` in SQL | bounded, **truncation risk — untested** |
| **HACKATHON** | `take: 200` | bounded, **truncation risk — untested** |

PROGRAM was chosen deliberately, to stress the unbounded read. That choice is precisely why
truncation could not appear. **Truncation on PROFILE/HACKATHON remains plausible and
unproven** — it needs a pool seeded on those tracks, and is the obvious follow-up.

---

## 6. Wall-clock, for completeness only

Not representative of production. Recorded because the same machine ran every wave, so the
trend is meaningful even where the absolute numbers are not.

| pool | p50 ("role only", OFF) |
|---|---|
| 69 | 2,809 ms |
| 569 | 4,413 ms |
| 2,069 | 17,989 ms |
| 5,069 | 15,811 ms |

Two honest anomalies: at pool 2,069 tracks-ON measured *faster* than tracks-OFF in places
(8,986 ms vs 16,857 ms) despite returning more rows, and 5,069 measured faster than 2,069.
Both are impossible if wall-clock tracked query cost — further evidence these numbers are
network noise. `blks_read` was 0 almost throughout: everything fit in Postgres cache at
these sizes.

---

## 7. Findings documented, deliberately NOT fixed in this PR

| where | finding |
|---|---|
| `track-loaders.ts:351` / `pool-policy.ts` | `ProgramMember.findMany` receives no `take`; `CHALLENGE_POOL_CAP` never reaches `loadProgram()`. **The root cause of §2.** Architectural — needs filters + limit in SQL (plan 112 §8 / R3), not an index. |
| `repositories/hire.ts:383-408` | `listChallengeCandidates` has no `take`, no `orderBy`, no day predicate. The §3 tax. |
| `search-candidates.ts:46-56` | The `CHALLENGE_POOL_CAP` comment is factually wrong about preventing a full table scan. |
| `repositories/hire.ts:145` + `talent.ts:64-71` | `RECRUITER_FIELD_POLICY.interviewResults` is `false`, yet the `interview` relation is still selected and discarded in JS. 0.042 ms/search — real but negligible; listed for completeness. |
| `CandidateVisibility` | DB-only index `candidate_visibility_searchable` not present in `schema.prisma`. Schema drift. |
| PROFILE / HACKATHON | pre-filter truncation untested (§5). |

---

## 8. Environment and integrity

- **No predicate was relaxed, widened or bypassed.** `searchableUserWhere()`,
  `requireApprovedRecruiter` and `assertRateLimit` are untouched. The engine harness measures
  `searchCandidates` directly — the rate limiter lives in the Server Action, not the engine,
  so nothing had to be disabled to run it.
- **Real users untouched.** No `searchableByRecruiters` flag was flipped on any real account.
  The pool was synthetic (`@loadpool.abtalks.dev`) with its own cohort.
- **Teardown verified** — every count back to its pre-ticket value:
  `User 12,810` · `CandidateVisibility 12,807` · `searchable 69` · `ProgramMember 67` ·
  leftover synthetic `0` · leftover cohort `0`.
- **Production never touched.** No migration, no seed, no measurement against it.

### A defect in this harness, found and fixed mid-run

The first 500-candidate wave reported a **100% miss rate**. That was wrong: the seeder set
`missionPoints` (an integer column) but never created `ProgramMissionSubmission` rows, and the
eligibility floor counts *distinct days with a passing submission*
(`dossier.ts:226` → `clearsEvidenceFloor`, `MIN_EARNED_MISSIONS = 3`). **547 of 567 candidates
were below the floor.** After backfilling 20,976 submissions: `belowEvidenceFloor` 547 → 47,
and the needles were found. The invalid wave was discarded and re-run.
