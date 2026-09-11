# T-239 / TC-R-007 — Side-by-side candidate review panel

> Status: **implemented** on `feat/t239-candidate-review-panel` (2026-09-11). See the
> Implementation notes at the foot of this file for the three points where the build
> departed from the spec.

## Context

Board row for 11 Sep, Demo 1 (`docs/DailyTask88.md:171-178`), workstream **R4 Candidate
Review**, phase **B1 Build**, starting from **T-239**, after **T-235** and **T-201**, covering
**TC-R-007**:

> **Outcome:** As a recruiter, I read a candidate beside my results without losing my place.
> **Done:** The panel resizes, next/previous work through the result set, and closing preserves
> criteria, results and scroll position.
> **Evidence:** PR, automated-test output and a short browser recording.

Demo contract (`docs/Demo88.md:73`): *"Read a candidate beside your results — resizable panel,
next and previous, and closing returns you exactly where you were."*

**Most of this already exists.** The recruiter surface is the Scout desk at `/hire`, not a
`/talent` grid. `CandidateInspector` is already a real side-by-side grid column with working
next/previous and close. Three things are genuinely missing, and they are exactly the three
verbs in the acceptance line: **resize**, **resume in the panel**, **scroll position on close**.

This is a UI-only change. No schema, no migration, no new server action, no new route.

---

## Current behaviour

| Piece | Where | State |
|---|---|---|
| Search surface | [scout-chat.tsx](src/components/hire/scout-chat.tsx) (`"use client"`, 1373 lines) — all state in `useState`, nothing in the URL | exists |
| Results list | [match-results.tsx](src/components/hire/match-results.tsx) → `DeskMatchCard`, `onOpen` at [scout-chat.tsx:1206](src/components/hire/scout-chat.tsx#L1206), `selectedRef` at [:1229](src/components/hire/scout-chat.tsx#L1229) | exists |
| Side panel | [candidate-inspector.tsx](src/components/hire/candidate-inspector.tsx) — `<aside className="hire-detail hire-profile">`, hand-rolled, no Dialog/Sheet | exists |
| Side-by-side layout | [hire-scout.css:6243-6260](src/app/hire/hire-scout.css#L6243-L6260) named grid areas `"bar panel" / "chat panel" / "composer panel"`; winning width rule [:6312-6321](src/app/hire/hire-scout.css#L6312-L6321) `grid-template-columns: minmax(0,1fr) clamp(360px, 30vw, 484px)` at ≥1101px; base rule [:651](src/app/hire/hire-scout.css#L651) `1fr minmax(320px, 400px)` | exists |
| Next / previous | [candidate-inspector.tsx:268-288](src/components/hire/candidate-inspector.tsx#L268-L288) arrows; `panelList` / `openIndex` at [scout-chat.tsx:893-897](src/components/hire/scout-chat.tsx#L893-L897); disabled at either end | **exists — verify only** |
| Criteria + results on close | pure client state in `scout-chat.tsx`, no navigation on close | **exists — verify only** |
| **Resize** | grid track is a fixed `clamp()`. No grip, no drag, no persistence. `react-resizable-panels` / `vaul` not installed; no Sheet/Resizable in `src/components/ui/` | **MISSING** |
| **Resume in panel** | lives on a separate route `/hire/evidence?ref=` opened in a **new tab** via the `•••` link ([:298-307](src/components/hire/candidate-inspector.tsx#L298-L307)). The eye button ([:381-392](src/components/hire/candidate-inspector.tsx#L381-L392)) only opens the placeholder `SubscriptionGate` | **MISSING (in-panel)** |
| **Scroll position on close** | nothing captures or restores `scrollRef.current.scrollTop`. Opening swaps the grid from `1fr 0fr` to two columns with a 280ms transition, so the left column reflows and the numeric `scrollTop` no longer points at the same card | **MISSING** |

Useful confirmations from the investigation:

- The auto-scroll-to-bottom effect ([scout-chat.tsx:501-520](src/components/hire/scout-chat.tsx#L501-L520)) depends on `messages.length, pending, searched, deskMatches.length, resultsPin, detailsOpen` — **none change on open/close**, so it will not fight the restore.
- The scroll container is `.chat-output` (`id="hire-results"`), `scrollRef` at [scout-chat.tsx:1074](src/components/hire/scout-chat.tsx#L1074).
- Below 1100px the panel is `position: fixed; inset: 0` ([:4122](src/app/hire/hire-scout.css#L4122)) and covers the desk. Resize must not apply there.
- `EvidenceResume` is already `"use client"` and reads its match from the `evidence-cache` (session/localStorage), **not** the DB — so it can be rendered inline with zero new data plumbing.

### Explicitly out of scope

The candidate's **uploaded resume PDF** is not recruiter-readable today and cannot be made so in
this ticket: the blob is `access: "private"` ([src/features/resume/storage.ts](src/features/resume/storage.ts)) and the
only read route [src/app/api/profile/resume/file/route.ts](src/app/api/profile/resume/file/route.ts) is self-scoped with no
parameters. Serving it to a recruiter needs a new entitlement-gated route handler and a
`CandidateVisibility.showResume` check — a separate ticket. "Resume" in this plan means the
**evidence resume** (`EvidenceResume`), which is what the product already labels Resume.

---

## Decisions taken

1. **Resume becomes a section of the panel**, reached by a new `Resume` tab, rendering
   `EvidenceResume` inline. `•••` stays as the escape hatch to the full page.
2. **Hand-rolled drag grip + CSS variable + `localStorage`.** No new dependency; adding
   `react-resizable-panels` would mean rewriting the named-area grid the whole desk depends on.

---

## Files to touch

| File | | Note |
|---|---|---|
| `src/features/hire/review-panel.ts` | **[new]** | Pure, DOM-free: `PANEL_WIDTH_KEY`, `PANEL_MIN`/`PANEL_MAX`, `clampPanelWidth`, `stepPanelWidth`, `readStoredPanelWidth`/`writeStoredPanelWidth`, `neighbourIndex`. The testable core. |
| `src/features/hire/review-panel.test.ts` | **[new]** | `tsx` test in the house style — real unit assertions plus source-shape guards. |
| `src/components/hire/panel-resizer.tsx` | **[new]** | `"use client"`. ~70 lines: the separator element, pointer drag, keyboard, persistence. Kept out of the already-690-line inspector. |
| `src/components/hire/candidate-inspector.tsx` | [edit] | Mount `<PanelResizer>`; add the `Resume` tab + `data-section="resume"` section; re-point the eye button. |
| `src/components/hire/evidence-resume.tsx` | [edit] | Extract `EvidenceResumeBody({ match })`; `EvidenceResume` keeps its page chrome and calls it. |
| `src/components/hire/scout-chat.tsx` | [edit] | Capture `scrollTop` on first open, restore on close. |
| `src/app/hire/hire-scout.css` | [edit] | `--hire-panel-w` in both `is-open` rules, grip styles, `.is-resizing`, `.hire-sheet--embed`, hide grip < 1101px. |
| `package.json` | [edit] | `"test:review-panel"` script. |
| `docs/CHANGELOG.md` | [edit] | One dated line under `## Pending reconcile`. |

**Server vs Client:** every component touched is already `"use client"`. `src/app/hire/evidence/page.tsx`
(Server) is untouched and still passes only the `lookup` string. `EvidenceResumeBody` takes a
plain `MatchCardData` object across a client→client boundary only. **No new Server→Client prop
passing, no functions/icons/class instances crossing any boundary.**

---

## Steps

### 1. `src/features/hire/review-panel.ts` [new]

```ts
export const PANEL_WIDTH_KEY = "abtalks-hire-panel-w"; // matches abtalks-hire-* house keys
export const PANEL_MIN = 360;
export const PANEL_MAX = 720;
export const PANEL_STEP = 16;
```

- `clampPanelWidth(px: number, viewportWidth: number): number` — clamps to
  `[PANEL_MIN, min(PANEL_MAX, floor(viewportWidth * 0.6))]`; rounds; returns `PANEL_MIN` for
  `NaN`/non-finite input. The 60% ceiling stops the panel eating the results on a small laptop.
- `stepPanelWidth(px, key: "ArrowLeft" | "ArrowRight" | "Home" | "End", viewportWidth)` —
  Left widens, Right narrows (the grip is on the panel's **left** edge), Home → min, End → max.
- `readStoredPanelWidth(): number | null` / `writeStoredPanelWidth(px: number): void` —
  `try/catch` around `localStorage`, returns `null` on quota/private-mode, mirroring the
  existing `evidence-cache.ts` handling. Guard `typeof window === "undefined"`.
- `neighbourIndex(length: number, index: number, dir: -1 | 1): number | null` — `null` at either
  end or when `index < 0`. This is the arrows' contract, made assertable.

No `any`. No Zod (no boundary crossed — these are pure functions, not an action entry).

### 2. `src/components/hire/panel-resizer.tsx` [new]

```tsx
"use client";
export function PanelResizer() { … }
```

- Renders `<div role="separator" aria-orientation="vertical" aria-label="Resize candidate panel"
  tabIndex={0} className="hire-detail__grip" aria-valuenow={width} aria-valuemin={PANEL_MIN}
  aria-valuemax={max} />`, where `max` is the **effective** ceiling
  `clampPanelWidth(PANEL_MAX, window.innerWidth)` held in state and recomputed on `resize`, not
  the static `PANEL_MAX`. A screen reader announcing a maximum the drag will not actually reach
  is a small lie, and the value is already computed.
- On mount: `readStoredPanelWidth()` → if set, `applyWidth(w)`.
- `applyWidth(px)` sets `document.documentElement.style.setProperty("--hire-panel-w", `${px}px`)`
  and holds `px` in state for `aria-valuenow`. Writing to `:root` keeps it alive across
  open/close cycles and avoids re-styling a node the grid owns.
- `onPointerDown`: `e.currentTarget.setPointerCapture(e.pointerId)`, add `is-resizing` to the
  closest `.scout__body`, then on `pointermove` compute
  `clampPanelWidth(bodyRect.right - e.clientX, window.innerWidth)` and `applyWidth`.
  `pointerup`/`pointercancel` → release capture, remove `is-resizing`, `writeStoredPanelWidth`.
- `onKeyDown`: the four keys via `stepPanelWidth`, `preventDefault`, persist on each press.
- `onDoubleClick`: reset to the default (remove the property + clear storage).
- Guard: if `window.matchMedia("(max-width: 1100px)").matches`, render `null` — at that width
  the panel is a fullscreen overlay and there is nothing to resize against.

### 3. `src/app/hire/hire-scout.css` [edit]

> **Line numbers in this plan are a reading aid, not an address.** Match on the selector and the
> surrounding context — the file is ~7.4k lines and edits will shift everything below them.

**There are FOUR `grid-template-columns` rules on `.scout__body`. Exactly two get the variable.**
Verified by enumerating them; getting this wrong leaks a stored panel width into a collapsed
layout, which is the one way this change can break the desk for everyone:

| ~Line | Selector | Current value | Change? |
|---|---|---|---|
| 642 | `.scout__body` | `1fr 0fr` | **NO** — this is the *closed* state. Leave it. |
| 651 | `.scout__body.is-open` | `1fr minmax(320px, 400px)` | **YES** |
| 2073 | inside `@media (max-width: 1100px)` → `.scout__body.is-open` | `0fr 1fr` | **NO** — panel is fullscreen below 1100px; a width here would un-hide the results column behind it. Leave it. |
| 6316 | inside `@media (min-width: 1101px)` → `.hire-app--results .scout__body.is-open` | `minmax(0,1fr) clamp(360px, 30vw, 484px)` | **YES** — this is the rule that actually wins on the desk. |

Before editing, re-run this and confirm you still get exactly four hits in that order:
```bash
grep -n -B2 "grid-template-columns" src/app/hire/hire-scout.css | grep -A2 "scout__body"
```

- `.scout__body.is-open` → `grid-template-columns: 1fr var(--hire-panel-w, clamp(320px, 30vw, 400px));`
  (`clamp` rather than `minmax` — a `var()` fallback has to be a single track value.)
- `.hire-app--results .scout__body.is-open` → `grid-template-columns: minmax(0, 1fr) var(--hire-panel-w, clamp(360px, 30vw, 484px));`
- `.chat-output { scrollbar-gutter: stable; }` — **load-bearing for step 6.** Narrowing the left
  column makes its content taller, which can bring a scrollbar in or out; that changes the
  column's usable width and a restored numeric `scrollTop` would then land on a different card.
  Reserving the gutter removes the failure mode rather than compensating for it.
- `.scout__body.is-resizing { transition: none; }` and
  `.scout__body.is-resizing * { user-select: none; }` — the existing 280ms
  `transition: grid-template-columns` ([:648](src/app/hire/hire-scout.css#L648)) makes a drag feel
  like it is on elastic.
- `.hire-detail { position: relative; }` (add to the existing block at [:1714](src/app/hire/hire-scout.css#L1714)).
- `.hire-detail__grip` — `position: absolute; inset-block: 0; left: -8px; width: 12px;
  cursor: col-resize; z-index: 2; background: transparent;` with a 2px `var(--h-primary)` rail
  on `:hover`, `:focus-visible` and `.scout__body.is-resizing`.
- `.hire-sheet--embed` — `max-width: none; padding: 0; min-height: 0;` and collapse
  `.hire-sheet--embed .hire-sheet__grid` to one column; the sheet is a page layout and has to
  survive a 360px column.
- Inside `@media (max-width: 1100px)` (the block at [:4114](src/app/hire/hire-scout.css#L4114)):
  `.hire-detail__grip { display: none; }`.

### 4. `src/components/hire/evidence-resume.tsx` [edit]

- Extract everything from `const e = match.evidence ?? {}` downward into
  `export function EvidenceResumeBody({ match }: { match: MatchCardData })`, returning the
  sheet's children wrapped in a `<div className="hire-sheet hire-sheet--embed">`.
- `EvidenceResume({ lookup })` keeps `recallEvidence`, the loading/missing states and
  `BackToScout` unchanged, and renders `<main className="hire-sheet"><BackToScout /><EvidenceResumeBody match={match} /></main>`.
  Adjust so the page does not double the `hire-sheet` class — simplest is for `EvidenceResumeBody`
  to return a `<>…</>` fragment and let each caller own its container element.
- `/hire/evidence` must render byte-identically afterwards.

### 5. `src/components/hire/candidate-inspector.tsx` [edit]

- Add `{ id: "resume", label: "Resume" }` to `TABS` ([:69-75](src/components/hire/candidate-inspector.tsx#L69-L75)),
  before `more`. The tabs are scroll-jump anchors, so this needs no new interaction code.
- Add a new `<section data-section="resume" className="hire-profile__section hire-profile__section--ruled" aria-label="Resume">`
  before the `more` section, containing `<h4 className="hire-profile__h">Resume</h4>` and
  `<div className="hire-sheet hire-sheet--embed"><EvidenceResumeBody match={match} /></div>`.
  Skip the section entirely when `sample` is true (sample cards are not people).
- Eye button ([:383-391](src/components/hire/candidate-inspector.tsx#L383-L391)): keep
  `setGate("resume")` when `preview` is truthy (locked preview — the paywall story is intact),
  otherwise `jump("resume")`. Update `aria-label` to `"Go to resume"` and drop
  `aria-haspopup="dialog"` on that branch.
- Render `<PanelResizer />` as the first child of the `<aside>`, outside `.hire-detail__scroll`
  so it does not scroll away.
- Leave the `•••` link, `onPrev`/`onNext` and `onClose` exactly as they are.

### 6. `src/components/hire/scout-chat.tsx` [edit]

- Add `const savedScroll = useRef<number | null>(null);` beside `scrollRef` ([:332](src/components/hire/scout-chat.tsx#L332)).
- In `openMatchPanel` ([:321-325](src/components/hire/scout-chat.tsx#L321-L325)), capture **only
  on the first open**:

  ```ts
  function openMatchPanel(match: MatchCardData) {
    if (!openMatch) savedScroll.current = scrollRef.current?.scrollTop ?? null;
    setOpenMatch(match);
    void recordCandidateViewAction(match.candidateRef);
  }
  ```

  The `if (!openMatch)` guard is the whole point: next/previous must not overwrite the mark with
  a value measured while the panel is already narrowing the column.
- Add a single close helper and use it for both `onClose` call sites on `CandidateInspector`
  ([:1268](src/components/hire/scout-chat.tsx#L1268)):

  ```ts
  function closeMatchPanel() {
    const top = savedScroll.current;
    savedScroll.current = null;
    setOpenMatch(null);
    if (top == null) return;
    // The grid animates back over 280ms; restore now and again when it settles,
    // or the browser lands us wherever the reflow happened to leave us.
    requestAnimationFrame(() => {
      const root = scrollRef.current;
      if (root) root.scrollTop = top;
    });
    const body = scrollRef.current?.closest(".scout__body");
    body?.addEventListener("transitionend", function once(e) {
      // `.scout__body` animates more than one property. Without this guard the
      // handler fires on whichever finishes first and restores mid-reflow.
      if ((e as TransitionEvent).propertyName !== "grid-template-columns") return;
      body.removeEventListener("transitionend", once);
      const root = scrollRef.current;
      if (root) root.scrollTop = top;
    });
  }
  ```
- The restore assumes the left column returns to **exactly** the width it had when the mark was
  taken. `scrollbar-gutter: stable` from step 3 is what makes that true; do not skip it. If a
  candidate still lands a few pixels off during step 9 of the walkthrough, the fallback is to
  anchor on an element instead of a number — record the `candidateRef` of the topmost card
  intersecting the viewport at capture time and `scrollIntoView({ block: "start" })` it on close.
  Do not build the fallback pre-emptively; only if the manual check shows drift.
- Do **not** touch the auto-scroll effect's dependency array — adding `openMatch` to it would
  yank the thread to the bottom on every open and defeat the ticket.

### 7. `package.json` [edit]

```json
"test:review-panel": "cross-env NODE_OPTIONS=--conditions=react-server tsx src/features/hire/review-panel.test.ts"
```

Placed next to the other `test:*` hire scripts.

### 8. `src/features/hire/review-panel.test.ts` [new]

Same shape as [project-state.test.ts](src/features/hire/project-state.test.ts) — `suite()`/`assert()`
helpers, `passed`/`failed` counters, `process.exit(failed ? 1 : 0)`. Two halves:

**Unit (real behaviour):**
- `clampPanelWidth` floors at `PANEL_MIN`, ceils at `PANEL_MAX`, respects the 60%-of-viewport
  ceiling, and survives `NaN`/`Infinity`.
- `stepPanelWidth`: ArrowLeft widens, ArrowRight narrows, Home/End hit the bounds, and every
  result is already clamped.
- `neighbourIndex`: `null` at index `0` going back and at `length - 1` going forward; `null` for
  `index === -1`; correct neighbour in the middle — this is the next/previous contract.

**Source guards (the wiring the unit tests cannot reach):**
- `hire-scout.css` contains `var(--hire-panel-w` in **both** `is-open` rules, defines
  `.hire-detail__grip`, and hides it inside the `max-width: 1100px` block.
- `scout-chat.tsx` contains `savedScroll` and `if (!openMatch)` in `openMatchPanel`, and its
  auto-scroll dependency array does **not** contain `openMatch`.
- `candidate-inspector.tsx` still passes `onPrev`/`onNext` with `disabled={!onPrev}` /
  `disabled={!onNext}`, renders `PanelResizer`, and has a `data-section="resume"`.
- `candidate-inspector.tsx` contains no `console.` call and no `prisma.` call.

### 9. `docs/CHANGELOG.md` [edit]

One line under `## Pending reconcile`:

```
- 2026-09-11 T-239 / TC-R-007: candidate review panel is resizable (drag grip + `--hire-panel-w`, persisted in `localStorage`), the evidence resume renders inside the panel as a Resume section, and closing restores the results scroll position. UI only — no schema, no new route, no new server action.
```

---

## Guardrails for Cursor (DO NOT)

- **DO NOT trust the line numbers in this plan.** This is a spec, not a patch. Every edit shifts
  the lines below it, and `hire-scout.css` is ~7.4k lines. Anchor on the selector, the function
  name or the surrounding context; if the line does not contain what this plan says it contains,
  re-grep rather than editing by position.
- **DO NOT** put `--hire-panel-w` on `.scout__body` (`1fr 0fr`, the closed state) or on the
  `@media (max-width: 1100px)` copy of `.scout__body.is-open` (`0fr 1fr`). Only the two rules
  named in step 3. Re-run the `grep` in step 3 first and confirm four hits.
- **DO NOT** omit `scrollbar-gutter: stable` on `.chat-output` — the scroll restore in step 6
  depends on it.
- **DO NOT** leave the `transitionend` listener unguarded; it must check
  `propertyName === "grid-template-columns"` or it fires mid-reflow.
- **DO NOT** touch `middleware.ts`, `auth.config.ts` or anything on the edge import path. Nothing
  in this plan goes near them.
- **DO NOT** add `requireRole` / `requireAdmin` / `requireRecruiter` anywhere. `/hire` is already
  gated by its layout; no route handler is created or changed.
- **DO NOT** install `react-resizable-panels`, `vaul`, or any dependency. The grip is hand-rolled
  on purpose — the desk's named-area grid does not survive a `PanelGroup` rewrite.
- **DO NOT** modify anything in `src/components/ui/`.
- **DO NOT** add `openMatch` to the auto-scroll effect's dependency array
  ([scout-chat.tsx:513-520](src/components/hire/scout-chat.tsx#L513-L520)).
- **DO NOT** put the search or the open candidate into the URL / `searchParams`. The desk is
  deliberately client-state-only; a navigation on close is exactly what loses the scroll position.
- **DO NOT** change `INITIAL_VISIBLE` in `match-results.tsx` or the `panelList` /
  `visibleDeskMatches` derivation — next/previous already walks the right list.
- **DO NOT** touch Prisma, the schema, `src/repositories/*`, or any server action. There is no DB
  change in this ticket.
- **DO NOT** try to serve the candidate's uploaded resume PDF. The blob is private and
  `src/app/api/profile/resume/file/route.ts` is self-scoped — a separate, entitlement-gated ticket.
- **DO NOT** remove the `SubscriptionGate` path for locked previews, and do not remove the `•••`
  link to `/hire/evidence`.
- **DO NOT** create files beyond the three `[new]` entries listed above.
- **DO NOT** use `console.error` — `lib/logger.ts` only. No `any`.
- **DO NOT** introduce `<Button asChild>` or `<Button render={<Link>}>`; use `buttonVariants` on
  the `<Link>`.

---

## Verification

**Build / typecheck**
```bash
npx prisma generate
npm run lint
npm run build          # must pass clean
npm run test:review-panel   # this is the "automated-test output" evidence
```

**Manual walkthrough — this IS the TC-R-007 script and the browser recording**

1. `npm run dev`, sign in as a recruiter, go to `/hire`.
2. Run a search that returns **at least four** candidates (a seeded pool: `npm run db:seed:hire`).
3. Scroll the results **half way down** — note which card is under the cursor.
4. Open a candidate. → Results stay visible in the left column; the panel opens beside them.
5. **Drag the grip** on the panel's left edge both ways. → The panel resizes live, stops at 360px
   and at the smaller of 720px / 60% viewport, and the results reflow rather than disappear.
6. Focus the grip and press `ArrowLeft` / `ArrowRight` / `Home` / `End`. → Same bounds, keyboard-only.
7. Click the **Resume** tab. → The evidence resume renders **inside** the panel, no new tab,
   readable at the narrowest width.
8. Press **next** three times, then **previous** three times. → The panel walks the result set in
   order; the arrow is disabled at the first and last candidate; the selected card stays highlighted.
9. **Close** the panel. → The search criteria strip is unchanged, the same result list is shown,
   and the thread is back at **exactly** the scroll position from step 3. *Watch for drift of more
   than a few pixels — that is the scrollbar-gutter / reflow failure mode; see the note in step 6.*
10. Reload the page and reopen a candidate. → The panel comes back at the width set in step 5.
11. **With a width stored, close the panel entirely.** → The desk returns to full width; the
    stored width must **not** hold a gap open on the right. (This is the `1fr 0fr` rule staying
    untouched.)
12. Narrow the browser below 1100px **with a stored width**. → Panel goes fullscreen, grip is
    gone, the results column is fully covered rather than showing a stale sliver, and Back works.

**Exactly these files should have changed** — nothing else:

```
src/features/hire/review-panel.ts          (new)
src/features/hire/review-panel.test.ts     (new)
src/components/hire/panel-resizer.tsx      (new)
src/components/hire/candidate-inspector.tsx
src/components/hire/evidence-resume.tsx
src/components/hire/scout-chat.tsx
src/app/hire/hire-scout.css
package.json
docs/CHANGELOG.md
```

Confirm with `git status --short` before reporting done.

---

## Commit message

```
feat(hire): resizable side-by-side candidate review panel (T-239 / TC-R-007)

The review panel was already a grid column with working next/previous, but it
was a fixed width, the resume opened in a new tab, and closing it dropped the
recruiter wherever the reflow happened to land.

- Drag grip + keyboard resize on the panel's left edge, written to
  --hire-panel-w on :root and persisted in localStorage. Clamped to
  360px..min(720px, 60vw); disabled below 1100px where the panel is fullscreen.
- The evidence resume renders inside the panel as a Resume section. The ••• link
  to the full page and the locked-preview paywall are unchanged.
- The results scroll position is captured on the first open and restored on
  close, across the 280ms grid transition. Next/previous no longer overwrite it.

UI only: no schema, no new route, no new server action.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Implementation notes (2026-09-11)

Three departures from the spec above, all found while building:

1. **`clampPanelWidth` guarded on `!Number.isFinite`, which was wrong.** That lumps
   `Infinity` in with `NaN` and collapsed an over-range width to the *minimum*. Only
   `NaN` carries no information; `+/-Infinity` is an ordinary out-of-range number and
   now clamps to the ceiling/floor like any other. The unit test caught this.

2. **`PanelResizer` sets no state from an effect.** The spec's "on mount, read storage
   then `applyWidth`" trips `react-hooks/set-state-in-effect`. The width is now seeded
   lazily in `useState`, and a single effect pushes it *out* to `--hire-panel-w`.
   Safe to read storage during render here because `desk` starts `false`, so the
   component renders nothing on the server and nothing on the first client render —
   there is no markup to mismatch.

3. **The `transitionend` listener is bounded by a 600ms timeout.** The spec added the
   listener with no path off it when the transition never fires (reduced motion, or a
   track that did not actually change), which leaked one listener and one closure per
   close for the life of the session. `settle`/`done` are arrow consts rather than
   `function` declarations, because a hoisted declaration loses the `top == null`
   narrowing and TS widens it back to `number | null`.

Two small additions not in the spec:

- The **Resume tab is filtered out for sample cards**, which have no evidence record —
  otherwise the tab renders and does nothing.
- `EvidenceResumeBody` takes **`showIdentity`**, which the panel sets to `false`. The
  panel already shows the name, location and score in its own header, and the body's
  `<h1>` would otherwise nest under the panel's `<h3>`.

### Verification actually run

- `npx tsc --noEmit` — clean.
- `npm run test:review-panel` — **26 passed, 0 failed**.
- Neighbouring suites unaffected: `test:project-state` 10, `test:navbar-shortlist` 16,
  `test:match-persistence` 5, `test:virtual` 28, `test:guest-adoption` 12 — all pass.
- `npm run build` — compiles successfully.
- `npx eslint` on the three new/edited files: **no new problems**. `scout-chat.tsx` has
  4 pre-existing `set-state-in-effect` errors and 2 `no-img-element` warnings, and
  `evidence-resume.tsx` 1 pre-existing `set-state-in-effect`; all verified identical
  against the `HEAD` version of the file.
- **Manual browser walkthrough (steps 1-12) has NOT been run** — it needs a seeded pool
  and a signed-in recruiter. That is the outstanding evidence for TC-R-007, along with
  the screen recording.

---

## Rebase onto upstream/master (2026-09-11)

Rebased from `ab446879` onto `42926b84`, which brought in PR #294/#295 (Scout UI)
and the credits/unlock work. Textually clean, but upstream rewrote all three files
this ticket touches — `hire-scout.css` (+1631), `scout-chat.tsx` (+403),
`candidate-inspector.tsx` (+51) — so the merge being clean did not mean the feature
was still correct.

**One real behavioural change.** PR #295 added
`.hire-app--results .scout__body` (no `.is-open`), which keeps the profile column
reserved on the results screen even with nothing open. `--hire-panel-w` was on the
`.is-open` rules only, so a resized panel snapped back to the design default on close
and jumped again on reopen. The variable now applies to that rule too: one width
throughout, no jump, and the card column never changes size — which makes the scroll
restore exact rather than merely close. The test grew an assertion for it (27 now).

The two rules that must stay literal are unchanged: the pre-results `1fr 0fr` state
and the `<=1100px` `0fr 1fr` overlay.

**Pre-existing upstream breakage, not introduced here:** `npx tsc --noEmit` reports 3
errors in `src/features/notification/notify.test.ts` (missing `deliveryId` on
`SendEmailResult`). Verified present on `upstream/master` alone; the file is
byte-identical in this branch. `npm run build` still exits 0.

**Manual walkthrough must be re-run.** The 11/11 was recorded at `e15c2de9`, before
this rebase. Check 10 as originally written ("closing leaves no gap") no longer
describes intended behaviour — upstream reserves that column deliberately. Re-run at
least 3, 8, 10 and 11.
