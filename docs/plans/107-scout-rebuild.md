# 107 — Scout rebuild: understand → decide → explain

**Supersedes plan 106.** 106 patched the current architecture; this replaces it.
106's hard-filter rules and its `yearsExperienceStated` threading survive inside
Step 4 here. Do not execute both.

**Revision 2 (2026-09-02)** after architectural review. The central decision —
*LLM understands → deterministic engine decides → LLM explains* — is unchanged
and approved. Seven things changed, all in the matching semantics:

| Area | Revision 1 | Revision 2 |
|---|---|---|
| Constraints | criteria never exclude | **three levels**; a *verified explicit* requirement can exclude on a **known contradiction only** |
| Intake | LLM returns the whole updated spec | **LLM returns a delta**, each op carrying a source span, applied by a deterministic reducer |
| Missing data | `UNCLEAR`, scored `0.4` | `UNCLEAR` kept; **`0.4` deleted** — match and confidence are separate numbers |
| Verdicts | binary + `UNCLEAR` | verdict **plus a continuous `fit`**, so 9.5 years ≠ 1 year |
| Evidence | a string | **structured provenance**, shaped to the existing `SkillEvidence` model |
| Normalization | ad-hoc token matching | **a normalization stage** over `Skill.aliases` and the existing vocabularies |
| Seniority | never `NOT_MET` | **can be `NOT_MET`** — verdict ≠ filtering |
| Verification | 7 browser prompts | **a graded benchmark**, 50–100 queries, three systems compared |

---

## 1. Goal

Rebuild Scout's conversation layer and matching engine so that a natural-language
message becomes a typed spec deterministically, the engine always searches, and
every stated requirement is evaluated against every candidate as a verdict with
evidence — not as a `WHERE` clause. Scout asks a question only when a requirement
is ambiguous or two requirements are in tension.

Scope: **conversation layer, matching engine, candidate pool.** The `/hire` desk
UI is out of scope — its inputs change shape, its layout does not.

---

## 2. Current behavior

### 2a. The architecture generates its own bug list

Eight tools on a LangGraph loop; the model picks the calls and the calls mutate
the brief. Every wrong call has been answered with a guard: `corroborateStack`
(the model stored "SVP" and "EXL" — a title and a company — as required
*skills*), `confirmPoolBrief` (it widened the pool to an unnamed track),
`asRoleTitle` (it stored a whole sentence as the job title), `isGrounded` /
`ungroundedFigures` (it quoted counts nothing produced), `delugSlugs` (it said
`PROGRAM` to a recruiter), `looksLikeToolPayload` (raw tool JSON reached a
recruiter). `spec-fields.ts` grew 249 lines this week.

None of those guards is wrong. They are all the same guard — *the model must not
be allowed to act* — implemented seven times. §5c replaces all seven with one
reducer invariant.

### 2b. Hard filters delete the pool

`evaluateHardFilters` excludes and zeroes on five conditions. Four fire on
**absent** data: role family (`OTHER`/`STUDENT` for ~80% of profiles), years
(`yearsFor()` returns `0` for "never told us"), degree (`education.level` is
hard-coded `null` on challenge and hackathon dossiers), availability (`null` for
most). "senior manager with 10 years" returned **zero of 20**. There is no third
state between "meets it" and "fails it".

### 2c. Two code paths disagree about the pool

`poolSnapshot()` queries the cohort and challenge tracks by hand;
`searchCandidates()` walks `enabledTracks()`, which also includes HACKATHON. A
recruiter was told *"no candidates available"* seconds after a search returned 19.

### 2d. The pool has just widened

`hireChallengePool()` now defaults **on** (10-day floor) in the working tree, so
Claude / SE / DS / AI are searchable unless `HIRE_CHALLENGE_POOL=false`.
`pool-policy.ts` moved from consent-gated to discoverable-by-default. Get real
numbers from `npx tsx scripts/verify-hire-pool.ts` before tuning anything.

### 2e. The 078 tables already model what we are about to build

Not currently read by `/hire` (`ENABLE_NEW_TALENT` is off, and the track loaders
read legacy `StudentProfile.skills String[]`), but already designed:

- **`Skill`** — canonical vocabulary: `slug`, `name`, **`aliases String[]`**,
  commented *"Alternate spellings folded into this skill during normalization"*,
  with a GIN index on `aliases`. This is the normalization table §5d needs.
- **`CandidateSkill`** — `selfRated`, `claimedByCandidate`, `evidenceScore`
  (cached 0–100), **`verified`** (true when non-SELF evidence exists),
  `evidenceCount`, `lastEvidenceAt`. A per-skill confidence signal, already.
- **`SkillEvidence`** — `sourceType`, `sourceId`, **`sourceLabel`** (commented
  *"Human-readable provenance shown to recruiters (\"Databricks Assessment\")"*),
  `score`, `maxScore`, `weight`, `occurredAt`. This is the evidence shape §5e
  needs, richer than anything we would have invented.

**Consequence for this plan:** define `Evidence` and the normalizer to that
shape now, and populate it best-effort from legacy data. When `ENABLE_NEW_TALENT`
flips, the loaders change and nothing above them does — the same seam the track
registry already provides.

---

## 3. What LinkedIn and Juicebox actually do

Researched 2026-09-02.

**LinkedIn Hiring Assistant.** Free text → *one* prompt-engineered LLM call →
structured role details (title, seniority, location, qualifications). That drives
retrieval (MUSE dual-tower embeddings, ANN over ~1B profiles), then an L2 ranker
(DCNv2, 100+ features). Finally **"an LLM guard evaluates each candidate's fit
and generates natural-language explanations."** Intake confirms title, location,
seniority and **which requirements are must-have versus nice-to-have** — decided
once, up front.

**Juicebox / PeopleGPT.** Their docs draw the line this plan turns on:

> To **narrow** your search, edit your project's **filters**.
> To **rank** your search, edit your project's **criteria**.

And their search release confirms filters really do narrow: the system will
*"Apply hundreds of filters (title, location, experience, skills) to narrow the
pool"* and *"Infer criteria… with quality signals"*, both *"in the same step"*.
Per candidate, per criterion, three verdicts: **Good Match** (met explicitly or
by inference), **Potential fit** (*"likely met with some ambiguity or missing
evidence"*), **Not a match** (*"no evidence"*). Results are stack-ranked with a
score. Agents ask a question only *"when a requirement doesn't make sense, or
when multiple criteria are in tension"*.

**Two honest notes on the sources.**

1. Juicebox documents that filters narrow, but **not** what happens to a
   candidate who fails a filter because the data is *missing*. The rule in §5a —
   contradiction excludes, absence never does — is our extension, not something
   either vendor documents. It is the part that fixes 2b, so it needs our own
   benchmark evidence (§11), not an appeal to theirs.
2. Juicebox's own evaluation guide recommends **business outcomes** — time to
   first qualified shortlist, hiring-manager acceptance rate, outreach reply
   rate, ATS write-back — and does **not** mention precision, recall or NDCG.
   The IR metrics in §11 are our offline regression harness, chosen because we
   need to compare three versions of our own engine deterministically. Both
   belong; only the first is attributable to them.

**What we do not take: the retrieval stage.** LinkedIn's ANN layer exists for a
billion profiles. Ours is hundreds to low thousands and fits in memory. No
embeddings, no vector store, no new infrastructure — revisit only if the pool
passes ~50k.

Sources: [LinkedIn Hiring Assistant retrieval & ranking](https://www.zenml.io/llmops-database/semantic-search-for-ai-agents-at-scale-retrieval-and-ranking-for-linkedins-hiring-assistant) · [AI behind LinkedIn Recruiter search](https://www.linkedin.com/blog/engineering/recommendations/ai-behind-linkedin-recruiter-search-and-recommendation-systems) · [Juicebox search docs](https://docs.juicebox.ai/search) · [New Juicebox search experience](https://juicebox.ai/blog/introducing-the-new-juicebox-search-experience) · [Next-gen Juicebox agents](https://juicebox.ai/blog/introducing-the-next-generation-of-juicebox-agents) · [How to evaluate AI sourcing tools](https://info.juicebox.ai/how-to-evaluate-ai-sourcing-tools)

---

## 4. Target architecture

Seven stages. **Two touch a model, and neither can take an action.**

```
recruiter message
      │
 [1] EXTRACT ....... 1 constrained JSON call → SearchSpecDelta (Zod)
      │              every op carries a source span from the recruiter's words
      ▼
 [2] REDUCE ........ no model. delta + prior spec → SearchSpec
      │              source spans verified; unverifiable ops dropped and reported
      ▼
 [3] RETRIEVE ...... no model. enabledTracks() → loadTrack → mergeTrackLoads
      │              structural filters only
      ▼
 [4] NORMALIZE ..... no model. skills, roles, seniority, degrees, locations
      │              → canonical slugs, both sides of the comparison
      ▼
 [5] EVALUATE ...... no model. every criterion × every candidate
      │              → verdict + continuous fit + structured evidence
      ▼
 [6] RANK .......... no model. match and confidence, separately
      │              primary list + excluded list; never empty while the pool isn't
      ▼
 [7] EXPLAIN ....... 1 batched call over evidence objects only
                     → reply sentence + per-card "why"
```

### 4a. Three constraint levels

```
1. STRUCTURAL FILTER          not recruiter-stated. Track membership,
                              discoverability, evidence floor. Always excludes.

2. VERIFIED HARD REQUIREMENT  recruiter said it AND marked it absolute
                              ("only", "must", "required", "at least")
                              AND the field passes the coverage gate (below).
                              Moves a candidate to the EXCLUDED list on a
                              KNOWN CONTRADICTION. Never on missing data.

3. RANKING CRITERION          everything else. Never excludes. Scores.
```

The rule, stated once:

```
explicit requirement + known contradiction   → excluded list, with the reason
explicit requirement + missing information   → UNCLEAR, stays in primary
anything not marked absolute                 → ranks, never excludes
```

**The coverage gate.** A criterion may only be promoted to level 2 if the pool
actually records that field for at least **50%** of retrieved candidates.
Otherwise it degrades to level 3 and Scout says so in words. Without this gate a
sparse field punishes exactly the people honest enough to fill it in: with
`education.level` recorded for 4% of the pool, a hard degree requirement removes
the handful whose recorded degree is wrong and lets 96% through as `UNCLEAR`.
That is worse than not filtering at all. Compute it with the existing
`computeCoverage` machinery in `dossier.ts`, which already does this for scoring
dimensions.

**Nothing is ever deleted.** "Excluded" is a second, collapsed section —
*"3 candidates excluded by your requirements"* — with the contradiction named on
each. That preserves the product answer already given: always ranked results with
visible gaps.

### 4b. `SearchSpec`

```ts
type SearchSpec = {
  /** Verbatim recruiter words, for display and stage 7. Never re-parsed. */
  statedAs: string;
  filters: {                         // level 1 — closed set, model may not invent
    tracks: TrackSlug[];
    minEvidenceDays: number | null;
    resultLimit: number | null;
  };
  criteria: Criterion[];             // levels 2 and 3
};

type Criterion = {
  id: string;                        // stable across turns
  kind: "skill" | "role" | "experience" | "seniority" | "education"
      | "availability" | "compensation" | "location" | "evidence" | "other";
  label: string;                     // the recruiter's own words
  weight: "must" | "nice";           // LinkedIn's must-have / nice-to-have
  /** Level 2 when true AND the coverage gate passes. Set only from an
   *  absolute word the recruiter used — "only", "must", "required". */
  absolute: boolean;
  value: CriterionValue;             // typed per kind
  /** Set by the reducer when the coverage gate demotes it. Rendered as
   *  "I can rank on this but not enforce it." */
  demotedReason?: string;
};
```

`weight` and `absolute` are different questions. `must` says how much it counts;
`absolute` says whether a contradiction removes. A "must" that is not absolute
still ranks hard.

### 4c. Delta intake — the change that replaces seven guards

Stage 1 returns operations, never a whole spec:

```ts
type SearchSpecDelta = {
  addCriteria:    { criterion: Omit<Criterion, "id">; sourceText: string }[];
  updateCriteria: { id: string; patch: Partial<Criterion>; sourceText: string }[];
  removeCriteria: { id: string; sourceText: string }[];
  filtersPatch:   { patch: Partial<SearchSpec["filters"]>; sourceText: string } | null;
  clarify:        { question: string; options: string[] } | null;
};
```

Stage 2 is a pure reducer. For every operation it checks that `sourceText`
actually occurs in the recruiter's words — this turn's message, or any earlier
one — after light normalization (case, punctuation, whitespace). An operation
whose span cannot be found is **dropped and reported**, never applied.

This is the whole point. `corroborateStack` was this check for one field;
`confirmPoolBrief` was it for another; `asRoleTitle` was a shape check standing
in for it. One invariant, applied to every operation, replaces all of them:

> **The model may not change anything the recruiter did not say, and every
> change carries the words that justify it.**

It also fixes a failure mode whole-spec regeneration cannot: the model silently
dropping a criterion from three turns ago, or quietly flipping a weight. A
`removeCriteria` op needs a span too — the recruiter has to have said something
that removes it.

On a validation failure, a model error, or a timeout: **keep the prior spec and
search anyway.** A degraded extraction must never cost the recruiter their cards.

### 4d. Normalization

Both sides of every comparison pass through the same canonicalizer before stage
5. `react` / `React.js` / `ReactJS` → `skill.react`; `SDE` / `Software Developer`
/ `Backend Engineer` → a role canon; degrees, seniority labels and locations
likewise.

Sources, in priority order — **build no new alias table**:

1. **`Skill.aliases`** (§2e) — the canonical vocabulary, already GIN-indexed and
   documented for exactly this. Loaded once per request and memoised.
2. `src/lib/candidate-vocab.ts` — `DEGREES`, `FIELDS_OF_STUDY`, `COMMON_ROLES`,
   `WORK_MODES`. These populate the profile dropdowns, so candidate data is
   already drawn from them; the canon must agree with them.
3. `role-family.ts` — keep as the coarse bucket, demoted to a **fallback** for
   titles the canon misses, not the primary comparison.
4. A small curated `ALIASES` map in `normalize.ts` for what the above miss.

Aliases may be *authored* with AI help offline and reviewed into the table.
**The runtime lookup is a static map. Ranking stays deterministic.**

### 4e. Evaluate — verdict, fit, evidence

```ts
type CriterionVerdict = {
  criterionId: string;
  verdict: "MET" | "UNCLEAR" | "NOT_MET";
  /** Continuous 0–1. null only when UNCLEAR. Drives ranking; the verdict is
   *  the label. This is what stops 9.5 years scoring like 1 year. */
  fit: number | null;
  /** 0–1. How much we trust the data behind this verdict — from
   *  CandidateSkill.verified / evidenceScore where available, else declared. */
  confidence: number;
  evidence: Evidence[];
};

type Evidence = {
  field: string;        // "skills", "missionsPassed", "yearsExperience"
  value: string;        // "React.js", "14 of 28"
  /** Mirrors SkillEvidence.sourceType so the 078 rows drop straight in. */
  source: "candidate_profile" | "challenge_project" | "assessment"
        | "interview" | "program_mission" | "hackathon";
  /** Mirrors SkillEvidence.sourceLabel — recruiter-readable provenance. */
  sourceLabel: string;  // "Databricks Assessment", "Day 14 mission"
  occurredAt?: string;
};
```

The three-valued rule, unchanged and non-negotiable:

| Candidate data | Verdict |
|---|---|
| present and satisfies | `MET` |
| **absent / never collected** | **`UNCLEAR`** |
| present and contradicts | `NOT_MET` |

**Continuous fit is required for every numeric kind.** For a minimum `m`:
`fit = clamp(years / m, 0, 1)` — 9.5 against 10 is `0.95`, 1 against 10 is
`0.1`. Both are `NOT_MET`; they rank nothing like each other. For a band, fit
decays with distance outside it. For categorical kinds fit is 1 or 0.

Per-kind evaluators, each pure, each `(criterion, candidate) => CriterionVerdict`:

- **skill** — canonical slug match against declared skills and verified working
  languages. `NOT_MET` when the candidate has a non-empty skill list without it;
  `UNCLEAR` only when no skills are recorded at all. Confidence from
  `CandidateSkill.verified` where available.
- **role** — canonical role match, `role-family.ts` as fallback. `UNCLEAR` when
  the candidate's role is absent, `OTHER` or `STUDENT` — absence, not conflict.
- **experience** — graded per above. `UNCLEAR` when
  `yearsExperienceKnown === false`.
- **seniority** — **`NOT_MET` is allowed.** A junior with 2 years against a
  stated VP requirement is not unclear, it is a contradiction. Whether it
  *removes* them is `absolute`'s job, not the verdict's. **Verdict ≠ filtering.**
- **education** — `UNCLEAR` whenever `education.level` is null (every challenge
  and hackathon dossier today).
- **availability / compensation / location** — `UNCLEAR` when `availability` is
  null; `MET`/`NOT_MET` only against a recorded preference.
- **evidence** — missions, clean-pass rate, commit days. Always `MET`/`NOT_MET`
  with graded fit; we hold this for everyone.
- **other** — always `UNCLEAR`, evidence `"not something we verify"`. Keeps an
  unrecognised requirement visible instead of dropped, and Scout says so.

Fold 106's Step 2 in here: `yearsExperienceStated` on `CandidateDossier`,
`yearsExperienceKnown` on `ScoreableMember`, set in all three dossier builders
and threaded through `track-loaders.ts`. Absent means "assume stated".

### 4f. Rank — match and confidence are two numbers

`UNCLEAR = 0.4` is deleted. It forced one number to answer two questions.

```
known    = criteria whose verdict is MET or NOT_MET
w(c)     = 3 for must, 1 for nice

match      = Σ_known  w(c) · fit(c)  /  Σ_known  w(c)          // 0–100
confidence = Σ_known  w(c)           /  Σ_all    w(c)          // 0–1
```

- **match** — how good the evidence we *have* looks.
- **confidence** — how much of the requirement we could actually check.

A card reads `Match 87 · Confidence 64` — "strong on what we know, several things
unrecorded". That is interpretable in a way a single 87 never is.

**Sort key** (one number is still needed for ordering) — shrink an unconfident
match toward the pool's median match:

```
sortKey = match · confidence + medianMatch · (1 − confidence)
```

A fully-unknown candidate lands at the pool average — not top, not bottom, which
is the honest position. It directly fixes the reviewed complaint: a 9.5-years
near-miss (high fit, high confidence) now outranks a completely-unknown profile,
where `0.4` had it backwards.

With **no criteria at all**, fall back to the existing evidence rubric in
`score-candidate.ts` so an unfiltered search still ranks meaningfully.

Every constant here — `w`, the shrinkage form, the fit curves, the 50% coverage
gate — is a **starting value to be settled by §11's benchmark**, not a decision.
None of them is load-bearing on correctness; all of them are load-bearing on
quality.

---

## 5. Files to touch

The working tree carries in-flight work from Cursor *and* an earlier direct
implementation. **Do not `git checkout` anything** — see Step 0.

### New

| Path | Note |
|---|---|
| `src/lib/hire-llm.ts` | Vendor resolution + one `askJson` helper. Lifted from `scout-graph.ts` + `lib/groq.ts`. |
| `src/features/hire/intake.ts` | Stage 1. One JSON call → `SearchSpecDelta`. |
| `src/features/hire/reduce-spec.ts` | Stage 2. Pure reducer, source-span verification, coverage-gate demotion. |
| `src/features/hire/normalize.ts` | Stage 4. Canonical slugs from `Skill.aliases` + vocab. |
| `src/features/hire/criteria.ts` | Stage 5. Types + one pure evaluator per `kind`. |
| `src/features/hire/rank.ts` | Stage 6. match / confidence / sortKey, primary + excluded. |
| `src/features/hire/reduce-spec.test.ts` | Source-span verification, every op, demotion. |
| `src/features/hire/criteria.test.ts` | Every kind × present / absent / contradicting; fit curves. |
| `src/features/hire/rank.test.ts` | Ordering invariants; never-empty; match ≠ confidence. |
| `scripts/bench-hire-search.ts` | §11 benchmark runner. |
| `docs/hire-benchmark/queries.json` | 50–100 graded queries. |

### Rewritten

`scout-agent.ts` (a ~150-line orchestrator of the seven stages, no tool loop),
`score-candidate.ts` (keeps the evidence rubric and `tierFor`; loses
`evaluateHardFilters` to `criteria.ts` and ranking to `rank.ts`),
`search-candidates.ts` (stages 3→6), `pool-facts.ts` (`poolSnapshot` onto
`loadTrack` + `mergeTrackLoads` — defect 2c), `src/lib/validations/hire.ts`
(`searchSpecSchema`, `criterionSchema`, `searchSpecDeltaSchema`; `JobSpec` stays
as the stored/legacy shape).

### Deleted

`scout-graph.ts` (no loop; `resolveVendor()` moves to `hire-llm.ts`),
`scout-tools.ts` (the model has no tools), `scout-chips.ts` (replaced by
`clarify.options`), the guard helpers in `spec-fields.ts` (`corroborateStack`,
`sanitizeSpecStack`, `isPlausibleSkillToken`, `stackTokenNamedIn` — the reducer
generalizes them; **keep** `parseMoney`, `formatSpecSalary`, `isMonthlyContext`,
`asRoleTitle`), `confirmPoolBrief` in `pool-brief.ts` (**keep**
`extractPoolBrief` / `applyPoolBrief` / `readPoolExtra`).

### Edited

`explain-matches.ts` (stage 7 takes evidence objects), `to-public-match.ts`
(carry verdicts to the card), `types.ts`, `track-loaders.ts`, the three dossier
builders, `scout-conversation.ts`, and the four existing test files.

### Untouched — deliberately

`src/components/hire/**` (UI out of scope), `track-registry.ts`,
`src/repositories/**`, `prisma/schema.prisma`, `middleware.ts`,
`capabilities.ts` (the `protected_attribute` gate stays exactly where it is).

---

## 6. Server vs Client

Every new and rewritten file is **Server**, `import "server-only"` at the top.

`reduce-spec.ts`, `normalize.ts`, `criteria.ts` and `rank.ts` must be **pure** —
no Prisma, no fetch, no model — so the suites and the benchmark exercise them
with plain objects. `normalize.ts` takes the alias table as an **argument**; the
one function that loads it from Prisma lives in `track-loaders.ts`.

**The one Server→Client boundary** is the existing `ScoutTurn`. It gains:

```ts
verdictsByCandidate?: Record<string, CriterionVerdict[]>
scoresByCandidate?:   Record<string, { match: number; confidence: number }>
excluded?:            { candidateRef: string; reason: string }[]
```

Plain JSON — strings, numbers, string enums. No functions, no icons, no class
instances, no `Date` (`occurredAt` is an ISO string). Extend the existing
boundary test to cover `intake`, `reduce-spec`, `normalize`, `criteria`, `rank`
and `hire-llm`.

---

## 7. Steps

### Step 0 — baseline

1. `git status`, `git stash list`. **Do not revert.** Section 5's files carry
   both Cursor's in-flight work and an earlier direct implementation.
2. Full green: `npx tsc --noEmit`, `npm run build`, all five suites.
3. `npx tsx scripts/verify-hire-pool.ts` — record real per-track numbers now
   that `hireChallengePool()` defaults on.
4. **Commit the tree as-is on a new branch.** This plan deletes files.
5. Build the benchmark harness **before** the rewrite (§11) and record the
   current engine's scores. Without a "before" number, "better" is an opinion.

### Step 1 — `src/lib/hire-llm.ts`

`resolveVendor()` (from `scout-graph.ts`: `HIRE_AGENT_PROVIDER` forces
`openai`|`groq`; unset prefers OpenAI; `null` when no key) plus:

```ts
askJson<T>({ system, user, schema, schemaName, maxTokens?, timeoutMs? })
  : Promise<{ ok: true; data: T } | { ok: false; reason: "timeout"|"rate_limit"|"auth"|"error" }>
```

Both vendors speak `chat/completions` with
`response_format: { type: "json_schema", strict: true }` — one code path; the
vendor changes the URL, key and model. Defaults: `gpt-4.1-mini` on OpenAI
(**not** `gpt-4o` — OpenAI meters per model and Scout must not draw from the
bucket a graded interview needs; same reasoning as
`lib/chatbot/providers.ts:101`), `openai/gpt-oss-120b` on Groq. Rotate
`GROQ_API_KEY` → `_2` → `_3` on 429/401, never on an abort.

Then delete `scout-graph.ts`, and drop `@langchain/*` from `package.json` if the
interview agent does not use them.

### Step 2 — `intake.ts` + `reduce-spec.ts` (stages 1–2)

Prompt rules, all enforced by the schema or the reducer rather than trust:

- Emit **operations**, never a whole spec.
- Every operation carries `sourceText` — a **verbatim span** from the
  recruiter's message.
- One criterion per stated requirement, `label` in their words.
- `weight: "must"` on a signalled priority; `absolute: true` only on an absolute
  word — "only", "must", "required", "at least", "hard requirement".
- `filters` may contain only a supplied track slug, a day floor, or a result cap.
- A skill is a technology, not a job title or company.
- `clarify` only when a requirement is ambiguous or two are in tension. **Never**
  because a field is empty.

The reducer: verify every span (normalized) against this turn's message and the
history; drop-and-report what fails; apply add/update/remove; run the §4a
coverage gate and set `demotedReason` where a level-2 criterion must fall to
level 3. On any failure — invalid JSON, model error, timeout — **return the
prior spec and let the search run**.

### Step 3 — `normalize.ts` (stage 4)

Canonicalize both sides. Load `Skill` + `aliases` once per request (memoised, in
`track-loaders.ts`), pass it in. Seed the role canon from
`candidate-vocab.ts::COMMON_ROLES`; `role-family.ts` becomes the fallback bucket,
not the primary comparison. Add a small curated `ALIASES` map for the rest.
Pure function, static lookup, no model at runtime.

### Step 4 — `criteria.ts` (stage 5)

The types and evaluators in §4e. Fold in 106's Step 2 (`yearsExperienceStated` /
`yearsExperienceKnown` through the dossier builders and `track-loaders.ts`).

### Step 5 — `rank.ts` (stage 6)

§4f exactly. Returns `{ primary, excluded }`. A candidate reaches `excluded`
**only** when a level-2 criterion is `NOT_MET` — never on `UNCLEAR`. Sort by
`sortKey`; keep the existing stable tiebreak.

### Step 6 — stages 3 and the pool

1. `search-candidates.ts`: `enabledTracks()` (or `spec.filters.tracks`) →
   `loadTrack` → `mergeTrackLoads` → normalize → evaluate → rank. Structural
   exclusion only at retrieval.
2. `pool-facts.ts`: `poolSnapshot()` onto the **same** loaders (defect 2c). Add a
   **"not stated"** experience band for `yearsExperienceKnown === false` —
   counting an unstated figure as "0–1 yrs" tells a recruiter the pool is junior
   when the truth is nobody said.
3. Confirm `hireChallengePool()` defaulting on is intended; record Step 0.3's
   numbers in the PR. Whether the AI Cohort joins is `HIRE_OPEN_COHORT_IDS` — an
   env decision for Sohail, not a code change.

### Step 7 — orchestrator and stage 7

```
protected-attribute gate (unchanged, before everything)
  → extract → reduce
  → if clarify && !searchable  → ask, no search
  → if clarify && searchable   → search AND ask, question above the cards
  → retrieve → normalize → evaluate → rank
  → explain (skip on a failed call; deterministic sentence)
  → turn
```

`explain-matches.ts` receives **only `Evidence[]`**, never raw candidate rows —
that is what makes "Strong React experience" traceable to
`{field: "skills", value: "React.js", sourceLabel: "Day 14 mission"}`. Keep
`isGrounded` / `ungroundedFigures` unchanged. Report `demotedReason` and dropped
delta operations in Scout's own words: *"I can rank on the degree requirement but
not enforce it — we only hold it for a fraction of the pool."*

`scout-conversation.ts`: `turnFor` gains the three §6 fields. `options` is now
only ever `clarify.options`.

### Step 8 — calibrate against the benchmark

Tune `w`, the fit curves, the shrinkage and the coverage gate against §11's
numbers. **Never add a filter to fix a ranking problem** — that is how the
current engine got here.

---

## 8. Guardrails for Cursor (DO NOT)

- **DO NOT** `git checkout` / `git restore` any file in §5. Branch and commit
  first (Step 0.4).
- **DO NOT** exclude a candidate on `UNCLEAR`, anywhere, for any reason. Missing
  data never removes anyone. This is the bug.
- **DO NOT** let a level-3 criterion exclude, or promote a criterion to level 2
  without the coverage gate.
- **DO NOT** delete a candidate outright. "Excluded" is a visible, reasoned
  section — never a silent drop.
- **DO NOT** collapse match and confidence into one number in the data model.
  One sort key is fine; the card and the API keep both.
- **DO NOT** give the model a tool, a function-call, or any way to mutate the
  spec. Stage 1 returns a delta; stage 7 returns prose. If you find yourself
  adding a guard because "the model got it wrong", the schema or the reducer is
  wrong — fix that, do not add an eighth guard.
- **DO NOT** apply a delta operation whose `sourceText` cannot be found in the
  recruiter's words. Drop and report. No exceptions, no "close enough" matching
  beyond case/punctuation/whitespace.
- **DO NOT** call a model inside `normalize.ts`, `criteria.ts`, `reduce-spec.ts`
  or `rank.ts`. Aliases are authored offline; runtime is a static lookup.
- **DO NOT** create a new skill-alias table. `Skill.aliases` exists (§2e).
- **DO NOT** touch `capabilities.ts` or move the `protected_attribute` gate.
- **DO NOT** remove `import "server-only"` from anything in `features/hire/`.
- **DO NOT** import any stage module from a `"use client"` file.
- **DO NOT** change anything under `src/components/hire/`. If a verdict cannot
  reach the card without a component change, stop and say so rather than
  widening scope.
- **DO NOT** add embeddings, a vector store, a queue, or a background job.
- **DO NOT** default Scout to `gpt-4o` (Step 1).
- **DO NOT** change `prisma/schema.prisma`, add a migration, or run any
  `db:seed` / `db:cleanup` / `db:migrate` command. `SearchSpec` is stored inside
  the existing `TalentRequest.spec` JSON column, under a new key so old rows
  still parse as `JobSpec`.
- **DO NOT** change `middleware.ts`, `auth.config.ts` or `auth.ts`.
- **DO NOT** delete a §5 file until its replacement passes its tests.
- **DO NOT** report done on a green build. The last two defects here — raw JSON
  in the transcript, and `get_pool_stats` contradicting the search — both passed
  typecheck, lint, build and 150 tests.

---

## 9. DB safety

No schema change, no migration, no seed, no backfill. `SearchSpec` persists
inside the existing `TalentRequest.spec` JSON column under a new key.

Reading `Skill` / `Skill.aliases` is a new **read** against tables the platform
taxonomy seed already populates (`npm run db:seed:platform-taxonomy`). Confirm
they are populated in production before relying on them; fall back to the
curated map when empty.

`scripts/verify-hire-pool.ts`, `scripts/diagnose-hire-candidate.ts` and
`scripts/bench-hire-search.ts` are read-only and must stay that way —
`.env.local`'s `DATABASE_URL` points at production.

---

## 10. Deferred — not in this plan

**Recruiter feedback into ranking.** 👍 / 👎 wrong-seniority / 👎 wrong-domain /
⭐ shortlist, used to adjust **that project's criterion weights only** — never a
global model. It needs a table (`TalentRequestFeedback`), so it is a schema
change and a separate plan. Build it after the benchmark exists, so its effect
is measurable rather than asserted. The `Criterion.weight` field and the stable
`Criterion.id` in §4b exist partly so this stays cheap to add.

---

## 11. Verification

### Automated

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/features/hire/ src/lib/hire-llm.ts scripts/
npm run test:hire-score && npm run test:scout && npm run test:sample \
  && npm run test:visibility && npm run test:virtual
npm run build
```

`scout-chat.tsx` has 8 pre-existing `react-hooks/refs` errors around
`stripItemsRef`. Not from this plan — do not fix, do not let them mask a new one.

New suites:

- **`reduce-spec.test.ts`** — an op with a fabricated `sourceText` is dropped and
  reported; a real span applies; a `removeCriteria` without a span is dropped; a
  criterion below the coverage gate is demoted with a reason; an invalid delta
  leaves the prior spec untouched.
- **`criteria.test.ts`** — every kind × {satisfies, contradicts, absent}. The
  absent column is `UNCLEAR` everywhere. Pin the regressions: blank role →
  `UNCLEAR`; `B.Tech Student` vs management → `UNCLEAR`;
  `yearsExperienceKnown: false` vs 10+ → `UNCLEAR`; `Data Analyst` vs
  `Backend engineer` → `NOT_MET`; null availability vs `REMOTE` → `UNCLEAR`;
  `preferredWorkMode: ONSITE` vs `REMOTE` → `NOT_MET`; **junior 2 years vs a VP
  requirement → `NOT_MET`, not `UNCLEAR`**. Fit curves: 9.5 vs 10 → `fit ≈ 0.95`;
  1 vs 10 → `fit ≈ 0.1`; both `NOT_MET`.
- **`rank.test.ts`** — a 9.5-year near-miss outranks a fully-unknown candidate;
  a fully-unknown candidate sits near the pool median, not top or bottom; match
  and confidence move independently; **the primary list is never empty while the
  pool is non-empty**; a level-2 `NOT_MET` lands in `excluded` with a reason; a
  level-2 `UNCLEAR` never does.
- **`normalize.test.ts`** — `React` / `React.js` / `ReactJS` → one slug;
  `Node` / `Node.js` / `NodeJS` → one slug; `SDE` / `Software Developer` /
  `Backend Engineer` → one role canon; an unknown token survives unchanged
  rather than being dropped.

### The benchmark — mandatory before production

Seven browser prompts cannot tell you whether search *quality* improved.

Build `docs/hire-benchmark/queries.json`: **50–100 realistic recruiter searches**
against the live pool, each with candidates hand-graded
`excellent | good | borderline | bad`. Cover the real distribution: plain role
searches, stack searches, seniority, absolute requirements ("python only"),
tension cases, Hinglish, out-of-scope, and at least ten queries the current
engine returns **zero** for.

`scripts/bench-hire-search.ts` runs a graded set against an engine version and
reports:

| Metric | Why |
|---|---|
| Precision@5, Precision@10 | is the top of the list right |
| NDCG@10 | is the *ordering* right, not just the set |
| **false-exclusion rate** | how often an excellent candidate is excluded — the metric this whole plan exists to move |
| unknown-data rate | share of verdicts that are `UNCLEAR` — the honest measure of profile coverage |
| intent-extraction accuracy | criteria extracted vs hand-labelled, per query |
| latency p50 / p95 | two model calls, not three |
| time to first qualified shortlist | Juicebox's own headline outcome metric |

Run three ways and publish the table in the PR:

```
Scout CURRENT   (master)
Scout 107       (this plan, defaults as written)
Scout 107+      (after Step 8 calibration)
```

**107 must beat CURRENT on false-exclusion rate and NDCG@10, or the plan has
produced cleaner architecture and no better product.** That is the bar.

### Manual — still required

`preview_start` `abtalks-plain-dev`, open `/hire` as a **guest** (writes
nothing). Sessions persist in localStorage — click **New search** each time.

| # | Type | Must happen |
|---|---|---|
| 1 | `senior manager with more than 10 years of experience` | Searches that turn. Ranked, **non-zero**. Years and role show as **UNCLEAR**, not exclusions. Card shows Match and Confidence separately. No JSON. |
| 2 | `python developers only from Delhi` | `python` is level 2 (absolute). Delhi is captured; if location coverage is under 50% it is **demoted** and Scout says so. Contradictions appear in a reasoned **excluded** section, never deleted. |
| 3 | `I need a VP-level engineering leader` | A junior candidate is `NOT_MET` on seniority — not `UNCLEAR`. Whether they are excluded follows from `absolute`. |
| 4 | `react developer` | `MET` for react-havers, `NOT_MET` for candidates with a non-empty skill list lacking it, `UNCLEAR` only for candidates with no skills recorded. Confirms three states are real. |
| 5 | `how many candidates do you have?` | No search. Prose. The number **equals** case 1's searched-count. |
| 6 | `someone very senior but also cheap` | One clarifying question, **and** best ranked results underneath. |
| 7 | `who is the prime minister of india` | Out of scope. No search, no criterion created. |
| 8 | `backend engineer` then `Search now` | The second message searches. Never "tap Show me". |
| 9 | `node developer` then `actually make it python` | The reducer **replaces** node with python — the delta carries a span for both ops. Node does not silently survive, and nothing else in the brief changes. |

`preview_logs`: **one** extract call and at most one explain call per turn. Two
model calls, never three.

### Files that should have changed

Exactly §5's lists. Nothing under `prisma/`, `src/middleware.ts`,
`src/auth*.ts`, `src/repositories/`, `src/components/`.

---

## 12. Commit message

```
feat(hire): rebuild Scout as understand → decide → explain

Scout was an eight-tool LangGraph loop in which the model could mutate the brief,
and every wrong tool call had been answered with another guard — corroborateStack,
confirmPoolBrief, asRoleTitle, the grounding checks, looksLikeToolPayload. Seven
guards enforcing one thing: the model must not act. This stops giving it actions.

Intake returns a DELTA, not a spec: add/update/remove operations, each carrying a
verbatim span from the recruiter's own words, applied by a deterministic reducer
that drops any operation whose span it cannot find. That one invariant replaces
all seven guards, and it closes a hole whole-spec regeneration could not — the
model silently dropping a criterion or flipping a weight nobody touched.

Matching is rebuilt on three constraint levels. Structural filters exclude.
A requirement the recruiter marked absolute excludes on a KNOWN CONTRADICTION
only, and only if the pool records that field for at least half of candidates —
a sparse field otherwise punishes exactly the people honest enough to fill it in.
Everything else ranks. Missing data never excludes anyone: "senior manager with
10 years" returned zero of twenty because role, years, degree and availability
were all blank and blank read as failure.

Verdicts are MET / UNCLEAR / NOT_MET plus a continuous fit, so 9.5 years against
a 10-year requirement no longer scores like one year. Match and confidence are
separate numbers — how good the evidence looks, and how much of it we actually
have — instead of one percentage pretending to answer both.

Evidence is structured and shaped to the existing SkillEvidence model, so the
explanation model sees provenance rather than rows, and "strong React experience"
traces to the mission that proves it.

poolSnapshot moves onto the search's own loaders; it had been querying two
sources by hand and reporting an empty pool while a search returned nineteen.

Ranking quality is measured, not asserted: a 50-100 query graded benchmark
reports precision@5/10, NDCG@10 and false-exclusion rate for CURRENT vs 107 vs
calibrated-107.

No schema change. ENABLE_NEW_* untouched; legacy tables stay authoritative.
```
