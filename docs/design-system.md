# ABTalks design system

The single source of truth for how ABTalks looks. Product screens (dashboard,
challenge, program, talent, admin) use the tokens in `src/app/globals.css`.
The logged-out homepage is a separate marketing surface. Repo home:
`docs/design-system.md`.

---

## 1. The idea in one paragraph

The product is Inter on a warm off-white ground, indigo primary, derived
corner radius (`--radius: 0.625rem`), and a working dark mode. Cards, pills,
and inputs round from the token scale. Purple is spent on primary actions and
small emphasis, not on body copy.

The product reason for this look: ABTalks sells *evidence over impression*.
The interface should read as a working tool, not a brochure.

---

## 2. Tokens

Tokens live in `src/app/globals.css` as **bare HSL triplets**
(`--primary: 239 84% 67%`) and are wrapped at the consumption site
(`hsl(var(--primary))`). Never paste hex into `:root`.

### Color

| Role | HSL triplet | Use |
| --- | --- | --- |
| `--background` | `38 38% 98%` | Page ground |
| `--foreground` | `224 71% 4%` | Body ink |
| `--card` | `0 0% 100%` | Raised panels |
| `--primary` | `239 84% 67%` | Primary action, focus ring |
| `--muted` | `220 14% 96%` | Subdued fills |
| `--destructive` | `0 72% 51%` | Delete / error (stays red) |
| `--border` | `220 13% 91%` | Default borders |
| `--radius` | `0.625rem` | Source for `rounded-*` |

`.dark` restates the same names for dark mode. Domain colors
(`--color-domains-*`) stay four-hue by design. Leftover `ink-*` /
`accent-*` ramps in `@theme inline` exist so older utilities still resolve;
prefer semantic tokens (`bg-primary`, `text-muted-foreground`) on new work.

### Type

Inter (`--font-inter`) for sans, heading, and display on product screens.
Archivo stays loaded as `--font-archivo` for the unused modernist landing
leftover only.

### Space, radius, elevation

`--radius-sm` … `--radius-4xl` derive from `--radius`. Elevation is
theme-switched via `--elevation-card`, `--elevation-card-hover`,
`--elevation-primary`, `--elevation-pop` (plan 009). Prefer a token shadow
or a border over a one-off drop shadow.

---

## 3. Layout laws (product)

1. Headings flush left on app screens.
2. Page chrome uses existing shells (`AppHeader`, `MainShell`, `AppFooter`).
3. Do not put a modular grid on `body` — that was a Modernist leak.
4. Marketplace (`body.marketplace-page`) and hackathon stay dark branded
   tracks; do not flatten them by swapping global tokens.

---

## 4. Component contracts

The app is shadcn (`base-nova`, Base UI) — do **not** fork the primitives in
`src/components/ui/`. Retheme through tokens.

- **Button** — keep the existing repo rule: `buttonVariants` on `<Link>`,
  never `<Button asChild>`.
- **Focus** — bespoke controls use `.focus-spark`; do not restyle `ui/*`.
- **Icons** — Lucide only, 1.5–2px stroke.

---

## 5. Patterns this product needs

Reusable app patterns (bridge figure, consent card, numbered rows, program
card, stat, kicker) live in feature components. Do not invent a second
accent hue or a second product font.

---

## 6. Copy voice

Warm, plain, and specific. Short declarative sentences. Name the thing the
user gets, then the condition. No hype adjectives, no exclamation marks, no
emoji. Numbers are stated only when they are real. Privacy language is always
active voice with the candidate as the subject: "you decide who sees it",
never "data may be shared".

---

## 7. Do / Don't

**Do:** use Inter and `--radius` on product screens · spend primary on one
action per view · state consent in plain words wherever candidate data
appears · use Lucide icons at interface sizes.

**Don't:** paste hex into `:root` · fork `src/components/ui/` · put
Modernist zero-radius / body-grid / Archivo on the product · edit landing
hub files when changing the app theme · import `@/lib/*` from middleware.

---

## Documented deviations

| Surface | Scope | How it differs |
| --- | --- | --- |
| `/` | `LandingHub` + `src/components/landing/hub/*` | Figma rounded marketing landing (plan 061). Page-scoped `--hub-*` tokens, hub fonts (Inter / Instrument Serif / Gemunu Libre / Jacques Francois), own radius and motion. Do not drive this page from product tokens. |
| `/marketplace` | `MainShell` + `body.marketplace-page` | Near-black ground (`#030712`) |
| `/hackathon` | `MainShell` + hackathon components | `bg-black` shell |

### Also flagged

- Recruiter report gold/navy (`#d99c2c`, `#b9831f`, `#1e3a5f`, `#16293f`, `#fbf6e9`) on `/r/[token]` and `recruiter-pdf.tsx` — print-brand palette. Forced light via `.report-light`.
- Multi-hue status colors on program (greens/reds/ambers/blues for pass/fail/warn).
- Domain colors in `globals.css` (`--color-domains-*`) — intentional four-domain differentiation.
