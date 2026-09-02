# 106 — Scout: search-first, honest matching, no button ladder

## 1. Goal

Make Scout behave like a search engine that talks, not a form that interviews.
A recruiter who states a requirement gets ranked candidate cards on that turn;
refinement happens with results on screen. Matching returns people the pool
actually contains instead of filtering everyone out on fields nobody filled in.
Follow-up questions are asked in prose, not as a row of tap-buttons.

The reported failure, verbatim: *"when I search for any requirement it should
start the search immediately with the results, it should not ask me more
details… it is not matching the correct details… it is always asking me
questions in the form of options — I want it to be like Juicebox search, ask me
more questions if you need more clarity."*

---

## 2. Current behavior

### 2a. The reported transcript

Recruiter typed **"senior manager with 10 years of experience"**. Scout replied
`"Noted: Senior · senior manager. I'm at capacity for a moment — give it a few
seconds and send that again."` Recruiter typed **"Search now"**. Scout replied
`"I have enough to search on — tap Show me."` Only after tapping did a search
run, and it returned **zero** candidates:

> No strong matches for your stack. Closest profile: AB-2985 (score 0) — Role
> mismatch: requires Management; Experience below required 10+ years. Searched
> 20 opted-in candidate(s) with verified work.

Underneath the message sat five chips: `Python + SQL`, `TypeScript + React`,
`Java + Spring`, `Node + Postgres`, `No hard requirement` — a stack ladder
offered for a management role.

Four distinct defects are visible in that one exchange, and a fifth was found
while investigating.

### 2b. Defect 1 — a stated requirement does not search

`runScoutAgent` (`features/hire/scout-agent.ts`) only sets `action: "search"`
when the model's `search_pool` tool fired, or when `wantsCandidates(msg)` — a
regex needing an imperative verb *and* a people-noun ("give me 5 students").
"senior manager with 10 years of experience" matches neither, so the turn ends
as a question.

`wantsToSeeCards()` is the see-cards escape hatch, and its verb list
(`give|show|send|fetch|get|find|list|pull|bring|dikha|…`) contains **no
`search`**. `BARE_SHOW` allows "now" only *before* the verb. So the literal
words **"Search now" match nothing** and fall through to the fallback sentence.

### 2c. Defect 2 — the fixed chip ladder

`suggestChips()` (`features/hire/scout-chips.ts`) walks
`["mustHaveStack", "seniority", "salary"]`, finds the first unfilled slot, and
returns that slot's chips unprompted. `stackChips()` keys off `spec.title`
through `STACK_SUGGESTIONS`; nothing there matches "manager", so it falls back
to `DEFAULT_STACK_CHIPS` — the four engineering stacks in the screenshot.

There is a **second, independent ladder on the client**:
`components/hire/scout-chat.tsx` computes `chips` and, when the turn carried no
options, calls `looksLikeSalaryAsk(lastMsg.content) ? displaySalaryChips() :
suggestChips(spec, false)`. Between the two, effectively every turn arrives
wearing buttons.

The system prompt reinforces it: *"When you ask a question, call offer_options
with 2–4 short tap answers."*

### 2d. Defect 3 — hard filters fire on unknown data

`evaluateHardFilters()` (`features/hire/score-candidate.ts`) excludes a
candidate and zeroes their score on five conditions. Four of them trigger on
**absent** data, and on this pool most of the data is absent:

| Filter | Why it empties the board |
|---|---|
| Role family | `roleFamilyFor(member.jobRole)` returns `OTHER` for the ~80% of profiles with no job title, and `STUDENT` for a student platform's students. Neither equals a requested `MANAGER`, so both are recorded as `Role mismatch`. |
| Years | `yearsFor()` (`challenge-dossier.ts`) returns **0** both for a real fresher and for "never told us". A stated `minExperience: 10` therefore excludes everyone who left the field blank. |
| Degree | `requiresDegree` needs `dossier.education.value.level`, which `challenge-dossier.ts` and `hackathon-dossier.ts` hard-code to `null`. It excludes 100% of those tracks. |
| Availability | `needsAvailability` turns on for a work mode, a budget, a notice period or a city. Most candidates have `availability === null`, so one word ("remote") removes the pool. |

`strictExperienceBand()` compounds it: with no explicit min/max it falls back to
`SENIORITY_BAND`, so the bare word "senior" silently becomes a 5-year floor the
recruiter never stated.

`pickSearchMatches()` then returns `[]` whenever must-haves are stated and every
qualifying candidate is tier `NONE`.

### 2e. Defect 4 — the model blocks the search

`scout-graph.ts` reads `groqApiKeys()[0]` and never rotates, while
`lib/groq.ts::askGroqJson` has always fallen through `GROQ_API_KEY` → `_2` →
`_3` on 429/401. Groq's free tier is **8000 tokens per minute for the whole
organisation**; the observed turn was:

```
[scout-graph] run failed { reason: 'rate_limit', hops: 3,
  error: '429 … Limit 8000, Used 6080, Requested 6271' }
[scout-agent] turn { hops: 3, tools: 'update_brief,search_pool', ok: false }
```

Three hops: record the brief, queue the search, then a third hop that re-sends
the system prompt *and* both tool results purely to write a closing sentence the
engine already writes deterministically. That third hop is what 429s.

`GROQ_COOL_MS` is 25s while Groq's own hint says 32.6s, so the retry is
guaranteed to fail too. And on failure the agent only rescues the search when
`wantsToSeeCards(msg)` — which, per 2b, is usually false.

### 2f. Defect 5 — `get_pool_stats` contradicts the search

Found while verifying. Asked *"how many candidates do you have?"* Scout answered
*"there are no candidates available in the pool as no cohort is open to hiring
yet"* — while a search seconds earlier had reported 20.

`poolSnapshot()` (`features/hire/pool-facts.ts`) queries two sources by hand:
`buildDossierSet(memberEligibilityWhere(...))` behind `resolvePoolCohorts()`,
and `buildChallengeDossierSet()` behind `hireChallengePool()`. If both are empty
it returns `EMPTY_SNAPSHOT`. But `searchCandidates()` iterates
`enabledTracks()`, which **also includes HACKATHON** — and `loadHackathon()`
has no cohort gate. With the AI Cohort closed and `HIRE_CHALLENGE_POOL` unset,
the 20 searchable candidates are hackathon participants that the snapshot cannot
see. The file's own doc comment already promises the opposite: *"Every figure
here comes from the same code paths the real search uses."*

### 2g. Pool composition — read this before judging any result

`HIRE_CHALLENGE_POOL` is unset and the AI Cohort gate is closed, so **`/hire` is
currently searching the hackathon track only**. No change in this plan can
surface a 60-Day or Claude Challenge participant while that flag is off. If a
specific person is reported missing, establish which pool they are in *first*.

---

## 3. Files to touch

**Read this first.** The working tree already contains an unreviewed
implementation of most of this plan, written directly into `src/` rather than
handed over as a plan. Do **not** `git checkout` these paths wholesale — several
of them also carry Cursor's own in-flight edits from before that session, and a
blanket revert would destroy those too. Treat the working tree as the baseline,
review each file below against this spec, keep what matches and correct what
does not.

Files carrying that unreviewed work: `scout-agent.ts`, `scout-graph.ts`,
`scout-chips.ts`, `scout-tools.ts`, `score-candidate.ts`, `pool-facts.ts`,
`track-loaders.ts`, `types.ts`, `dossier.ts`, `challenge-dossier.ts`,
`hackathon-dossier.ts`, `scout-chat.tsx`, both `/hire` pages, `package.json`,
and the four test files. `scripts/diagnose-hire-candidate.ts` is new.

| Path | | Note |
|---|---|---|
| `src/features/hire/scout-agent.ts` | `[edit]` | Search-first decision, vendor-neutral gating, tool-payload guard. |
| `src/features/hire/scout-graph.ts` | `[edit]` | Provider switch, key rotation, early stop, read text only from an AI message. |
| `src/features/hire/scout-chips.ts` | `[edit]` | Delete the ladder; actions only. |
| `src/features/hire/scout-tools.ts` | `[edit]` | Narrow `offer_options`; trim the `update_brief` payload. |
| `src/features/hire/score-candidate.ts` | `[edit]` | Hard filters on known contradictions only; soft gaps for unknowns. |
| `src/features/hire/pool-facts.ts` | `[edit]` | `poolSnapshot` onto the track loaders. |
| `src/features/hire/types.ts` | `[edit]` | `yearsExperienceStated` / `yearsExperienceKnown`. |
| `src/features/hire/challenge-dossier.ts` | `[edit]` | Export `yearsStated()`; set the flag. |
| `src/features/hire/dossier.ts` | `[edit]` | Set the flag from `m.yearsExperience != null`. |
| `src/features/hire/hackathon-dossier.ts` | `[edit]` | Set the flag from `p.yearsExperience != null`. |
| `src/features/hire/track-loaders.ts` | `[edit]` | Pass the flag onto `ScoreableMember`. |
| `src/components/hire/scout-chat.tsx` | `[edit]` | Delete the client-side ladder. |
| `src/app/hire/page.tsx` | `[edit]` | `maxDuration`. |
| `src/app/hire/[requestId]/page.tsx` | `[edit]` | `maxDuration`. |
| `package.json` | `[edit]` | `@langchain/core` → `1.2.9`, add `@langchain/openai@1.5.11`, add `diagnose:hire`. |
| `scripts/diagnose-hire-candidate.ts` | `[new]` | Read-only per-person pool diagnostic. |
| `src/features/hire/score-candidate.test.ts` | `[edit]` | Cover the new filter rule. |
| `src/features/hire/scout-agent.test.ts` | `[edit]` | Cover search-first, rotation, vendor, JSON guard. |
| `src/features/hire/sample-card.test.ts` | `[edit]` | Chip assertions follow the ladder removal. |

No schema change. No new Server Actions. No new components.

---

## 4. Server vs Client

- `scout-agent.ts`, `scout-graph.ts`, `scout-tools.ts`, `score-candidate.ts`,
  `pool-facts.ts`, `track-loaders.ts`, all three dossier builders — **Server**,
  `import "server-only"` stays at the top of every one. A test in
  `scout-agent.test.ts` asserts no client module imports the agent, its tools or
  the graph; it must keep passing.
- `scout-chips.ts` — **shared, pure**. No `server-only`, no model, no database.
  `scout-chat.tsx` imports it today; after Step 3 it must not.
- `scout-chat.tsx` — **Client** (`"use client"`, already).
- `src/app/hire/page.tsx`, `src/app/hire/[requestId]/page.tsx` — **Server**.

No new Server→Client prop passing. The only values crossing are the existing
`ScoutTurn` fields (`spec`, `options`, `readyToSearch`, `summary`, `action`) —
all plain JSON. Do not pass a function, an icon or a class instance.

---

## 5. Steps

### Step 0 — establish the baseline (do this before any edit)

1. `git stash list` and `git status` — confirm nothing is lost.
2. `npm run test:scout && npm run test:sample && npm run test:hire-score && npm run test:visibility && npm run test:virtual`
3. `npx tsc --noEmit -p tsconfig.json`
4. `npm run build`
5. Record which of the five defects still reproduce, using the Step 9
   verification script. **If a step below is already correctly implemented in
   the working tree, leave it alone and say so.** Do not rewrite working code to
   match the prose here more literally.

### Step 1 — `score-candidate.ts`: filter on contradictions, not absence

1. Change `evaluateHardFilters` to return
   `{ ok, reasons, softReasons, missingMust }`. `reasons` keeps its meaning
   (excludes, score 0). `softReasons` is new: shown on the card as a gap, never
   excludes.
2. Add, above it:
   ```ts
   const UNSPECIFIC_ROLE = new Set<RoleFamily>(["OTHER", "STUDENT"]);
   ```
   Import `type RoleFamily` from `@/features/hire/role-family`.
3. **Role.** When `requestedRole !== "OTHER"`: if
   `UNSPECIFIC_ROLE.has(candidateRole)` push to `softReasons`
   (`` `${ROLE_FAMILY_LABEL[requestedRole]} role not declared on the profile` ``);
   else if it differs, keep the existing `reasons` push. A declared *conflicting*
   role still excludes — that behaviour is correct and a test covers it.
4. **Years.** Compute
   `const yearsStated = member.yearsExperienceKnown !== false && member.yearsExperience > 0;`
   Below the minimum: `reasons` when `yearsStated`, otherwise `softReasons`
   (`` `Years of experience not stated — ${min}+ years unverified` ``). Above the
   maximum: `reasons` only when `yearsStated`.
5. **Degree.** Move the `requiresDegree` push from `reasons` to `softReasons`,
   worded `"Degree not verified on the profile"`.
6. **Availability.** Move the `!avail && needsAvailability` push to
   `softReasons`. Leave every branch inside `if (avail)` — a *known* conflicting
   preference must still exclude.
7. In `strictExperienceBand`, delete the `SENIORITY_BAND` fallback and return
   `{ min: null, max: null }`. `SENIORITY_BAND` stays in use by
   `effectiveExperienceBand` for ranking.
8. In `scoreCandidate`, destructure `softReasons` and add it to `gaps` in **both**
   return paths — first in the list, before `Missing stack:` entries. Guard the
   existing `availabilityUnknown` gap so it does not duplicate the soft one:
   `if (availabilityUnknown && !softReasons.some((s) => s.startsWith("Availability")))`.
9. In `pickSearchMatches`, replace
   `return must.length > 0 ? [] : shown.slice(0, limit);` with
   `return shown.slice(0, limit);` — everyone in `shown` already carries every
   must-have.

### Step 2 — thread "did they actually state their experience?"

1. `types.ts`: add `yearsExperienceStated?: boolean` to `CandidateDossier` and
   `yearsExperienceKnown?: boolean` to `ScoreableMember`. Both optional, and
   **absent means "assume stated"** so hand-built test members behave as before.
2. `challenge-dossier.ts`: export
   `yearsStated(declaredYears, graduationYear, now)` — true when
   `declaredYears != null && declaredYears >= 0`, else true only when a
   graduation year is in the past. Set `yearsExperienceStated` on the dossier.
3. `dossier.ts`: `yearsExperienceStated: m.yearsExperience != null`.
4. `hackathon-dossier.ts`: `yearsExperienceStated: p.yearsExperience != null`.
5. `track-loaders.ts`: on all three `ScoreableMember` literals add
   `yearsExperienceKnown: d.yearsExperienceStated ?? false`.

### Step 3 — delete both chip ladders

1. `scout-chips.ts`: `suggestChips` keeps the `agentChips` branch verbatim, then
   `if (ready) return readyChips();`, then the `readPoolExtra` pool-source
   branch, then `return []`. Delete `stackChips`, `seniorityChips`,
   `salaryChips`, `STACK_SUGGESTIONS`, `DEFAULT_STACK_CHIPS` and the now-unused
   `isSlotFilled` / `HireSlot` / `isMonthlyContext` imports. Keep `readyChips`
   and `readOfferedChips`. Update the file header comment.
2. `scout-chat.tsx`: replace the `chips` IIFE with — agent options if present
   (plus `Show me` when `readyToSearch` and not already there); otherwise
   `readyToSearch ? [search] : []`. Delete `looksLikeSalaryAsk`,
   `displaySalaryChips` and the `suggestChips` import.
3. Leave the `OPENING` message's five role chips. That is an empty state before
   the recruiter has typed anything, not a mid-conversation form.

### Step 4 — `scout-tools.ts`: narrow the buttons, shrink the payload

1. Rewrite the `offer_options` tool description to: rarely needed; only for a
   genuinely closed set of 2–4 choices you cannot proceed without; never for a
   role, a stack or a budget — ask those in words. Keep the reserved-prefix
   rejection exactly as it is.
2. In `applyUpdateBrief`'s return: drop `canSearchNow` (it duplicated
   `readyToSearch`), emit `rejected` only when non-empty, and emit
   `stillMissing` only when the brief is **not** searchable. Every field here is
   re-sent to the model on every remaining hop, so keep it minimal.

### Step 5 — `scout-agent.ts`: search-first

1. Add `search` and `dhundo` to the `SEE` verb list. Extend `BARE_SHOW` to
   accept `search|find|go|start` and a *trailing* `now`/`it`, so **"Search now"**,
   "search", "go" all match.
2. Add `looksLikeQuestion(msg)` — true when the message ends in `?` or opens
   with a question word (`who|what|which|when|where|why|how|can|could|do|does|
   did|is|are|was|were|should|would|will|any|kya|kaun|kitne|kitna|kaise`).
3. Add `briefMoved(before, after)` — JSON-compares `title`, `seniority`,
   `mustHaveStack`, `niceToHaveStack`, `minExperience`, `maxExperience`,
   `salaryMin`, `salaryMax`, `workMode`, `employmentType`, `locationCity`,
   `noticePeriodDays`, `requiresDegree`, `evidencePriority`, plus
   `readPoolExtra(spec)`.
4. Add `shouldSearchNow(msg, before, after, blockedByLimits)`:
   ```
   blockedByLimits            → false
   !searchable(after)         → false
   wantsCandidates || wantsToSeeCards → true
   looksLikeQuestion          → false
   otherwise                  → briefMoved(before, after)
   ```
5. Hoist `const limits = blocked.filter((f) => f.id !== "protected_attribute")`
   to just after `findUnsupported(msg)`, so the search decision can see it.
6. Add a `noteSearch(spec, degraded)` helper returning `searchNow(spec)` with
   `briefDelta` prefixed when non-empty.
7. Call `shouldSearchNow` at **three** decision points: the cooling / no-model
   early return, the `!run.ok` failure return, and the final
   `const action = ctx.action ?? (…)`.
8. Keep the model's sentence when the engine forces a search: prefix
   `"Searching the verified pool now."` only when the model's own text does not
   already mention searching. Do not discard the follow-up question — it is the
   "ask me more if you need clarity" half of the goal, and it belongs above the
   cards.
9. Prompt edits, both small: replace *"Record everything they stated before you
   ask for anything missing"* with a search-first instruction (record, then
   search; refine with results on screen); replace *"When you ask a question,
   call offer_options"* with ask-in-plain-words, `offer_options` only for a
   closed set.

### Step 6 — `scout-graph.ts`: never let the model block a search

1. **Provider switch.** Add `resolveVendor(): "openai" | "groq" | null` —
   `HIRE_AGENT_PROVIDER` forces one (and returns `null` if that vendor has no
   key); unset prefers OpenAI, then Groq. Mirror the shape of
   `resolveInterviewLLM` in `features/interview/agent/llm/registry.ts`.
2. `scoutModel(tools, vendor, apiKey)` returns `ChatOpenAI` (model
   `HIRE_AGENT_MODEL ?? "gpt-4.1-mini"`, `temperature: 0.2`, `maxTokens: 800`,
   no `reasoningEffort`) or the existing `ChatGroq` unchanged.
   **`gpt-4.1-mini`, not `gpt-4o`** — OpenAI meters per model, so Scout must not
   draw from the bucket a graded interview needs. Same reasoning as
   `lib/chatbot/providers.ts:101`.
3. **Key rotation.** Add `rotatable(error)` — true for 429/401, false for
   `AbortError` and anything else. In the `agent` node, loop the vendor's keys
   and retry the hop on a rotatable error. On OpenAI the list is one long and the
   loop is a no-op.
4. **Early stop.** `buildScoutGraph(system, tools, done?)` and
   `runScoutGraph({ …, done })`. Replace `.addEdge("tools", "agent")` with a
   conditional edge returning `END` when `done?.()` is true. `scout-agent.ts`
   passes `() => ctx.action === "search"`.
5. **Read text only from an assistant turn.** After `graph.invoke`, guard with
   `last?.getType() === "ai"`. **This is not optional and it is not cosmetic:**
   a `ToolMessage`'s `content` is also a string, so with the early stop in place
   the naive read sends the recruiter the raw `search_pool` JSON — internal
   instructions and all. It was observed live.
6. In `scout-agent.ts`, add `looksLikeToolPayload(text)` (starts with `{`/`[`
   *and* `JSON.parse`s to an object) as a second line of defence; blank the text
   and `logger.error` when it hits.
7. Raise the cooldown from 25s to **35s** — Groq's own hint is 32.6s, so 25
   guaranteed a second 429. Rename `markGroqCooling`/`groqIsCooling` to
   `markCooling`/`isCooling`.
8. **Replace `!process.env.GROQ_API_KEY` with `resolveVendor() == null`.** As
   written, that check silently disables the entire agent on an OpenAI-only
   deployment.
9. Remove the vendor's name from every recruiter-facing string ("That was Groq
   hitting its rate limit" → "my assistant").

### Step 7 — deadline and function budget

1. `DEADLINE_MS` becomes `deadlineMs()`: `11_000` on OpenAI, `6_500` on Groq.
   Groq answers a hop in under a second; `gpt-4.1-mini` takes ~1.5–2s, and a
   two-hop turn does not fit in 6.5s.
2. Add `export const maxDuration = 60;` to both `/hire` pages. Server Actions
   inherit the route's budget, and Vercel's 10s default would cut a search off
   mid-flight and return a 504 instead of cards.
3. `package.json`: `@langchain/core` `1.2.8` → `1.2.9` (required by
   `@langchain/openai`; `@langchain/groq` peers `^1.1.30` and
   `@langchain/langgraph` peers `^1.1.48`, so both accept it), add
   `@langchain/openai@1.5.11`, add
   `"diagnose:hire": "NODE_OPTIONS=--conditions=react-server tsx scripts/diagnose-hire-candidate.ts"`.

### Step 8 — `poolSnapshot` onto the track loaders

Rewrite the body of `poolSnapshot()` to call
`loadTrack(t.slug, { minEvidenceDays: 0, limit: 600 })` for every
`enabledTracks()` entry and merge with `mergeTrackLoads` — the exact path
`searchCandidates` uses. Aggregate skills, working languages, role families and
experience bands off `ScoreableMember` (`m.skills`,
`m.dossier?.evidence.workingLanguages.value`,
`m.dossier?.roleFamily.value ?? roleFamilyFor(m.jobRole)`). Add a **"not stated"**
experience band for `yearsExperienceKnown === false` — counting an unstated
figure as "0–1 yrs" tells a recruiter the pool is junior when the truth is that
nobody said. `coverageNote` comes from `merged.coverage.note`; `cohortNames`
from the individual loads. Keep the 60s memo cache and the `EMPTY_SNAPSHOT`
early return. Drop the now-unused `buildDossierSet` / `buildChallengeDossierSet`
/ `resolvePoolCohorts` / `memberEligibilityWhere` / `clearsEvidenceFloor` /
`hireChallengePool` imports.

### Step 9 — the diagnostic script

`scripts/diagnose-hire-candidate.ts`, read-only, one Prisma client, takes an
email. Prints, in this order: the flags (`HIRE_CHALLENGE_POOL`,
`HIRE_OPEN_COHORT_IDS`, resolved `enabledTracks()`), the user, the
`StudentProfile` (flagging a null `yearsExperience` or blank `role`), the
`CandidateVisibility` row (`searchableByRecruiters`, `withdrawnAt`), program
memberships, challenge enrolments with per-domain reachability, and a verdict
separating *"not in any pool /hire searches"* from *"in the pool — this is a
scoring question"*. It must write nothing.

---

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** `git checkout` or `git restore` any file in section 3. They carry
  both the unreviewed implementation *and* earlier in-flight Cursor work; a
  blanket revert destroys the second.
- **DO NOT** remove `import "server-only"` from any file in
  `src/features/hire/`. The evals reach these executors through
  `--conditions=react-server`; testability already works without weakening the
  fence.
- **DO NOT** let `scout-chat.tsx` (or any `"use client"` module) import
  `scout-agent`, `scout-tools`, `scout-graph` or `track-loaders`. A test asserts
  this.
- **DO NOT** touch `middleware.ts` or anything it imports. Nothing in this plan
  goes near the edge bundle.
- **DO NOT** loosen the `protected_attribute` gate in `capabilities.ts`. It runs
  before the model and must stay the entire reply.
- **DO NOT** make `openToWork` a discovery gate. `searchableByRecruiters = true`
  with `openToWork = false` is a normal state; a test pins this.
- **DO NOT** widen `evaluateHardFilters` into "never exclude anyone". A
  *declared, conflicting* role, a *stated* out-of-range experience, and a
  *known* conflicting availability must all still exclude. The rule is
  "contradiction excludes, absence does not".
- **DO NOT** create a new abstraction file, a provider-registry module, or a
  `hire/llm/` folder. The vendor switch is two functions in `scout-graph.ts`.
- **DO NOT** default Scout to `gpt-4o`. See Step 6.2.
- **DO NOT** put `gpt-4.1-mini` or any key in a client module or a
  `NEXT_PUBLIC_*` var.
- **DO NOT** change `RECURSION_LIMIT`, the `AbortSignal`, or add a LangGraph
  checkpointer. Conversation state lives in Postgres.
- **DO NOT** relax the `isGrounded` figure guard to make a reply pass. If a
  correct reply is being binned, widen the *allowed* set, never the check.
- **DO NOT** re-add either chip ladder "just for the salary question".
- **DO NOT** change `prisma/schema.prisma`, add a migration, or run any
  `db:seed` / `db:cleanup` / `db:migrate` command. This plan has no schema
  change.
- **DO NOT** report done on a green build alone. Both the JSON leak and the
  `get_pool_stats` contradiction passed typecheck, lint, build and 150 tests.
  Section 8's browser pass is mandatory.

---

## 7. DB safety

Not applicable — no schema change, no migration, no seed, no backfill. The only
new database access is `scripts/diagnose-hire-candidate.ts`, which is read-only.

Note for whoever runs it: `.env.local`'s `DATABASE_URL` points at production.
The script only issues selects, but do not extend it with writes.

---

## 8. Verification

### Automated (necessary, not sufficient)

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint src/features/hire/ src/components/hire/ src/app/hire/ scripts/diagnose-hire-candidate.ts
npm run test:hire-score
npm run test:scout
npm run test:sample
npm run test:visibility
npm run test:virtual
npm run build
```

`scout-chat.tsx` has 8 pre-existing `react-hooks/refs` lint errors around
`stripItemsRef`. They are not from this plan; do not fix them here and do not
let them mask a new one.

New cases to add:

- `score-candidate.test.ts` — blank role is a gap not an exclusion; a student is
  not a conflicting profession; `yearsExperienceKnown: false` against
  `minExperience: 10` does not exclude; seniority alone is not a floor;
  `requiresDegree` is a gap; unknown availability is a gap; a **known**
  conflicting work mode still excludes; the existing "Data Analyst vs Backend"
  exclusion still passes.
- `scout-agent.test.ts` — a stated requirement searches; `"Search now"` /
  `"search"` / `"go"` are recognised; a question, a partly-refused request and an
  empty brief do not search; `briefMoved` sees experience and budget;
  `rotatable` is true for 429/401 and false for `AbortError`; `resolveVendor`
  prefers OpenAI, honours a forced vendor, and returns `null` with no key;
  `looksLikeToolPayload` catches a `search_pool` payload and passes a sentence.
- `sample-card.test.ts` — an unfinished brief offers **no** chips; a ready brief
  offers actions only.

### Manual — required, in a browser

`preview_start` the `abtalks-plain-dev` config, open `/hire` as a **guest** (no
sign-in: the guest path writes nothing). Guest sessions persist in
localStorage — click **New search** before each case.

| # | Type this | Must happen |
|---|---|---|
| 1 | `senior manager with more than 10 years of experience` | Searches on that turn. No follow-up question standing in for cards. **Non-zero** matches. No chip ladder. **No JSON anywhere in the transcript.** |
| 2 | (after 1) inspect a card | Gaps read `Management role not declared on the profile` and `Years of experience not stated — 10+ years unverified`. |
| 3 | `how many candidates do you have?` | Does **not** search. Answers in prose. The number **equals** case 1's "Searched N opted-in candidate(s)". |
| 4 | `who is the prime minister of india` | Refuses as out of scope. No search, no filter applied. |
| 5 | `backend engineer` then `Search now` | The second message searches. Never "tap Show me". |
| 6 | `python developers only from IIT` | Captures python, refuses the college filter in words, still searches. |

Check `preview_logs` for the `[scout-agent] turn` line on cases 1 and 3:
`hops` should be **2** on a search turn (3 means the early stop is not wired),
`ok: true`, `action: 'search'` then `'none'`. No `[scout-graph] run failed`.

Finally, run the diagnostic and act on the pool composition it reports:

```bash
npm run diagnose:hire -- ayushgoelar@gmail.com
```

### Files that should have changed

Exactly the 19 in section 3, plus `package-lock.json`. Nothing under
`prisma/`, `src/middleware.ts`, `src/auth*.ts`, `src/repositories/` or
`src/components/ui/`.

---

## 9. Commit message

```
fix(hire): Scout searches on a stated requirement and matches on real evidence

A recruiter who stated "senior manager with 10 years of experience" was asked a
question, offered four backend-stack buttons, and then shown zero candidates.
Five separate defects, all visible in that one exchange.

- Search-first: a message that moves the brief IS the request. shouldSearchNow()
  decides it in the engine, so the model can no longer keep interviewing a
  recruiter who has already said what they want. "Search now" is recognised at
  last — the see-cards verb list had no "search" in it.
- Hard filters fire on contradictions, never on absence. Role, years, degree and
  availability are blank on most of this pool; excluding on a blank field is
  what returned zero. Unknowns are now gaps printed on the card.
- Both chip ladders are gone — the server slot ladder and a second one in
  scout-chat. Buttons appear only when Scout deliberately offers a closed set.
- The model can no longer block a search: every configured key is tried, the
  loop stops once the search is queued (three hops became two), and an OpenAI
  provider switch removes the 8000-TPM free-tier ceiling entirely.
- get_pool_stats agreed with nothing. poolSnapshot queried two sources by hand
  while the search walked the track registry, so it reported an empty pool while
  a search returned nineteen. It now uses the search's own loaders.

Also: read the closing text only from an assistant turn — with the early stop in
place a ToolMessage was last, and its content is a string, so the raw search_pool
payload reached a recruiter.

No schema change. ENABLE_NEW_* untouched; legacy tables stay authoritative.
```
