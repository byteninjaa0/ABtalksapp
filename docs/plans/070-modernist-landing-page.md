# 057 — Modernist landing page (`/`)

## 1. Goal

Replace the logged-out landing page (`LandingHub`) with the Modernist design
imported from Claude Design project `4782d093-0ed9-4ebc-9540-77dbbb8f2f34`
(`ABTalks Landing.dc.html`): a flat, architectural, zero-radius marketing page
built on 2px rules and a visible modular grid, positioning ABTalks as
evidence-based hiring with consent at the centre.

Scope is **the landing route only**. The full-app retheme is confirmed as wanted
and is planned separately in
[071-modernist-app-retheme.md](docs/plans/071-modernist-app-retheme.md).
**Ship this plan first**: it is self-contained and independently revertible, and
it gives a production reference for the system before 058 changes 210 files.

---

## 2. Current behavior

- [src/app/page.tsx](src/app/page.tsx) — Server Component. Logged-in users with a
  profile redirect to `/dashboard`; profile-less users go to the hackathon
  redirect or `/register`. Logged-out users get
  `<LandingHub claudeEnabled={isClaudeEnabled()} />`.
- [src/components/landing/landing-hub.tsx](src/components/landing/landing-hub.tsx)
  — current three-track landing (plan 048). ~10 KB.
- [src/app/layout.tsx](src/app/layout.tsx) wraps everything in `MainShell` +
  `AppFooter` + `BottomNavGate`, loads Inter + Plus_Jakarta_Sans, and runs
  `ThemeProvider` with `defaultTheme="system" enableSystem`.
- `AppFooter` already returns `null` on `/marketplace`, `/ai-workshop`,
  `/ai-cohort-register`, `/ai-cohort-india`, `/program`, `/talent`, `/hackathon`
  ([app-footer.tsx:121-147](src/components/shared/app-footer.tsx:121)).
- `BottomNavGate` returns `null` when there is no session, so it never renders on
  the logged-out landing. **No change needed there.**

---

## 3. Design source → what actually has to be built

The source is a `.dc.html` Design Component, not React. It uses `<x-dc>`,
`<helmet>`, `{{ binding }}` interpolation, `<sc-if>`, and a `DCLogic` class.
None of that survives translation. The three pieces of real behavior are:

| Source construct | React translation |
| --- | --- |
| `DCLogic.state.scrolled` + scroll listener | client island, `useEffect` scroll listener on `window` |
| `DCLogic.state.menuOpen` | same client island, `useState` |
| `DCLogic.state.released` + `<sc-if>` | separate client island (consent card) |
| everything else | static markup in a Server Component |

The `.dc.html` walks ancestor nodes looking for a scroll container because the
design canvas scrolls in a host div. **In the app the window scrolls — drop that
walk entirely and listen on `window`.**

### Accent color — settled

`handoff/design-system.md` and `handoff/globals.theme.css` specify accent
`#ec3013` (red). The landing file overrides it to **`#7C5CFF` (purple)** with the
comment *"accent retheme — the system's red ramp swapped for #7C5CFF"*.

**Purple `#7C5CFF` ships** — confirmed 2026-08-10. It is what the design file
renders, and plan 058 §7 found the product already carries `#7364E6` / `#968BEC` /
`#8365E3` 130+ times, so purple is the consistent direction. Where the kit's red
values appear in `handoff/`, ignore them.

---

## 4. Files to touch

| Path | | Note |
| --- | --- | --- |
| `src/components/landing/modernist/landing-page.tsx` | `[new]` | Server Component. Whole page composition. |
| `src/components/landing/modernist/landing-nav.tsx` | `[new]` | `"use client"`. Sticky nav, scroll-condense, mobile panel. |
| `src/components/landing/modernist/consent-card.tsx` | `[new]` | `"use client"`. Released/withheld toggle. |
| `src/components/landing/modernist/landing.css` | `[new]` | Page-scoped tokens + craft layer (hover/animation CSS that cannot be inline). |
| `src/app/page.tsx` | `[edit]` | Swap `LandingHub` for `ModernistLanding`. Redirect logic untouched. |
| `src/components/shared/app-footer.tsx` | `[edit]` | Add `pathname === "/"` to the existing hide list. |
| `src/app/layout.tsx` | `[edit]` | Add Archivo via `next/font/google` (weights 400, 600, 800) as `--font-archivo`. Nothing else. |
| `docs/design-system.md` | `[new]` | Copy of `handoff/design-system.md`, with §2 color table corrected to the shipped accent. |

**Not touched:** `landing-hub.tsx` and `src/components/landing/slides/` stay on
disk, unreferenced, until the new page is confirmed in production. Do not delete
them in this plan. `src/components/ui/` is not touched at all.

---

## 5. Server vs Client

| Component | Boundary | Why |
| --- | --- | --- |
| `page.tsx` | Server | already is; `auth()` + Prisma |
| `LandingPage` | **Server** | pure markup, no state |
| `LandingNav` | **Client** | scroll listener, menu state |
| `ConsentCard` | **Client** | `released` toggle |
| `AppFooter` | Client | already is |

**Server→Client props:** `LandingPage` renders `<LandingNav />` and
`<ConsentCard />` with **no props at all**. Nothing crosses the boundary — no
functions, no icons, no class instances. Keep it that way; if a CTA href ever
needs to vary, pass a plain string.

---

## 6. Steps

### Step 1 — `src/components/landing/modernist/landing.css`

Page-scoped stylesheet, imported by `landing-page.tsx`. Scope **every token to
`.modernist-landing`, not `:root`** — this is what keeps the rest of the app from
being restyled.

1. Token block on `.modernist-landing`:
   - `--m-bg: #f3f2f2`, `--m-surface: #eae9e9`, `--m-text: #201e1d`
   - `--m-divider: color-mix(in srgb, #201e1d 40%, transparent)`
   - accent ramp: `100 #f3f0ff`, `200 #e4dcff`, `300 #cec0ff`, `400 #ab97ff`,
     `500/base #7c5cff`, `600 #6543e6`, `700 #4f2fc0`, `800 #3a2190`, `900 #281a5e`
   - neutral ramp: `100 #f8f4f4`, `200 #eae7e7`, `300 #d7d3d3`, `400 #bab6b6`,
     `500 #9b9797`, `600 #7d7979`, `700 #605d5d`, `800 #444141`, `900 #2d2b2b`
   - `--m-space-1: 4px` … `--m-space-8: 32px`
2. `.modernist-landing` carries the ground: `background-color: var(--m-bg)` plus
   the three background layers from the source (96px repeating grid at 5% /
   3.5% ink, and the radial accent wash at 7%), `background-attachment: fixed,
   fixed, scroll`.
3. Port `.btn`, `.btn-primary`, `.btn-ghost`, `.tag`, `.tag-accent`,
   `.tag-outline`, `.nav`, `.nav-brand` from the DS `styles.css`, **prefixed and
   nested under `.modernist-landing`** so they cannot collide with Tailwind or
   shadcn classes elsewhere. Square corners, no radius.
4. Port the craft layer verbatim from the source `<style>`: nav underline sweep
   (`.nav a::after`), `.lattice-cell` left-edge draw-in, bridge arrow ease,
   `<details>` `+`/`−` marker, `.consent-id` blur-in keyframe, `.hangq` hanging
   quote, `.stat-label` hover.
5. Port the sticky-nav rules (`.navwrap`, `.navwrap.scrolled .nav`) and **all**
   media queries: `max-width: 900px` (bridge/two/feat/steps collapse),
   `max-width: 760px` (mobile nav panel, hero sizing, `.statgrid`, `.sec`
   padding, `.footer`), `max-width: 420px` (`.statgrid` to one column).
6. End with the reduced-motion block:
   `@media (prefers-reduced-motion: reduce) { .modernist-landing *,
   .modernist-landing *::before, .modernist-landing *::after {
   animation-duration: .01ms !important; transition-duration: .01ms !important } }`

### Step 2 — `landing-nav.tsx` (`"use client"`)

- `useState` for `scrolled` and `menuOpen`.
- `useEffect`: `window.addEventListener("scroll", onScroll, { passive: true })`,
  set `scrolled` when `window.scrollY > 24`, call once on mount, remove on
  cleanup. **Do not** port the ancestor-scroll-container walk.
- Markup: `<div className={"navwrap" + (scrolled ? " scrolled" : "")}>` →
  `<nav className="nav">` with brand `ABTalks`, anchors `#how`, `#hackathons`,
  `#evidence`, `#privacy`, the primary CTA, and the mobile toggle button.
- Mobile toggle: `<button type="button">` with `aria-expanded={menuOpen}`,
  `aria-controls="landing-mobile-nav"`, label `Menu` / `Close`.
- Panel: `<div id="landing-mobile-nav" className={"navpanel" + (menuOpen ? " open" : "")}>`,
  closes on any click inside.
- CTAs are navigation, so per the repo rule use
  `<Link className={buttonVariants({ … })}>` — **never `<Button asChild>` or
  `<Button render={…}>`**. Where the Modernist `.btn` look is wanted instead of
  the shadcn variant, put `className="btn btn-primary"` directly on the `<Link>`.
  Destinations: "Hire from a cohort" → `/talent`, "Join the next cohort" →
  `/register`.

### Step 3 — `consent-card.tsx` (`"use client"`)

- `const [released, setReleased] = useState(false)`.
- Derived values, exactly as the source `renderVals()`:
  - state label — `Released by candidate` / `Awaiting consent`
  - identity — `Meera Raghavan` + `Bengaluru · available from September`
    vs `Candidate #4128` + `Frontend & product · cohort 14`
  - contact row — `shared` / `hidden until approved`
  - contact ink — `var(--m-accent-700)` / ink at 70%
  - action — `Withdraw access` / `Request access`
  - note — `Meera approved this company, for this role.` /
    `The request goes to the candidate, not to us.`
- Replace `<sc-if>` with a plain ternary on `released`. Key the identity block on
  `released` so the `.consent-id` blur-in animation replays on toggle.
- Evidence rows (submitted work / rubric score / mentor review) are always
  `visible`; only the identity row changes. **This is the whole point of the
  pattern — do not make the evidence rows toggle.**
- The toggle button is a real `<button type="button">`, not a `<Link>`.

### Step 4 — `landing-page.tsx` (Server Component)

`import "./landing.css";` then compose, in source order:

1. `<LandingNav />`
2. Shell `<div>` — `max-width: 1200px`, `padding: 0 clamp(20px, 5vw, 72px)`
3. Hero — struck-through *Interview* (italic serif, accent line-through) over
   highlighted "Evidence-based hiring."; sub-paragraph; two CTAs
4. 2px rule → stats → 2px rule
5. Old signal / ABTalks signal two-column
6. Bridge figure — 5-column grid, accent centre cell, connector rules + arrowheads
7. `#privacy` — consent panel + `<ConsentCard />`
8. `#how` — numbered rows 01 / 02 / 03
9. `#evidence` — 4-cell lattice
10. `#hackathons` — 3-cell lattice with tags
11. Testimonials (two `<figure>`, `.hangq`)
12. `#faq` — four native `<details>`
13. Full-bleed accent poster band with two ghost CTAs
14. Footer strip

> **Every string on this page is specified verbatim in §12. Do not write, shorten,
> paraphrase, or "improve" any copy.** If a string is not in §12, it does not go
> on the page.

Notes for the executor:
- The heavy inline `style={{…}}` on headings/labels is **intentional** — it is
  how the design encodes its type scale. Convert to JSX style objects
  (`fontFamily`, `lineHeight`, `letterSpacing`, `WebkitBoxDecorationBreak`) and
  keep the values exactly. Do not "improve" them into Tailwind classes; the
  clamp/tracking/optical-margin values would be lost.
- Keep the negative left margins on display type (`-0.058em` hero,
  `-0.045em` figures). They are optical alignment for Archivo 800, not a bug.
- `font-feature-settings: 'tnum' 1` stays on the stat figures and the numeric
  consent rows.
- Section seams are `<hr>` at `height: 2px; border: 0` — never a 1px border.
- The lattice is `display: grid; gap: 2px; background: var(--m-divider)` with
  `background: var(--m-bg)` cells. Do not give the cells their own borders.
- Every button that navigates is a `<Link>`. Only the consent toggle and the
  mobile menu toggle are real `<button>`s.
- Hero "Interview" uses Lora italic in the source. Lora is **not** loaded in this
  repo. Either add it to `layout.tsx` alongside Archivo, or set
  `fontFamily: "Georgia, 'Times New Roman', serif"`. **Pick the serif fallback**
  — one struck-through word does not justify a second webfont, and the design
  system's own rule is "Don't add a font."

### Step 5 — `src/app/layout.tsx`

Add Archivo only:

```ts
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "600", "800"],
});
```

Add `archivo.variable` to the `<html>` and `<body>` className lists **alongside**
the existing Inter/Jakarta variables. Do **not** remove them — the rest of the
app still uses them. Do **not** change `ThemeProvider` in this plan (see §10).

### Step 6 — `src/app/page.tsx`

Replace the `LandingHub` import and its single usage with `ModernistLanding`.
The `claudeEnabled` prop is no longer needed — the new design has no Claude-track
card, so drop the `isClaudeEnabled()` import **only if nothing else in the file
uses it**. Leave the auth/redirect block byte-for-byte unchanged.

### Step 7 — `src/components/shared/app-footer.tsx`

Add a `const isLanding = pathname === "/";` alongside the existing route flags and
include it in the `return null` condition at line ~147. The new page ships its own
footer; without this there are two.

### Step 8 — `docs/design-system.md`

Copy `handoff/design-system.md` in, changing only the §2 color table and the
accent-ramp prose to the shipped `#7C5CFF` values. Leave layout laws, component
contracts, patterns and copy voice verbatim.

---

## 7. Guardrails for Cursor (DO NOT)

- **DO NOT** put the Modernist tokens on `:root` or in `src/app/globals.css`.
  They are scoped to `.modernist-landing`. Leaking them restyles every screen in
  the product.
- **DO NOT** touch anything in `src/components/ui/`. Retheme through tokens.
- **DO NOT** use `<Button asChild>` or `<Button render={<Link>}>`. `buttonVariants`
  on `<Link>`, per the standing repo rule.
- **DO NOT** round a corner, centre a heading or a button label, or soften a 2px
  rule to 1px. All three are explicit design-system violations.
- **DO NOT** add `dark:` variants or a `.dark` block. This design is light-only.
- **DO NOT** add a second accent hue, a gradient, a glass effect, or a decorative
  drop shadow.
- **DO NOT** use `--m-accent` (the 500 step) for paragraph-size text — it measures
  ~3.8:1. Body-size accent text uses `--m-accent-700`.
- **DO NOT** port the `.dc.html` scroll-container ancestor walk. Listen on `window`.
- **DO NOT** add `"use client"` to `landing-page.tsx`. Only the nav and the consent
  card are client components.
- **DO NOT** create files beyond the eight listed in §4. No helper/util/constants
  module for this page — inline it.
- **DO NOT** delete `landing-hub.tsx`, `track-card.tsx`, `progress-dots.tsx`, or
  `slides/` in this pass.
- **DO NOT** copy `_ds_bundle.js`, `support.js`, or any `<x-dc>` / `<sc-if>` /
  `{{ }}` syntax into the repo. That is design-canvas runtime, not app code.
- **DO NOT** change the redirect logic in `page.tsx`.

---

## 8. DB safety

Not applicable — no schema, migration, or data change.

---

## 9. Verification

1. `npx tsc --noEmit` clean; `npm run build` succeeds.
2. Logged out, visit `/`:
   - full-bleed nav at rest; condenses to a centred pill after ~24px of scroll
   - one footer, not two
   - no bottom nav bar
   - background modular grid visible behind sections
   - every corner square; every section seam 2px
3. Consent card: toggle shows/hides identity; evidence rows stay `visible`
   throughout; identity animates in on each toggle.
4. FAQ `<details>` open/close with a `+` → `−` marker, no browser chevron.
5. Resize to 900px, 760px, 420px: bridge stacks with rotated arrows, nav collapses
   to the Menu panel, stats go 2-col then 1-col.
6. Keyboard: tab through nav → CTAs → consent toggle → FAQ summaries. Focus ring
   visible on each. Toggle menu with Enter, confirm `aria-expanded` flips.
7. `prefers-reduced-motion: reduce`: no transitions run.
8. **Regression — the part most likely to break:** visit `/dashboard`,
   `/program`, `/hackathon`, `/talent`, `/marketplace`. Confirm none of them
   picked up square corners, the grid background, or Modernist colors. If any did,
   a token escaped `.modernist-landing`.
9. Logged in with a profile, `/` still redirects to `/dashboard`.
10. `git status` shows exactly the eight files from §4 — nothing else.

---

## 10. Not in this plan

1. **Full-app retheme** → deferred to
   [058](docs/plans/071-modernist-app-retheme.md), confirmed and planned, not
   cancelled. 058 Phase F later collapses this plan's `.modernist-landing` token
   block into the global tokens. Keeping them scoped here is what lets 057 ship
   and revert on its own.
2. **`forcedTheme="light"`** → 058 Phase C. This page is light-only by itself
   because its tokens are scoped and it has no `dark:` variants, so no global
   change is needed to ship it.
3. **Accent hue — settled.** `#7C5CFF` purple, matching the landing file. Phase D
   of 058 confirms the product already leans purple (`#7364E6`, `#968BEC`,
   `#8365E3` appear 130+ times), so this is consistent, not a one-off.
4. **Retiring `LandingHub`.** Left in place; delete once the new page is confirmed
   in production.
5. **`ABTalks Wireframes.dc.html`.** Present in the design project, not imported.
6. **Copy accuracy — open, needs your input.** The design asserts `10k` people,
   `100+` companies, and testimonial quotes attributed to a hiring lead and a 2025
   cohort graduate. The design system's own copy voice rule is *"Numbers are
   stated only when they are real."* **Confirm or replace these before this page
   ships** — they are public marketing claims, not placeholder text.

---

## 11. Commit message

```
feat(landing): Modernist redesign of the logged-out landing page

Replaces LandingHub with the imported Modernist design: flat, zero-radius,
2px rules on a visible modular grid, consent card, and bridge figure.
Tokens are scoped to .modernist-landing so no other surface is affected.
Adds Archivo; hides the shared AppFooter on /.
```

---

## 12. Copy deck (verbatim — transcribed from `ABTalks Landing.dc.html`)

Authoritative. Every visible string on the page is here, in source order. Cursor
copies these exactly and invents nothing.

**Character notes — these are not typos, preserve them:**
- Testimonials use curly double quotes `“ ”` (U+201C/U+201D). Body copy uses
  straight apostrophes (`candidate's`, `I'd`).
- `—` is an em dash (U+2014). `·` is a middot (U+00B7). The FAQ close marker is
  `−` (U+2212 minus), not a hyphen.
- The hero highlight span wraps **`Evidence-based hiring.`** including the period.

### Nav
| Slot | Text |
| --- | --- |
| Brand | `ABTalks` |
| Links | `How it works` · `Hackathons` · `Evidence` · `Privacy` |
| Primary CTA | `Hire from a cohort` |
| Mobile toggle | `Menu` (closed) / `Close` (open) |
| Mobile panel CTAs | `Hire from a cohort`, `Join the next cohort` |

Anchors in order: `#how`, `#hackathons`, `#evidence`, `#privacy`.

### Hero
- Line 1 (struck through, italic serif): `Interview`
- Line 2 (accent-200 highlight): `Evidence-based hiring.`
- Sub: `ABTalks runs hackathons, cohorts and challenges where people build in public. Companies see the work, not a rehearsed answer. We sit in the middle: matching real output to real requirements, and never sharing a profile without the candidate saying yes first.`
- CTAs: `Join the next cohort` (primary), `Post a requirement` (ghost)

### Stats
| Figure | Label |
| --- | --- |
| `10k` | `People on the platform` |
| `100+` | `Companies in the recruiter network` |
| `0` | `Profiles shared without consent` |

> Flagged in §10.6 — confirm these are real before shipping.

### Old signal / ABTalks signal
**Left — kicker `The old signal`**
- Heading: `A 45-minute interview, a resume, and a guess.`
- Body: `Performance under interview conditions is a proxy. It rewards practice at interviewing, filters on pedigree, and tells you almost nothing about how someone works over four weeks with other people.`

**Right — kicker `The ABTalks signal`**
- Heading: `Shipped work, timestamped, reviewed, and attributable.`
- Body: `Every hackathon, cohort sprint and challenge leaves a record: what was built, how it was scored, what the mentors and teammates said. That record is the candidate's, and it travels with their consent.`

### Bridge
- Kicker: `The bridge`
- Heading: `Talent on one side. Requirements on the other.`

**Left cell — kicker `Candidates`**, heading `Make yourself visible by building.`
- `Hackathons — weekend builds, judged and archived`
- `Cohorts — multi-week programs with mentors`
- `Challenges — scoped problems from real companies`

**Centre cell (accent field)** — kicker `The bridge`, title `ABTalks`
- `We run the programs, score the work, and match evidence to requirements. Profiles move only when the candidate releases them.`

**Right cell — kicker `Companies`**, heading `Hire from proof, or commission it.`
- `Browse candidates by what they shipped`
- `Send us the role and the skills you need`
- `We build a cohort against that requirement`

### Privacy (`#privacy`)
**Panel — kicker `Consent first`**
- Heading: `We do not share a candidate's profile until they allow us to.`
- Body: `No profile, contact detail or project record leaves ABTalks without an explicit release from the person it belongs to. Companies see anonymised evidence first — the work, the scores, the review notes. The name arrives only after the candidate says yes to that company, for that role. Consent is per-request, and it can be withdrawn at any time.`

**Consent card** — header `What a company sees`

| | withheld (default) | released |
| --- | --- | --- |
| State badge | `Awaiting consent` | `Released by candidate` |
| Identity name | `Candidate #4128` | `Meera Raghavan` |
| Identity meta | `Frontend & product · cohort 14` | `Bengaluru · available from September` |
| Contact value | `hidden until approved` | `shared` |
| Button | `Request access` | `Withdraw access` |
| Note | `The request goes to the candidate, not to us.` | `Meera approved this company, for this role.` |

Evidence rows — **always `visible`, in both states:**
- `Submitted work — 3 projects` → `visible`
- `Rubric score — cohort 14` → `visible`
- `Mentor review notes` → `visible`
- `Name, contact, employer` → the contact value above (the only row that changes)

### How it works (`#how`) — kicker `How it works`
**01 — `A requirement comes in`**
`A company tells us the role, the stack, the level and the timeline. If a matching cohort is already running, we point at it. If not, we design one around the requirement.`

**02 — `People build in the open`**
`Candidates enter a hackathon, cohort or challenge. Work is submitted, reviewed by mentors and scored against a published rubric — the same rubric for everyone in the room.`

**03 — `The candidate releases the profile`**
`We show the company the evidence without the identity. When there is genuine interest on both sides, the candidate approves the release and the conversation starts — already past the screening stage.`

### Evidence (`#evidence`)
- Kicker: `What a profile actually contains`
- Heading: `Four kinds of evidence, none of them self-reported.`

| Cell | Body |
| --- | --- |
| `Submitted work` | `Repositories, demos and write-ups, timestamped to the event they were built in.` |
| `Rubric scores` | `How the work was judged, on criteria published before the event started.` |
| `Mentor review` | `Written notes from the people who watched the work happen, not a reference call.` |
| `Team signal` | `How they worked with others under a deadline — collaboration, scoped honestly.` |

### Programs (`#hackathons`)
- Kicker: `Open right now`
- Heading: `Something is always running. Come build in it.`
- Ghost CTA, top right: `See the full calendar`

| Tag | Title | Body | Cadence line |
| --- | --- | --- | --- |
| `Hackathon` (accent tag) | `48-hour build weekend` | `Ship something end-to-end with a team you meet on Friday night. Judged Sunday, archived to your profile.` | `Opens monthly · applications open` |
| `Cohort` (outline tag) | `Six-week mentored cohort` | `Built around a live requirement from a hiring partner, so the work you do is the work they need done.` | `Rolling intake · limited seats` |
| `Challenge` (outline tag) | `Scoped company challenge` | `A real problem, a clear brief, a week to answer it. Do it on your own schedule, from anywhere.` | `Always open · start any day` |

### Testimonials — kicker `From both sides of the bridge`
1. `“We saw four weeks of her work before we ever spoke to her. The interview was a conversation, not a test.”`
   — attribution: `— Hiring lead, product engineering team`
2. `“I'd been rejected on my resume a dozen times. Here they looked at what I built, and I chose who got to see it.”`
   — attribution: `— Cohort graduate, hired in 2025`

> Flagged in §10.6 — confirm or replace before shipping.

### FAQ (`#faq`) — kicker `Questions people ask us`
1. `Does it cost anything to join a cohort?`
   `Taking part is free for candidates. Companies pay us when they hire, so nobody is ever charged for the chance to be seen.`
2. `What exactly do companies see before I consent?`
   `The work and the scores, with your name, contact details and employer hidden. They can ask for access; you decide whether to grant it, company by company.`
3. `Do I need to be a student or a developer?`
   `No. Cohorts run across engineering, design, data and product. Some people are in their first year of college, some are ten years into a career and want a different door.`
4. `We have a niche requirement. Can you build a cohort for it?`
   `Yes — that is the normal way we work with companies. Send us the role, the stack and the timeline, and we design the challenge and recruit the cohort around it.`

### Poster band
- Line 1: `Stop guessing in interviews.`
- Line 2: `Hire what you have already seen.`
- CTAs (both ghost, inverted to `--m-bg`): `Post a requirement`, `Join the next cohort`

### Footer
- Left: `ABTalks — evidence-based hiring`
- Right: `Profiles are shared only with candidate consent.`

### CTA destinations (not in the design — the design has inert `<button>`s)
The design ships every CTA as a bare `<button type="button">` with no target.
These are the repo's routes; confirm before shipping:

| Label | → |
| --- | --- |
| `Join the next cohort` | `/register` |
| `Hire from a cohort` | `/talent` |
| `Post a requirement` | `/talent` |
| `See the full calendar` | `/hackathon` |
