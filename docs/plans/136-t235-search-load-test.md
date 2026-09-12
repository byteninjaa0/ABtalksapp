# T-235 — Realistic search load test (P5 Security & Isolation, B1 Build)

> **STATUS: EXECUTED 2026-09-12.** Results: `docs/plans/136-evidence/timings.md`.
>
> ⚠️ **Three claims in this plan were DISPROVED BY MEASUREMENT during execution.** They are
> left in place, struck through and annotated, rather than silently rewritten — the original
> hypothesis and why it was wrong is the useful part of the record. See the
> **"CORRECTED BY MEASUREMENT"** notes in §6 and §8, and §12 for the summary.

> Plan file: `docs/plans/136-t235-search-load-test.md` (130–133 upstream; 133/134/135 are my open PRs)
> Branch: **`feat/t235-search-load-test`**, cut from a freshly-synced `master`.
> ⚠️ Not to be confused with the existing local branch `feat/t235-non-technical-hiring` — that is
> **T-235 / R11 role families**, a different board item, unmerged and unrelated.

---

## 1. Context

> **Outcome:** As a recruiter, search stays fast when the candidate pool is realistic.
> **Done:** Load test executed against a realistic pool with recorded response times and indexes
> added where needed.
> **Evidence:** the load-test output and the recorded response times.

### Verdict: **FRESH.** Nothing of this exists.

- `load-tests/01-landing-page.js` and `02-dashboard.js` are k6 scripts from **2026-05-27**, predating
  the hire search entirely. Unauthenticated GETs of `/claude-signup` and an API route. No npm script
  references them; `k6` is not a dependency.
- **No** load/bench/perf npm script. `measure:interview` is LLM token cost, not latency.
- **No recorded search response time has ever existed** in this repo or its history.
- `scripts/bench-hire-search.ts` + `docs/hire-benchmark/queries.json` exist **only** on
  `upstream/feat/107-scout-rebuild` (`37edf090`). It has `percentile()` and p50/p95 against the real
  engine — but it imports `reduce-spec`, `criteria.ts`, `rank.ts`, `card-order.ts`, `intake.ts`,
  `normalize.ts`, **none of which exist locally**. A design template, not a drop-in.
- The branch `feat/t235-non-technical-hiring` and `stash@{0}` are both R11 role-family work. Unrelated.

### ⚠️ `docs/Demo88.md:85` already claims this is done

> *"Live but not a screen: … **Search load-tested against a realistic candidate pool.**"*

**That bullet is currently false.** Note the contrast in the same sentence: the backup restore *does*
have evidence on disk — `docs/plans/124-restore-drill-evidence/` holds `timings.txt`, `restore.log`,
`migrate-status.txt`. **That is the evidence shape this ticket must produce**, and the plan copies it.

---

## 2. Two decisions already taken

1. **Load-test what exists, and report the gap.** The ticket says "with the real filters and
   pagination" — but **pagination does not exist on the live path** (§4). Rather than pretend
   otherwise or block, measure the shipped path honestly and let the numbers become the evidence
   that T-235 proper (server-side search) is needed.
2. **Seed synthetic candidates only.** The dev branch already holds **12,810 users and 12,807
   `CandidateVisibility` rows, of which only 69 pass the search gate** — because those ~12,800
   historical users were deliberately never opened. `docs/project-context.md:507` is explicit
   ("**Explicitly NOT** all ~12,800 historical platform users") and plan 133 D1 calls opening them a
   legal decision that "must not be made silently". **Their visibility is never touched.** The pool
   is synthetic, clearly labelled, and removable.

---

## 3. What the search actually does per call — the real cost

Measured from the code, not assumed:

| | |
|---|---|
| Postgres round trips per search | **~25–32** with defaults; **~40+** with `HIRE_CHALLENGE_POOL` set |
| External calls | **1 Groq LLM call** — `explainMatches` (`explain-matches.ts:170-218`, `maxTokens: 2000`) |
| Write transaction | `deleteMany` + **up to 20 `upsert`s** in one `$transaction` (`hire-actions.ts:417-435`) |
| Rate limiter | **2 extra queries per search** (`findMany` + `create`) |

### Three unbounded reads — the real scaling risk

1. **`ProgramMember.findMany` has no `take` at all.** `memberEligibilityWhere` carries none, and
   `CHALLENGE_POOL_CAP` is **never passed to `loadProgram()`** (`track-loaders.ts:351` calls it with
   no args). Prisma then issues **4 more queries** for the nested `cohort`, `commitDays`, `projects`,
   `interview`. Seed 10k program members and one search loads all 10k plus their relations.
2. **`ProgramMissionSubmission.findMany`** — `memberId: { in: memberIds }`, no `take`.
3. **`Enrollment.findMany` (challenge tracks)** — no `take`, no `orderBy`, no day predicate
   (`repositories/hire.ts:363-411`), plus a `_count` aggregate.

### The `CHALLENGE_POOL_CAP` comment is wrong, in two ways

```ts
// search-candidates.ts:46-56 — "low enough that a future track with thousands of
// enrolments cannot turn one Server Action into a full table scan."
const CHALLENGE_POOL_CAP = 600;
```

- For the challenge tracks the cap is applied **in JavaScript after every row is already fetched**
  (`challenge-dossier.ts:200-210`: `listChallengeCandidates()` → `.filter()` → `.sort()` →
  `.slice()`). So it *is* a full scan of `Enrollment`, every search — precisely what the comment
  says it prevents.
- It only reaches the DB for **PROFILE** (`take: 600`). **PROGRAM never receives it**; **HACKATHON
  discards it** (`listHackathonCandidates()` called with no arg → `take: 200` default).

**Consequence for the test design:** a 12.8k *PROFILE* seed would silently cap at 600 in SQL and
**look fast for the wrong reason**. The pool must be **PROGRAM** members to stress the unbounded path.

---

## 4. Why "pagination" cannot be load-tested

No `skip`, no cursor, no offset, no count query anywhere in `search-candidates.ts`,
`track-loaders.ts` or the `/hire` reads. `limit` is a JS `.slice()`. `totalEligible` is an in-memory
array length.

**The sort key is a computed score** (`score-candidate.ts:558-564`). No column exists and no index
could ever serve it. **Moving `/hire` to real pagination requires scoring in SQL or a materialised
score column** — that is the structural blocker, and it is T-235 proper / R3, not this ticket.

The only paginating `searchCandidates` is `repositories/talent.ts:206-381` (real `page`/`pageSize`,
`$transaction([count, findMany])`). **Confirmed still dark:** nothing imports `@/repositories`, and
its `ctx` parameter is named `_ctx` and unused. Do not load-test it — it is not what `/hire` calls.

---

## 5. ⛔ The rate limiter will ruin the test unless designed around

`src/lib/rate-limit-policy.ts:7-13` — **`SEARCH: 60` per `RATE_LIMIT_WINDOW_MS = 15 min`, per
subject.** That is **4 searches/minute sustained**, and `sendScoutMessageAction` shares the bucket.

Worse, it is **DB-backed and fails closed** (`rate-limit.ts:53-62`): any Postgres error in the
limiter refuses the search. **Under load, if Postgres saturates, you measure the limiter's failure
mode instead of search latency.** There is no bypass env var — I grepped `DISABLE_RATE_LIMIT`,
`RATE_LIMIT_DISABLED`, `SKIP_RATE`, `LOAD_TEST` across `src/`, `docs/`, `package.json`, `CLAUDE.md`:
**zero hits, by design.**

**Resolution — two harnesses, not one.** This also answers the P5 isolation concern honestly:

- **(A) Engine-level** — call `searchCandidates(spec, { limit: 20 })` directly in a `tsx` harness.
  Measures the real queries with no limiter noise. `GROQ_API_KEY` unset so `groqConfigured()` is
  false and we measure Postgres, not a third party.
- **(B) Action-level** — a smaller pass through the real `runMatchAction` with **fanned-out recruiter
  subjects** (N seeded recruiters × ≤60 calls), proving the gated path works at volume and measuring
  the limiter's own cost.

**We do not relax a single predicate to make anything faster.** (B) exists precisely so the recorded
numbers cannot be accused of having skipped the gate.

---

## 6. Files to touch

| File | | Note |
|---|---|---|
| `prisma/seed-load-pool.ts` | **[new]** | Bulk synthetic PROGRAM candidates. Chunked `createMany` (200/chunk) per `migrate-2b-visibility.ts:116-123`. **Allow-list guard** copied from `seed-program-test-users.ts:139-170` (honours `SEED_ALLOW_PRODUCTION`, checks `NODE_ENV`, requires the known dev host) — *not* the weaker deny-list form. Emails `@loadpool.abtalks.dev`; teardown by suffix. |
| `scripts/bench-hire-search.ts` | **[new]** | Harness A + B. `percentile()`, p50/p95/p99, round-trip counting, per-scenario output. Modelled on the `37edf090` template, rewritten for the current engine. |
| `docs/plans/136-evidence/` | **[new]** | `timings.md`, `explain-before.txt`, `explain-after.txt`, `raw-output.txt` — the `124-restore-drill-evidence/` shape. |
| `prisma/migrations/<ts>_search_gate_indexes/migration.sql` | **[new, conditional]** | **Only if EXPLAIN proves it.** Index-only, copying `20260531122710_add_query_indexes`. |
| `prisma/schema.prisma` | [edit, conditional] | The matching `@@index` lines. |
| `package.json` | [edit] | `db:seed:load-pool`, `db:cleanup:load-pool`, `bench:hire`. |
| `docs/Demo88.md` | [edit] | Line 85's claim becomes true — point it at the evidence folder. |
| `docs/CHANGELOG.md` | [edit] | One dated line. |

**Candidate indexes, ranked** (add only what EXPLAIN justifies):

1. ~~**`CandidateVisibility @@index([searchableByRecruiters, withdrawnAt, userId])`** — highest
   leverage by far~~
   > **🔴 CORRECTED BY MEASUREMENT (2026-09-12).** Largely **redundant**. The database already
   > carries a partial index `candidate_visibility_searchable` —
   > `("updatedAt" DESC) WHERE "searchableByRecruiters"` — and `EXPLAIN` shows the gate using it.
   > Warm gate execution is **0.34 ms**. No index was added.
   >
   > ⚠️ Separately: that index **exists in the database but NOT in `prisma/schema.prisma`**, which
   > declares a differently-shaped `@@index([searchableByRecruiters, updatedAt(sort: Desc)])`. It
   > was created out of band — **schema drift, needs its own ticket.**
2. **`CandidateSkill @@index([userId, claimedByCandidate])`** — the PROFILE track's `EXISTS` subquery.
3. **`ProgramCohort`** has **zero indexes** — `WHERE resultsPublishedAt IS NOT NULL … ORDER BY startsAt DESC`
   is a seq scan on every PROGRAM load. Small table; may not be worth an index, but must be measured.

**Two code fixes worth more than any index** — propose, do not sneak in:

- ~~`listChallengeCandidates` filters `challenge: { domain: { in } }`, but **`Enrollment.domain` is
  already indexed** (`schema.prisma:102`). Filtering the denormalised column instead is a one-line
  change that gets an index for free~~
  > **🔴 CORRECTED BY MEASUREMENT (2026-09-12).** This buys **nothing**: warm `EXPLAIN ANALYZE`
  > is **1.47 ms** with the denormalised column vs **1.41 ms** with the `Challenge` join. The
  > planner issues a `Seq Scan on "Enrollment"` either way, because all four domains match
  > nearly every row, so the existing index cannot be used regardless.
  >
  > A first reading appeared to show 23 ms → 1.4 ms, a 16× win. That was **cold-vs-warm buffer
  > cache** (`read=112 dirtied=77` vs `hit=461`), not the query change. Caught before it reached
  > the evidence. The day floor / order / take are still worth pushing into SQL, but as part of
  > the architectural fix in §12, not as a free index win.
- `RECRUITER_FIELD_POLICY.interviewResults` is `false`, yet the `interview` relation is **still
  selected from Postgres** and discarded in JS (`hire.ts:145`). A wasted join per search.
  > **Measured:** 0.092 ms with the join vs 0.050 ms without — **0.042 ms per search.** Real, but
  > negligible next to §12. Kept as a documented finding only.

---

## 7. Steps

0. **Sync master.** `git checkout master && git merge --ff-only upstream/master && git push origin master`.
   **`--ff-only`; if it refuses, STOP and report** — do not rebase or force. Verified read-only: a
   clean fast-forward, 10 commits, no local commits on master. My open PR branches
   (`feat/t244-…` `a97f8514`, `feat/t278-…` `253894b6`, `feat/t239-…` `6d351d88`) **stay untouched**.
   Then cut `feat/t235-search-load-test`.
1. **Confirm the DB target** is `ep-young-shadow-amawetjy`, never production. Record
   `npx prisma migrate status` output into the evidence folder.
2. **Baseline measurement at today's pool** (69 searchable) — harness A, 30 runs across ~8 specs.
   Record p50/p95/p99 and round-trip counts. This is the "before".
3. **Seed in waves** — 500 → 2,000 → 5,000 → 10,000 synthetic PROGRAM candidates, measuring after
   each. A curve is the deliverable, not a single number.
4. **`EXPLAIN (ANALYZE, BUFFERS)`** the gate query and the PROGRAM/PROFILE reads at 10k. Save raw
   output. This is what decides whether an index is warranted — the ticket says *"any query needing
   an index gets one"*, so the EXPLAIN is the justification, not a hunch.
5. **Add only the justified indexes**, then re-measure and **record both numbers** — plan 112-A's
   T-047 requires exactly that ("p95 measured before and after and both numbers recorded").
6. **Harness B** — N seeded recruiters through `runMatchAction`, proving the gated path and measuring
   the limiter.
7. **Measure the correctness defect, not just latency** (§8).
8. **Teardown**, evidence folder, `Demo88.md`, CHANGELOG.

---

## 8. The finding this test must not miss

Plan 112 §8 already says the quiet part: *"**Not because Postgres is too slow** — at ~12,800 users it
is nowhere near its limits"*. So the honest likely outcome is **"fast, but wrong"**, and a pure
latency test would rubber-stamp it.

**The 600 cap truncates *before* filters are applied.** A narrow filter over a large track can
therefore return fewer results than the pool actually contains. The harness must prove this
deliberately:

> **🔴 CORRECTED BY MEASUREMENT (2026-09-12) — this hypothesis is right in principle but does
> NOT apply to the track that was tested.**
>
> Miss rate was **0% at every pool size**: 2/2 needles at 569, 8/8 at 2,069, 20/20 at 5,069,
> with `examined` reaching **5,067** — far above 600. Truncation never fired because **the
> PROGRAM track has no cap to apply**: `CHALLENGE_POOL_CAP` is never passed to `loadProgram()`.
>
> The two defects turn out to be **mutually exclusive per track**:
>
> | track | cap | consequence |
> |---|---|---|
> | **PROGRAM** | none | correct results, **unbounded rows** — this is §12 |
> | **PROFILE** | `take: 600` in SQL | bounded, **truncation risk — UNTESTED** |
> | **HACKATHON** | `take: 200` | bounded, **truncation risk — UNTESTED** |
>
> PROGRAM was chosen deliberately, to stress the unbounded read — and that choice is precisely
> why truncation could not appear. Truncation on PROFILE/HACKATHON remains **plausible and
> unproven**; it needs a pool seeded on those tracks and is the obvious follow-up ticket.

> Seed a pool where candidates matching a narrow filter rank **below** the cap on the pre-cap sort
> key, then assert search misses them. Record the miss rate alongside the timings.

For the challenge tracks it is worse: the evidence floor *and* the ordering the cap depends on are
both computed from a `_count` aggregate over an **uncapped** scan. No index fixes that.

**Measuring this is the difference between evidence and a rubber stamp.**

---

## 9. Guardrails (DO NOT)

- **DO NOT run `prisma migrate dev`.** The dev branch has `20260909120000_workshop_events` in
  `_prisma_migrations` with no folder in the repo (PR #274 deleted it) — `migrate dev` proposes a
  **full reset**. `migrate deploy` only; use `prisma migrate diff` to author the file, per
  `docs/plans/130-t232-outreach-reply-routing.md:26`.
- **DO NOT flip `searchableByRecruiters` on any real user**, even on dev. That is plan 133 D1's
  explicit legal decision. Synthetic rows only.
- **DO NOT touch production**: no migration, no seed, no measurement.
- **DO NOT relax, bypass or widen any predicate to make a number look better** — not
  `searchableUserWhere()`, not `requireApprovedRecruiter`, not `assertRateLimit`. This is a P5
  ticket; a fast number obtained by skipping the gate is worse than no number. `isolation.test.ts:47-59`
  and `rate-limit-policy.test.ts` pin these and would fail anyway.
- **DO NOT add an index without an EXPLAIN to justify it**, and do not use
  `CREATE INDEX CONCURRENTLY` — Prisma 6 wraps migrations in a transaction, so it cannot run there.
- **DO NOT load-test `repositories/talent.ts`'s `searchCandidates`** — it is dark and is not `/hire`.
- **DO NOT implement SQL filters or keyset pagination here.** That is T-235 proper / R3.
- **DO NOT leave the synthetic pool behind.** Teardown by email suffix is part of the deliverable.
- **DO NOT force-push or rebase `master`**, and do not touch the three open PR branches.

### ⚠️ Production migration landmine (flag, do not act)

`docs/CHANGELOG.md` says **five migrations in the repo are applied nowhere**:
`20260813000000_general_interview`, `20260820000000_interview_turn_report`,
`20260911180000_recruiter_assessment_assignment`, `20260911210000_assessment_answer`,
`20260911220000_has_no_work_experience`. On **production**, `migrate deploy` would attempt those
**first, in timestamp order**, before any new index migration — so a search index cannot be deployed
in isolation there. (On **this dev branch** `migrate status` reported "up to date" after the T-244
reconcile, so dev is fine.) **Raise for Sohail; do not resolve here.**

---

## 10. Verification

| | |
|---|---|
| Evidence | `docs/plans/136-evidence/timings.md` (before/after table), `explain-before.txt`, `explain-after.txt`, `raw-output.txt` |
| Targets | plan 112-A:1460 already sets them — **candidate search p95 < 1.5s** |
| Automated | `npm run bench:hire` reproduces the numbers; `tsc --noEmit` 0; `npm run build` exit 0 |
| Regression | `test:demo1-security`, `test:visibility`, `test:hire-score` must stay green — they pin the gate the harness must not bypass |
| Teardown | `db:cleanup:load-pool` leaves `searchable = 69` and the real 12,810 users untouched |

## 11. Commit plan

1. `feat(bench): synthetic load pool seed + /hire search benchmark harness (T-235)`
2. `perf(hire): <index or code fix>` — **only if EXPLAIN justified it**, with before/after p95 in the message
3. `docs: T-235 search load-test evidence, plan 136, CHANGELOG; Demo88 claim now true`

---

## 12. What execution actually found (2026-09-12)

Full numbers: `docs/plans/136-evidence/timings.md`.

**The headline is not latency. It is unbounded row transfer.**

Rows the database returns per search, to produce 20 results, challenge tracks OFF:

| pool | rows ("role only") | rows per candidate |
|---|---|---|
| 69 | 1,189 | 17.2 |
| 569 | 3,672 | 6.5 |
| 2,069 | 42,827 | **20.7** |
| 5,069 | 103,074 | **20.3** |

**~20 rows transferred per candidate in the pool, unbounded.** At the ~12,800-user pool plan
112 names that extrapolates to **~250,000 rows per search** — *extrapolated from the measured
curve, not measured*; the 10,069 wave was seeded but its benchmark was stopped by decision.

**Challenge tracks add a fixed, pool-independent ~35× tax.** At a pool of **69**, enabling them
took "role only" from 1,189 to 42,132 rows, because `listChallengeCandidates` reads every
`Enrollment` with any submission (3,188 enrolments / 15,645 submissions) regardless of how many
of those users are searchable.

**No index is justified, and none was added.** Warm `EXPLAIN ANALYZE`: challenge scan 1.41 ms,
discovery gate 0.34 ms — **planning time exceeds execution time on every hot query.** Postgres
is not the bottleneck. The cost is rows transferred and round trips, which no index reduces.

> **The conclusion, quotably: search does not need an index. It needs the architectural fix
> plan 112 §8 already prescribes — hard filters and a limit pushed into SQL, ranking kept in
> memory over the filtered set.** `ProgramMember.findMany` receiving no `take`
> (`track-loaders.ts:351`) is the root cause.

Also worth recording: **the harness had a defect of its own.** The first 500-candidate wave
reported a 100% miss rate, which was wrong — the seeder set `missionPoints` (an integer column)
but never created `ProgramMissionSubmission` rows, while the eligibility floor counts distinct
days with a *passing* submission (`dossier.ts:226` → `clearsEvidenceFloor`,
`MIN_EARNED_MISSIONS = 3`). **547 of 567 candidates were below the floor.** After backfilling
20,976 submissions: 547 → 47, and the needles were found. The invalid wave was discarded.
