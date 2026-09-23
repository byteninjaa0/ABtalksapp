# 155 — Scout results: land on #1, and make the ranking readable

> Base commit: `bb8290ef` (master, 2026-09-23). Branch: `hire-side-fixes`.
> **Cross-module (not yet approved):** Scout search UI and result cards sit
> under **Sohail** (candidate search), **Shashank** (candidate review) and
> **Shallika** (UI). Get sign-off before step 1.
> **This plan does not change the ranking algorithm.** That belongs to Sohail
> (search ranking) and needs a concrete bad example first. See §2c.

## 1. Goal
1. After a search, the results open at the top on the #1 candidate, instead of
   scrolled to the bottom on the lowest-ranked one.
2. Make the order explain itself on the result list: show each card's score and
   tier, and label the tier groups, so a 72 above an 88 has a visible reason.

## 2. Current behavior

### 2a. Why results open at the bottom
- The list order is correct. The server returns tier-first, score-desc
  (`rankCandidates`, `score-candidate.ts:805`; saved projects use the same
  `orderBy` in `load-request-matches.ts:83` and the session order in
  `scopeToSession`). `match-results.tsx:118` renders in that order with no sort
  or reverse, and there's no `column-reverse` on the list.
- The cause is `scout-chat.tsx:720-736`. A chat-style effect scrolls
  `.chat-output` to `scrollHeight` whenever `messages.length`, `pending`,
  `searched`, `deskMatches.length`, `resultsPin` or `detailsOpen` change.
- Once `searched` is true, `.chat-output` shows only the filter bar and the
  results (`:1635-1751`), with no chat messages under them. "Scroll to the latest
  message" therefore becomes "scroll to the last card". That happens on every
  new search, every re-run, and on page load of a saved project.
- Before a search (the chat/brief stage), scrolling to the bottom is correct and
  must stay.

### 2b. Why the ranking looks wrong
- Order is **tier first, then score** (STRONG → PARTIAL → NONE). This is
  deliberate (QA-KI-008, comment at `score-candidate.ts:793-800`). A profile with
  only typed skills gets its evidence weights dropped and can score 85, while
  a cohort graduate with 22 passed missions scores 81. STRONG requires
  proven work (`tierFor`, `:406-430`), so the graduate is listed first.
- **The Scout result card (`desk-match-card.tsx`) shows neither the score nor
  the tier.** The only ranking cue is a "Top match" badge on #1 (`:400`). The
  recruiter sees the numbers only by opening each candidate (inspector Overview:
  "AB score 72/100 · Recommended"). So when they open #3 and see 88, then #1
  and see 72, the order looks random, because the rule behind it is never
  shown.
- "Top match" goes on #1 even when #1 is only PARTIAL.
- Tier NONE candidates appear only as padding when fewer than 5 STRONG or
  PARTIAL candidates exist (`pickSearchMatches`, `:840-846`). Nothing tells the
  recruiter that.

### 2c. Not in this plan: the ranking algorithm itself
If, after 2b is fixed, a specific search still ranks someone clearly worse
above someone clearly better, that's a scoring change for Sohail. Capture
the search spec and the two candidate refs, then run
`npm run test:recruiter-search` (the search-QA probe that uses the same
`selectSearchResults`) to reproduce it before proposing any weight change.

## 3. Files to touch
- `src/components/hire/scout-chat.tsx` [edit]: once results are showing, the
  scroll effect goes to the top of the results when the result set changes, and
  stops forcing the bottom.
- `src/components/hire/desk-match-card.tsx` [edit]: show `score/100` and the
  tier label. Show "Top match" only on a STRONG #1.
- `src/components/hire/match-results.tsx` [edit]: in desk mode, split the list
  into labelled tier groups. Rank numbers continue across groups.
- `src/app/hire/hire-scout.css` [edit]: styles for the score chip and the group
  headings.

No new files. No server, action, scoring or DB changes.

## 4. Server vs Client
- `scout-chat.tsx`: **Client** (unchanged).
- `match-results.tsx`: **Client** (unchanged; it holds `useState`).
- `desk-match-card.tsx`: **Client** (unchanged).
- Nothing new crosses a Server→Client boundary. `tier` and `score` are already
  on `MatchCardData` (`match-card.tsx:72-73`).

## 5. Steps

### 5.1 `scout-chat.tsx`: open results at the top
1. Just above the effect at `:720`, add:
   ```ts
   // The result set's identity: which search, and who is in it. Triage and
   // "Hide rejected" don't change it, so deciding on a card never moves the page.
   const resultsKey = searched
     ? `${sessionId ?? activeSearchId ?? ""}|${deskMatches.map((m) => m.candidateRef).join(",")}`
     : null;
   const shownResultsKey = useRef<string | null>(null);
   ```
   (`sessionId` is declared at `:349`, `activeSearchId` at `:366` and
   `deskMatches` at `:588`, all above `:720`, so they're in scope.)
2. Replace the effect body at `:720-736` with:
   ```ts
   useEffect(() => {
     const root = scrollRef.current;
     if (!root) return;
     // Results: a list read top-down. Open a NEW result set at #1; leave
     // every other re-render alone so closing the inspector can restore the
     // recruiter's place (closeMatchPanel).
     if (resultsKey !== null) {
       if (resultsKey === shownResultsKey.current) return;
       const frame = window.requestAnimationFrame(() => {
         shownResultsKey.current = resultsKey;
         root.scrollTo({ top: 0, behavior: "auto" });
       });
       return () => window.cancelAnimationFrame(frame);
     }
     // Brief stage: ChatGPT-style, always land on the latest turn.
     shownResultsKey.current = null;
     const frame = window.requestAnimationFrame(() => {
       root.scrollTo({
         top: root.scrollHeight,
         behavior: pending ? "auto" : "smooth",
       });
     });
     return () => window.cancelAnimationFrame(frame);
   }, [messages.length, pending, resultsKey, resultsPin, detailsOpen]);
   ```
   `searched` and `deskMatches.length` leave the deps because `resultsKey`
   covers both. Keep the comment above the effect, but add one line: "…until
   results show; then a new result set opens at the top."
3. Change nothing else in the file: `openMatchPanel` / `closeMatchPanel`,
   the `savedScroll` restore, the tick-strip `scrollIntoView` at `:1170`, and
   the search actions all stay as they are.

### 5.2 `desk-match-card.tsx`: show the score and tier
1. Near the other derived values at the top of `DeskMatchCard`, add:
   ```ts
   const tierLabel =
     match.tier === "STRONG" ? "Recommended"
     : match.tier === "PARTIAL" ? "Partial match"
     : null;
   ```
   These are the same words the inspector uses for STRONG. "Partial match"
   reads better on a card than the inspector's bare "Partial".
2. In `.desk-card__header` (`:388-401`), after `<OpenToWorkBadge …/>`:
   - change the badge to `{rank === 1 && match.tier === "STRONG" && <span className="desk-card__badge">Top match</span>}`
   - add, guarded so sample cards never show a score:
     ```tsx
     {!sample && !match.isVirtual && (
       <span className="desk-card__score" data-tier={match.tier}>
         <b>{match.score}</b>/100{tierLabel ? ` · ${tierLabel}` : ""}
       </span>
     )}
     ```
   Sample cards DO render through `DeskMatchCard` (`match-results.tsx:94-101`,
   the "What a match would look like" list). `sample` already exists at
   `desk-match-card.tsx:197` (`candidateRef.startsWith("SAMPLE:")`), and
   `isVirtual` is on `MatchCardData` (`match-card.tsx:53`). A sample's
   numbers come from the recruiter's requirement, not from a candidate, so
   showing them as a score would be false. The "Top match" badge needs no
   guard because samples get no `rank`.
3. Don't touch triage, shortlist, cart or the "Request an intro" comment block.

### 5.3 `match-results.tsx`: labelled tier groups (desk mode only)
1. In the `desk` branch only, replace the single `<ul className="scout-results">`
   with groups, built in the existing order (don't sort again: the server order
   already is tier then score):
   ```ts
   const GROUPS = [
     { tier: "STRONG", title: "Recommended",
       note: "Proven work on ABTalks and a fit for this search. Highest score first." },
     { tier: "PARTIAL", title: "Partial match",
       note: "Fits on paper, but with less verified work or missing something you asked for. Can score higher than a Recommended candidate; ranked below them because the evidence is thinner." },
     { tier: "NONE", title: "Also in the pool",
       note: "Shown because fewer than five people matched well." },
   ] as const;
   ```
   Keep one running rank: `rank = index in visible + 1`, so the numbers stay
   1…N across groups. Render each non-empty group as:
   ```tsx
   <section className="scout-results__group" aria-labelledby={`grp-${g.tier}`}>
     <h3 id={`grp-${g.tier}`} className="scout-results__group-h">
       {g.title} <small>· {items.length}</small>
     </h3>
     <p className="scout-results__group-note">{g.note}</p>
     <ul className="scout-results">{/* existing <li><DeskMatchCard …/></li> unchanged */}</ul>
   </section>
   ```
   Any tier value not in `GROUPS` goes into the NONE group, so no card can
   disappear.
2. **If only one group is non-empty, render no heading or note**, just the
   plain `<ul>` as today. A heading over a list that isn't split is noise.
3. The non-desk (`MatchCard`) branch is unchanged. That card already shows the
   score and tier.

### 5.4 `hire-scout.css`
Add, using existing tokens only:
```css
.desk-card__score { font-size: 13px; color: var(--h-gray-700); white-space: nowrap; }
.desk-card__score b { color: var(--h-ink); font-variant-numeric: tabular-nums; }
.desk-card__score[data-tier="STRONG"] b { color: var(--h-primary); }
.scout-results__group + .scout-results__group { margin-top: 24px; }
.scout-results__group-h { margin: 0; font-size: 14px; font-weight: 600; color: var(--h-ink); }
.scout-results__group-h small { font-weight: 400; color: var(--h-gray-600); }
.scout-results__group-note { margin: 2px 0 10px; font-size: 12px; color: var(--h-gray-600); }
```
Check that `.desk-card__header` wraps at the minimum panel width. If the name
row overflows, add `flex-wrap: wrap` to `.desk-card__header` only.

## 6. Guardrails for Cursor (DO NOT)
- DO NOT change `rankCandidates`, `tierFor`, weights, `pickSearchMatches`,
  `load-request-matches.ts` or any server/action code. Display and scroll only.
- DO NOT sort or reverse the list on the client. The server order is the ranking.
- DO NOT sort by score alone "to make the numbers go down". That brings
  QA-KI-008 back.
- DO NOT remove the bottom-scroll for the pre-search chat stage.
- DO NOT scroll on triage, shortlist, "Hide rejected" or panel open/close. Only a
  new result set (a different `resultsKey`) scrolls.
- DO NOT use smooth scrolling for the jump to the top (it animates through the whole list).
- DO NOT touch `candidate-inspector.tsx` (that's plan 154) or the inspector's
  unlock/contact flow.
- No new files, no `any`, no `console.*`, no changes to `src/components/ui/*`.

## 7. DB safety
Not applicable. No schema or data changes.

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
npm run test:sample
```
```bash
npm run build
```
(`test:sample` needs `cross-env` on Windows; see the memory note on
NODE_OPTIONS scripts.)

**Manual (`npm run dev`):**
1. Signed out, `/hire`: brief Scout until results show. The list opens with
   #1 at the top of the viewport, not the last card.
2. Edit filters and re-run. It jumps back to #1.
3. Scroll to about #8 and open the inspector. Walk Prev/Next and close. You're back
   at #8, not at the top.
4. Shortlist and reject a card, and toggle "Hide rejected". The page doesn't jump.
5. Signed in: open a saved project `/hire/<id>?session=<sid>` directly. It loads
   at #1. Switch session (or guest search tab). It opens at #1.
6. Before any search, the chat still follows the latest message downwards.
7. Each card shows `NN/100 · Recommended` or `· Partial match`. "Top match"
   appears only when #1 is Recommended.
8. A search that returns both tiers shows a "Recommended · n" group, then
   "Partial match · n", and rank numbers run 1…N without restarting. Scores inside
   each group go down. A Partial card scoring above a Recommended one is
   explained by its group note.
9. A search with a single tier shows no group headings.
9a. A search with no matches ("What a match would look like" sample card)
    shows no score chip and no "Top match" badge.
10. A must-have search with fewer than 5 good matches shows the "Also in the
    pool" group last.
11. Mobile (375px) and minimum panel width: the score chip wraps cleanly, with no
    horizontal scroll. Check dark theme too.

**Files that should have changed: exactly these four.**
```
src/components/hire/scout-chat.tsx
src/components/hire/desk-match-card.tsx
src/components/hire/match-results.tsx
src/app/hire/hire-scout.css
```

## 9. Commit message
```
fix(hire): open Scout results at #1 and show why they are ordered

After a search the chat's scroll-to-latest effect scrolled to the last
card, so recruiters landed on the lowest-ranked candidate. Once results
show, a new result set now opens at the top; triage and inspector
close/restore don't move the page.

Result cards now show score/100 and tier, "Top match" is only on a
Recommended #1, and the desk list is grouped Recommended / Partial match
/ Also in the pool, which is the tier-then-score order the server already uses.

No ranking or scoring changes.
```
