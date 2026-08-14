# 058 — Modernist retheme, whole app

## 1. Goal

Promote the Modernist design system from the landing page (plan 057) to the
product surface: dashboard, challenge, program, hackathon, talent, workshop,
marketplace, admin. Zero radius, mono purple accent on warm off-white, 2px rules,
light-only.

**This is not a one-commit token swap.** The measured surface is below; the work
is phased so each phase ships and reverts independently.

---

## 2. Measured surface (run 2026-08-10, `src/`, 304 `.tsx` files)

| Signal | Count | Responds to a token change? |
| --- | --- | --- |
| `rounded-*` occurrences | 720 across 210 files | **509 yes** — derived from `--radius` |
| └ of which `rounded-full` | 211 | **No** — Tailwind hardcodes it |
| Hardcoded hex in `className` | 436 | **No** — manual, per file |
| `dark:` variants | 159 across 48 files | **No** — manual |
| `hsl(var(--…))` consumers | 33 in `globals.css` + 11 in 4 source files | see §3 |

210 of 304 component files carry a radius. This is a program of work, not a patch.

The good news: **one line — `--radius: 0px` — clears 509 of the 720.** The radius
scales are already derived (`--radius-sm: calc(var(--radius) * 0.6)` …
[globals.css:52-58](src/app/globals.css:52)), so Phase A does most of the shape work.

---

## 3. The trap that would break the app

`handoff/globals.theme.css` says: *"Paste into `src/app/globals.css`, replacing
the existing `:root` / `.dark` token blocks."*

**Do not do that.** This repo stores tokens as **bare HSL triplets**
(`--background: 38 38% 98%`) and wraps them at the consumption site
(`--color-background: hsl(var(--background))`). The handoff file stores **hex**
(`--background: #f3f2f2`). Pasting it produces `hsl(#f3f2f2)` — invalid CSS — at
**33 sites in `globals.css` and 11 more across 4 source files**, including 6
alpha-slash forms like `hsl(var(--primary) / 0.20)` that have no hex equivalent.
Every themed color in the product would fail at once.

**Resolution: convert the Modernist palette to HSL triplets and keep the existing
`hsl(var(--x))` architecture.** One token block changes; all 44 consumers keep
working untouched. The conversion is already done — §4.1. Do not restructure
`@theme inline`.

---

## 4. Phase A — Foundation

One commit. Rethemes most of the app on its own.

### 4.1 `src/app/globals.css` `[edit]` — replace the `:root` block (lines 92–130)

Keep every variable **name** and the HSL-triplet **format**. Change only values:

```
--background:            0 4% 95%      /* #f3f2f2 */
--foreground:           20 5% 12%      /* #201e1d */
--card:                  0 22% 96%     /* #f8f4f4 */
--card-foreground:      20 5% 12%
--popover:               0 22% 96%
--popover-foreground:   20 5% 12%
--primary:             252 100% 68%    /* #7c5cff */
--primary-foreground:    0 4% 95%
--secondary:             0 2% 92%      /* #eae9e9 */
--secondary-foreground: 20 5% 12%
--muted:                 0 7% 91%      /* #eae7e7 */
--muted-foreground:      0 2% 37%      /* #605d5d */
--accent:              254 100% 93%    /* #e4dcff — tint, not the brand hue */
--accent-foreground:   254 63% 35%     /* #3a2190 */
--destructive:           8 100% 34%    /* #ae1800 — see note */
--destructive-foreground: 0 4% 95%
--border:               20 5% 12%      /* ink; alpha applied at use site */
--input:                20 5% 12%
--ring:                252 100% 68%
--radius:                0px           /* was 0.625rem — clears 509 rounded-* */
```

Sidebar tokens mirror the same values (`--sidebar` → `0 4% 95%`,
`--sidebar-primary` → `252 100% 68%`, etc.).

Charts go mono — accent ramp then ink steps:
`--chart-1: 252 100% 68%` · `--chart-2: 253 61% 47%` · `--chart-3: 0 2% 37%` ·
`--chart-4: 252 100% 80%` · `--chart-5: 0 3% 72%`.

**`--destructive` deliberately stays red.** The handoff file maps it to the accent
because that system's accent *was* red. In a purple system, a purple "delete"
button is a usability regression — destructive is semantic, not brand. This is a
deviation from `handoff/globals.theme.css`; it is intentional.

**`--border` is bare ink, not the 40% divider.** The `@theme inline` layer applies
`hsl(var(--border))` with no alpha, so encoding 40% here would double-apply
wherever a component already uses `border-border/40`. Set the divider as its own
token — `--divider: 20 5% 12%` used as `hsl(var(--divider) / 0.4)`.

### 4.2 Add the Modernist ramps to `@theme inline` `[edit]`

Append alongside the existing mappings so `bg-ink-700` / `text-accent-700` exist
as utilities. Values from §4.1's ramps:

- ink: `100 0 22% 96%` · `200 0 7% 91%` · `300 0 5% 84%` · `400 0 3% 72%` ·
  `500 0 2% 60%` · `600 0 2% 48%` · `700 0 2% 37%` · `800 0 2% 26%` · `900 0 2% 17%`
- accent: `100 252 100% 97%` · `200 254 100% 93%` · `300 253 100% 88%` ·
  `400 252 100% 80%` · `500 252 100% 68%` · `600 253 77% 58%` ·
  `700 253 61% 47%` · `800 254 63% 35%` · `900 252 57% 24%`

### 4.3 Ground, focus, selection `[edit]` — `@layer base` in `globals.css`

Add the 96px modular grid to `body` (both repeating-linear-gradients at 5% / 3.5%
ink, `background-attachment: fixed`), `:focus-visible { outline: 2px solid
hsl(var(--primary)); outline-offset: 2px }`, and
`::selection { background: hsl(var(--accent)); color: hsl(var(--foreground)) }`.

Add the `.rule2`, `.kicker`, `.lattice`, `.shell`, `.poster` component classes
from `handoff/globals.theme.css` §`@layer components`, converted to `hsl(var(…))`.

### 4.4 `src/app/layout.tsx` `[edit]`

Archivo (400/600/800) as `--font-archivo`; point `--font-sans` **and**
`--font-heading` at it. Remove Inter and Plus_Jakarta_Sans **only after** Phase D,
since hardcoded font references may still exist — until then, load all three.

> If plan 057 already added Archivo, this step is a no-op.

### Phase A verification

`npm run build`; then walk `/dashboard`, `/challenge`, `/program`, `/talent`,
`/admin`, `/profile`, `/quiz`. Expect: square corners nearly everywhere, purple
primary, warm ground, grid texture. Expect **still broken**: pill shapes
(`rounded-full`), any hardcoded-hex surface, dark mode. Those are Phases B–D.

---

## 5. Phase B — `rounded-full` sweep (211 occurrences)

Not token-driven; Tailwind compiles `rounded-full` to
`calc(infinity * 1px)`. Distribution: program 14 files, workshop 10, admin 9,
dashboard 8, shared 6, hackathon 6, claude 5, ui 4, talent-hunt 4, talent 4,
landing 4, profile 2.

The design system says *"zero corner radius anywhere"* and *"Don't round any
corner"* — so avatars, badges and progress dots become squares.

**Do not** blanket-override `.rounded-full { border-radius: 0 }` in `globals.css`.
It hides the change from grep and defeats the next person. Replace per file.

**Three exceptions to raise before sweeping** — circular geometry, not decoration:
1. Radial progress / ring indicators, where a square breaks the shape.
2. Spinner elements.
3. Any `rounded-full` on an element that is also `overflow-hidden` around a
   circular crop.

List them and confirm before changing; everything else goes square.

---

## 6. Phase C — Retire dark mode (159 occurrences, 48 files)

The system is light-only: *"Modernist has no dark mode — do not synthesise one.
If dark ever ships, it gets designed, not inverted."*

1. `layout.tsx` — `ThemeProvider` gets `forcedTheme="light"`; drop `enableSystem`
   and `defaultTheme="system"`.
2. `src/components/theme-toggle.tsx` — remove the component and every usage.
   Grep for `<ThemeToggle` first; it is likely mounted in more than one nav.
3. `globals.css` — delete the `.dark` block (lines 132–169). Keep
   `.dark { color-scheme: light }` as a guard against a stale `class="dark"`
   persisted in a returning user's `localStorage`.
4. Strip the 159 `dark:` variants across the 48 files.
5. `.report-light` (lines 172–187) — this existed to force light on `/r/[token]`
   while the app was dark-capable. Once the app is light-only it is dead weight;
   delete it and its usage in the `/r` route.

---

## 7. Phase D — Hardcoded hex sweep (436 occurrences)

By area: hackathon 24 files, program 14, marketplace 6, shared 2, `r` 1.

The most frequent values are an **existing purple system** — `#7364E6` (54),
`#968BEC` (50), `#8365E3` (26), `#C4B5FD` (18), `#A78BFA` (18), `#403880` (13).
This is why the landing was rethemed purple; the product already leans that way.
Map them onto the accent ramp rather than inventing new values:

| Existing | → token |
| --- | --- |
| `#7364E6`, `#8365E3` | `accent-500` / `accent-600` |
| `#968BEC`, `#A78BFA` | `accent-400` |
| `#C4B5FD` | `accent-300` |
| `#403880` | `accent-800` |
| `#BCBCBC`, `#9CA3AF`, `#A2A2A2`, `#E9E9E9` | ink ramp by lightness |

Greys (`#BCBCBC` 33, `#9CA3AF` 11, `#A2A2A2` 8, `#E9E9E9` 14) map to the ink ramp
by nearest lightness. `#d99c2c` (7) is an amber with no home in a mono palette —
flag it; it is probably a "pending"/"warning" state that needs a semantic token,
not an accent step.

Do this per track, one commit each, so a regression is bisectable.

---

## 8. Phase E — The dark-by-design tracks (**decision required**)

`MainShell` hardcodes full-page dark grounds
([main-shell.tsx](src/components/shared/main-shell.tsx)):

- `/marketplace` → `bg-[#030712]`, plus a `marketplace-page` body class
- `/hackathon` → `bg-black`

with supporting darks `#110528`, `#050C1D`, `#1e3a5f`. These are not screens that
drifted from the system — they are **deliberately dark, branded track surfaces**.

A light-only Modernist theme cannot absorb them by swapping tokens. Three options:

1. **Redesign both to light Modernist.** Truest to the system, and the largest
   piece of work in this entire plan — two complete track surfaces.
2. **Keep them dark as sanctioned exceptions.** Scope their tokens the way plan
   057 scopes the landing, and record them in `docs/design-system.md` as
   documented deviations. Cheapest, and honest.
3. **Design a dark Modernist variant.** The system explicitly forbids inverting,
   but permits a designed dark mode. Largest scope, best long-term.

**Recommendation: (2) for now, (1) per track when each is next touched.** Do not
let a retheme silently flatten two branded surfaces.

Marketplace and hackathon are excluded from Phases B–D until this is settled.

---

## 9. Phase F — Collapse the landing's scoped tokens

Once Phase A lands, plan 057's `.modernist-landing` block is duplicating global
tokens. Delete the token block from `src/components/landing/modernist/landing.css`
and let the page inherit; **keep** the craft layer, the media queries, and the
landing-only radial accent wash. Rename `--m-*` references to the global tokens.

Run last. It is the cleanup, not the goal.

---

## 10. Ordering and safety

```
057 (landing, scoped)  →  A (foundation)  →  B (radius)  →  C (dark)  →  D (hex)  →  F (collapse)
                                                                    E (marketplace/hackathon) — gated on §8
```

Ship 057 first and separately: it is self-contained, low-risk, and gives a
production reference for the system before the risky global change. Phase A is
the point of no return for the rest of the app — tag the commit before it.

Each phase is its own commit with its own build + visual check. **Do not combine
phases.** A single "retheme the app" commit touching 210 files cannot be reviewed
or bisected.

---

## 11. Guardrails for Cursor (DO NOT)

- **DO NOT** paste `handoff/globals.theme.css` into `globals.css` verbatim. See §3
  — hex into an HSL-triplet architecture breaks 44 consumers.
- **DO NOT** restructure `@theme inline` from `hsl(var(--x))` to `var(--x)`.
- **DO NOT** blanket-override `.rounded-full` in `globals.css`.
- **DO NOT** fork or edit anything in `src/components/ui/`. Retheme via tokens.
- **DO NOT** make `--destructive` purple.
- **DO NOT** touch `/marketplace` or `/hackathon` in Phases B–D — gated on §8.
- **DO NOT** invent color values. Every replacement comes from the ink or accent
  ramp in §4.2. If nothing fits (e.g. `#d99c2c`), stop and flag it.
- **DO NOT** synthesise a dark variant.
- **DO NOT** combine phases into one commit.
- **DO NOT** remove Inter/Jakarta from `layout.tsx` before Phase D completes.
- **DO NOT** add a second accent hue, a gradient, glass, or a decorative shadow.
- **DO NOT** use `--primary` at paragraph size — it measures ~3.8:1 on the ground.
  Body-size accent text uses `accent-700`.

---

## 12. DB safety

Not applicable — no schema, migration, or data change in any phase.

---

## 13. Verification (per phase)

1. `npx tsc --noEmit` clean; `npm run build` succeeds.
2. Walk every track logged in: `/dashboard`, `/challenge`, `/program`, `/talent`,
   `/admin`, `/profile`, `/quiz`, `/explore`, `/jobs`, `/workshop`.
3. **Contrast gate:** any accent-colored text at 13–16px must use `accent-700`,
   not `accent-500`. This is the violation most likely to ship silently.
4. **Focus gate:** tab through one form per track; the 2px accent ring must be
   visible on every control.
5. Phase C only: clear `localStorage`, load with OS dark mode on, confirm the app
   stays light; then set `class="dark"` by hand and confirm the guard holds.
6. Phase D only: `grep -rn '\[#' src/<track>` returns nothing for the swept track.
7. Charts and heatmaps still legible in mono — the dashboard heatmap is the
   hardest case; check it explicitly.
8. `/r/[token]` recruiter report renders correctly after `.report-light` is removed.

---

## 14. Commit messages

```
refactor(theme): Modernist foundation — tokens, radius 0, Archivo

Converts the Modernist palette to HSL triplets so the existing
hsl(var(--x)) consumers keep working. --radius: 0px clears 509 of 720
rounded-* occurrences. Destructive stays red: semantic, not brand.
```

```
refactor(theme): square the remaining rounded-full surfaces
refactor(theme): retire dark mode — Modernist is light-only
refactor(theme): map <track> hardcoded hex onto the accent/ink ramps
refactor(theme): collapse landing-scoped tokens into globals
```
