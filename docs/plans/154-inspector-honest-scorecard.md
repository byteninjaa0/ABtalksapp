# 154 — Candidate inspector: honest per-dimension scorecard, Evidence moved up

> Base commit: `bb8290ef` (master, 2026-09-23). Branch: `hire-side-fixes`.
> **Cross-module (not yet approved):** the candidate review panel is
> **Shashank's** module and the layout/flow is **Shallika's**. The inspector's
> Overview section also contains the paid contact unlock (Zainab's). Get sign-off
> from Shashank and Shallika before step 1. Nothing in this plan touches
> scoring, data, auth or the unlock logic.
>
> This is PR 1 of the inspector rethink. PR 2 (full-screen drawer versus a wider
> side panel) is out of scope and waits for a design decision from Shallika.

## 1. Goal
Replace the "Candidate parameters" donut, where each slice is that score's
share of the candidate's total and not the score itself, with one 0–100 bar
per dimension. Each bar gets a plain-English line saying what the number
measures and whether it comes from ABTalks records or from the candidate's
own profile. Move that scorecard and the ABTalks Evidence section up so they
come right after the Overview facts, instead of sitting at the bottom of the
panel under "More".

## 2. Current behavior
- `src/components/hire/hire-score-chart.tsx` (client component) draws an SVG
  donut. Each slice's sweep is `360 * value / sum(known values)`, so a
  candidate with seven 90s and one with seven 30s get the same pie. It has an
  IntersectionObserver entry animation, an "OUT OF 100" hub showing `total`,
  and a legend listing `value/100` or "Not scored".
- Its only call site is `candidate-inspector.tsx:1187-1197`, inside the
  `data-section="more"` section (the last one in the panel), under the heading
  "Candidate parameters". It is followed by a note that has to explain how the
  slices work.
- The inspector is one scroll with a scroll-spy tab strip. `TABS`
  (`candidate-inspector.tsx:83-91`) is ordered Overview, Experience,
  ABTalks Evidence, Education, Skills, Resume, More, and the `<section
  data-section>` blocks follow the same order. The scroll-spy
  (`:463-505`) picks the active tab from the DOM order of `[data-section]`, so
  **the tab order and the section order must stay the same**.
- Overview (`:790-940`) holds Status, AB score + tier, Email/Phone with the
  paid `UnlockContactDialog`, Message, and Tags. It stays first. Moving it
  would push the unlock and status controls down the page.
- Where the scores come from (`src/features/hire/score-candidate.ts`), all
  0–100 and all **relative to the recruiter's current search**:
  | key | formula (source line) | source |
  |---|---|---|
  | `stack` | must-have hits ×0.75 + nice-to-have hits ×0.25; no skills asked → role fit or 0.5 (`:320`) | candidate's declared skills |
  | `missions` | missions passed ÷ missions available so far in the cohort (`:350`) | ABTalks records |
  | `cleanPass` | first-run passes ÷ missions passed (`:360`) | ABTalks records |
  | `projects` | 0.6 × mean + 0.4 × best project score (`:365`) | ABTalks records |
  | `consistency` | GitHub commit days ÷ days elapsed, capped at 30 (`:374`) | ABTalks records |
  | `interview` | mean of the comm/tech/problem/overall mock-interview scores (`:382`) | ABTalks records |
  | `experience` | fit of years of experience to the search's range; no range → 70 (`:393`) | declared |
- `null` means the **candidate pool** has no evidence for that dimension
  (`score-candidate.ts:661-663`, `computeCoverage` in `dossier.ts`). `0` means
  the pool has evidence but this candidate has none, for example not interviewed yet.
- `pickPublicScores` (`to-public-match.ts:39`) removes the weights on
  purpose. This plan keeps it that way: **do not show weights**.
- `match.score` is the search-match total and `match.tier` is shown as
  "Recommended"/"Partial" in the Overview "AB score" row (`:294-800`). Neither
  is a percentile, and no percentile exists anywhere in `features/hire`.

## 3. Files to touch
- `src/components/hire/hire-score-chart.tsx` [edit]: rewrite the body to
  render a list of labelled bars. Drop the SVG, the animation hooks and the
  `total` prop.
- `src/components/hire/candidate-inspector.tsx` [edit]: reorder `TABS` and
  move the Evidence `<section>` up. Move the scorecard group from "More" into
  Evidence. Update the call site.
- `src/app/hire/hire-scout.css` [edit]: delete the `.hire-pie*` rules and
  their reduced-motion and media-query mentions. Add `.hire-scorecard*` rules.

No other files. No new files.

## 4. Server vs Client
- `candidate-inspector.tsx`: **Client** (unchanged).
- `hire-score-chart.tsx`: remove `"use client"` and every hook. It becomes a
  hook-free presentational component. Its only importer is a client
  component, so it still renders on the client. Removing the directive only
  stops it from being a client boundary of its own.
- Props passed: `scores: PublicScoreSlice` (a plain object of numbers or
  nulls), client to client. No functions, icons or class instances cross a
  Server→Client boundary.

## 5. Steps

### 5.1 `hire-score-chart.tsx`: rewrite
1. Delete `"use client"`, the `useEffect/useRef/useState/CSSProperties`
   import, `SIZE/CX/CY/R_*/EXPLODE/ROUND`, `polar`, `ringPath`, the observer
   effect, `formed` state and all SVG markup.
2. Keep `import type { PublicScoreSlice } from "@/components/hire/match-card";`.
3. Replace `PARAMS` with this exact list and copy (order = weight order):
   ```ts
   const PARAMS: {
     key: keyof PublicScoreSlice;
     label: string;
     source: "ABTalks record" | "Declared";
     means: string;
   }[] = [
     { key: "stack", label: "Stack match", source: "Declared",
       means: "Skills on their profile against the must-have and nice-to-have skills in this search." },
     { key: "missions", label: "Missions", source: "ABTalks record",
       means: "Coding missions passed, out of the missions available so far in their cohort." },
     { key: "cleanPass", label: "First-attempt pass", source: "ABTalks record",
       means: "Share of passed missions that passed the automated check on the first run." },
     { key: "projects", label: "Projects", source: "ABTalks record",
       means: "Reviewer scores on cohort projects, weighted toward their best one." },
     { key: "consistency", label: "Commit consistency", source: "ABTalks record",
       means: "Days with a GitHub commit, out of the days elapsed in their cohort (last 30 at most)." },
     { key: "interview", label: "Mock interview", source: "ABTalks record",
       means: "Average of their mock-interview scores for communication, technical, problem solving and overall." },
     { key: "experience", label: "Experience", source: "Declared",
       means: "How their years of experience fit the range in this search." },
   ];
   ```
4. Add a local (not exported) band function. **Plain score bands only, with no
   comparative words** ("top", "exceptional", "percentile"):
   ```ts
   function band(value: number | null, source: string) {
     if (value === null) return { label: "Not scored", tone: "none" } as const;
     if (value === 0)
       return {
         label: source === "Declared" ? "No match" : "None on record",
         tone: "low",
       } as const;
     if (value >= 80) return { label: "Strong", tone: "high" } as const;
     if (value >= 50) return { label: "Moderate", tone: "mid" } as const;
     return { label: "Low", tone: "low" } as const;
   }
   ```
5. New signature: `export function HireScoreChart({ scores }: { scores:
   PublicScoreSlice })`. Keep the export name so there is one fewer rename.
6. Keep the empty state exactly as it is (all null → the existing
   `<p className="hire-detail__p">` sentence).
7. Render:
   ```tsx
   <ul className="hire-scorecard" aria-label="Candidate scores for this search, out of 100">
     {PARAMS.map((p) => {
       const value = scores[p.key];
       const b = band(value, p.source);
       return (
         <li key={p.key} className="hire-scorecard__row" data-tone={b.tone}>
           <div className="hire-scorecard__head">
             <span className="hire-scorecard__label">{p.label}</span>
             <span className="hire-scorecard__source">{p.source}</span>
             <span className="hire-scorecard__value">
               {value === null ? "Not scored" : <><b>{value}</b>/100 · {b.label}</>}
             </span>
           </div>
           {value !== null && (
             <div className="hire-scorecard__track" aria-hidden="true">
               <span className="hire-scorecard__fill" style={{ width: `${value}%` }} />
             </div>
           )}
           <p className="hire-scorecard__means">{p.means}</p>
         </li>
       );
     })}
   </ul>
   ```
   A `null` row shows no track. Never draw a null as 0. The text is the
   accessible value. The bar is `aria-hidden`.
8. Update the doc comment above the component: "One bar per ranking
   dimension, each on its own 0–100 scale. Null = the pool has no evidence
   for it; 0 = this candidate has none."

### 5.2 `candidate-inspector.tsx`: reorder and move
1. `TABS` becomes: Overview, **ABTalks Evidence**, Experience, Education,
   Skills, Resume, More. Leave the default `useState<TabId>("overview")` as it is
   (Overview stays at the top of the scroll).
2. Cut the whole `<section data-section="evidence" …>…</section>` block
   (`:1002-1049`) and paste it directly after the Overview section's closing
   `</section>` (`:940`), before `data-section="experience"`. Don't change
   anything inside it except the addition in the next step.
3. Inside the moved Evidence section, after the `hire-profile__org-block`
   `</div>`, paste the scorecard group, which is being removed from "More"
   (`:1187-1197`), with these changes:
   - heading text: `How they score for this search`
   - call: `<HireScoreChart scores={match.scores} />` (no `total`)
   - keep the guard `{!sample && match.scores && (…)}`
   - replace the note with: `Each bar is its own score out of 100, calculated
     against this search. "ABTalks record" rows come from work verified on the
     platform; "Declared" rows come from the candidate's profile. Indicative,
     not a validated psychometric measure.`
4. Delete the old "Candidate parameters" group from the "More" section. Leave
   everything else in "More" (AI summary, coverage lede, credentials) as it is.
5. Change nothing in the Overview (status, AB score row, contact/unlock, tags),
   the header, Prev/Next, pipeline or shortlist.

### 5.3 `hire-scout.css`
1. Delete every `.hire-pie` rule: the block starting at `:3885` (comment and
   `.hire-pie` through `.hire-pie__value.is-empty` and `@keyframes
   hire-pie-hub`), the `.hire-pie__*` selectors in the reduced-motion list
   (`:4268-4272`, leaving the other selectors in that list intact), the
   `.hire-pie__svg` override at `:4316`, and the `max-width: 520px` block at
   `:5332-5339`. Run `grep -n "hire-pie" src/app/hire/hire-scout.css` afterwards; it must return nothing.
2. Add after where the deleted block was, using existing tokens only (no new
   hex values, so dark mode, which overrides the `--h-*` tokens, just works):
   ```css
   .hire-scorecard { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
   .hire-scorecard__head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
   .hire-scorecard__label { font-weight: 600; color: var(--h-ink); }
   .hire-scorecard__source { font-size: 11px; padding: 1px 6px; border-radius: 999px;
     background: var(--h-pill); color: var(--h-pill-ink); }
   .hire-scorecard__value { margin-left: auto; font-size: 13px; color: var(--h-gray-700); }
   .hire-scorecard__value b { color: var(--h-ink); font-variant-numeric: tabular-nums; }
   .hire-scorecard__track { height: 6px; margin-top: 6px; border-radius: 999px;
     background: var(--h-gray-100); overflow: hidden; }
   .hire-scorecard__fill { display: block; height: 100%; border-radius: inherit;
     background: var(--h-gray-500); }
   .hire-scorecard__row[data-tone="high"] .hire-scorecard__fill { background: var(--h-primary); }
   .hire-scorecard__row[data-tone="mid"]  .hire-scorecard__fill { background: var(--h-warn-ink); }
   .hire-scorecard__means { margin: 4px 0 0; font-size: 12px; line-height: 1.45; color: var(--h-gray-600); }
   .hire-scorecard__row[data-tone="none"] .hire-scorecard__value { color: var(--h-gray-500); }
   ```
   Don't use red for low scores. A low score here is a fact about fit for this
   search, not a warning about the person. Don't add animation.

## 6. Guardrails for Cursor (DO NOT)
- DO NOT touch `score-candidate.ts`, `to-public-match.ts`, `dossier.ts` or any
  scoring or data code. This is a display-only change.
- DO NOT expose weights, a percentile, "Top N%", "Exceptional", "Top tier" or any
  word that compares the candidate with others. No such data exists.
- DO NOT relabel `match.score` as a "competence" or "composite" score, and do not
  repeat the total inside the scorecard. It already appears in the Overview "AB
  score" row.
- DO NOT render a `null` dimension as a 0-width bar or as "0".
- DO NOT touch the Overview section, `UnlockContactDialog`, `revealContactAction`,
  the header, Prev/Next, `PanelResizer`, `AddToPipelineButton`, or the scroll-spy
  and `jump()` logic.
- DO NOT let the `TABS` order and the `data-section` DOM order differ.
- DO NOT build the full-screen drawer, backdrop or arrow-key navigation (that's PR 2).
- DO NOT add a radar or polar chart, a chart library or new files.
- DO NOT modify `src/components/ui/*`.
- No `any`. No `console.*`.

## 7. DB safety
Not applicable. No schema, data or migration changes.

## 8. Verification
**Automated (all must pass):**
```bash
npx tsc --noEmit
```
```bash
npm run lint
```
```bash
npm run test:hire-score
```
```bash
npm run test:review-panel
```
```bash
npm run build
```
`test:hire-score` and `test:review-panel` don't cover this UI directly. They
confirm the scoring and review-panel contracts the inspector reads are
unchanged.

**Manual (`npm run dev`, recruiter test account):**
1. `/hire`: run a Scout search with must-have skills and open a candidate.
   The tab strip reads Overview · ABTalks Evidence · Experience · Education ·
   Skills · Resume · More.
2. Scroll slowly. The active tab follows the sections in order with no jumps.
   Click each tab and check that it lands on the right section.
3. The Evidence section shows "Verified work on ABTalks" and then "How they score
   for this search", with 7 rows. Each row has a label, a Declared or ABTalks
   record chip, `N/100 · band`, a bar (except "Not scored") and one line of explanation.
4. Find a candidate with interview "Not scored" (any challenge-track or early
   cohort pool). There's no bar, and the row reads "Not scored".
5. Change the search's must-have skills and reopen the same candidate. The
   Stack match value changes, which confirms the "for this search" wording.
6. "More" no longer has the donut or the "Candidate parameters" heading. The AI
   summary and credentials are still there.
7. `/hire/jobs`: open an applicant in the applicants desk and repeat steps 1 and 3.
8. Sample card (a search with no matches): no scorecard, no Resume tab, no errors.
9. Overview is unchanged. Reveal email opens the unlock dialog (cancel it; don't
   spend a credit). Shortlist, Add to pipeline and Prev/Next still work.
10. Dark theme and a narrow panel (drag `PanelResizer` to its minimum, and
    375px mobile): rows wrap cleanly and there's no horizontal scroll.
11. Reduced motion on: nothing animates (there's no animation now anyway).

**Files that should have changed: exactly these three.**
```
src/components/hire/hire-score-chart.tsx
src/components/hire/candidate-inspector.tsx
src/app/hire/hire-scout.css
```

## 9. Commit message
```
feat(hire): honest per-dimension scorecard in candidate inspector

Replace the "Candidate parameters" donut, whose slices showed each score's
share of the total rather than the score, with one 0-100 bar per dimension.
Each row labels its source (ABTalks record vs declared) and says in plain
English what it measures for this search. Move ABTalks Evidence and the
scorecard up to directly after Overview; tab order follows.

Display-only: no scoring, data or unlock changes.
```
