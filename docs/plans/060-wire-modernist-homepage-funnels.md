# 060 — Wire modernist homepage funnels

## 1. Goal

Connect the shipped Modernist landing CTAs and program lattice to the real public entry points (`/program`, `/hackathon`, `/challenges`, `/login`, `/talent`) so logged-out visitors can reach the right funnel without dead ends or the wrong track.

## 2. Current behavior

- [src/app/page.tsx](src/app/page.tsx) already renders `<ModernistLanding />` for logged-out users; logged-in redirects are correct and stay untouched.
- Primary candidate CTA copy says “Join the next cohort” but hrefs still point at [/register](src/app/register/page.tsx) (60-day challenge form).
- Program lattice cards in [landing-page.tsx](src/components/landing/modernist/landing-page.tsx) (`PROGRAMS`) are inert `<div>`s.
- Nav has no Sign in; Hire/Post still correctly target `/talent` (middleware adds `?from=`).
- [/register](src/app/register/page.tsx) does a bare `redirect("/login")` if reached without session (middleware usually sets `from` first; fix as defense-in-depth).
- Consent card stays a local demo — no backend.

**Decisions locked:** cohort CTA → `/program`; full pass includes Sign in + program deep-links.

## 3. Files to touch

| Path | | Note |
| --- | --- | --- |
| [src/components/landing/modernist/landing-page.tsx](src/components/landing/modernist/landing-page.tsx) | `[edit]` | Cohort CTAs → `/program`; add `href` on `PROGRAMS`; wrap program cells in `Link` |
| [src/components/landing/modernist/landing-nav.tsx](src/components/landing/modernist/landing-nav.tsx) | `[edit]` | Cohort CTA → `/program`; add Sign in → `/login` (desktop + mobile) |
| [src/app/register/page.tsx](src/app/register/page.tsx) | `[edit]` | Unauthed redirect → `/login?from=/register` (preserve query if present) |
| [docs/plans/060-wire-modernist-homepage-funnels.md](docs/plans/060-wire-modernist-homepage-funnels.md) | `[new]` | This plan on disk |

No new React components. Auth tree in `page.tsx` unchanged. Consent untouched. Old `LandingHub` left on disk.

## 4. Server vs Client

- `ModernistLanding` — Server; continues using string `href`s on `Link` (no functions across boundary).
- `LandingNav` — Client; same string hrefs.
- `register/page.tsx` — Server; redirect string only.

## 5. Steps

1. **Program href map** — extend `PROGRAMS` with `href`:
   - Hackathon → `/hackathon`
   - Cohort → `/program`
   - Challenge → `/challenges`
2. **Program lattice** — wrap each lattice cell in `<Link href={program.href} className="lattice-cell" …>` (keep existing cell styles; whole card clickable). Do not invent new card chrome.
3. **Cohort CTAs** — replace every `href="/register"` labeled “Join the next cohort” in `landing-page.tsx` (hero + poster) and `landing-nav.tsx` (mobile) with `href="/program"`. Leave Hire / Post a requirement on `/talent`. Leave “See the full calendar” on `/hackathon`.
4. **Sign in** — in `LandingNav`, add ghost `Link` to `/login` labeled `Sign in` on desktop (beside Hire) and in the mobile panel (below Join).
5. **Register handoff** — in `register/page.tsx`, change unauthed branch from `redirect("/login")` to `redirect("/login?from=/register")` (if `domain`/`ref` search params exist, append them into the `from` value so middleware-equivalent intent is preserved, e.g. `from=/register?domain=AI`).
6. Write this plan file as `docs/plans/060-wire-modernist-homepage-funnels.md`.

## 6. Design conformance

- Reuses existing Modernist nav buttons and program lattice; no new pattern.
- Tokens/classes unchanged (`btn`, `btn-primary`, `btn-ghost`, `lattice-cell`).
- Accent spend unchanged (poster band only).
- No radius, centered headings, hairlines, `dark:`, or second font.

## 7. Guardrails for Cursor (DO NOT)

- Do not change logged-in redirect logic in `page.tsx`.
- Do not wire `ConsentCard` to any API or talent-pool release.
- Do not delete `LandingHub` / onboarding slides.
- Do not retarget Hire/Post away from `/talent`.
- Do not point “Join the next cohort” at `/register` or `/program/apply` (land on public `/program`; apply CTA lives there).
- Do not add a feature flag or new abstraction file.
- Do not edit `CLAUDE.md`, `docs/project-context.md`, middleware, or Prisma.
- Do not invent marketing copy changes beyond href/link wiring.

## 8. Verification

Manual:
- Logged out `/` → Join → `/program`; Hire → login bounce with `from` under `/talent`; Sign in → `/login`.
- Program cards → `/hackathon`, `/program`, `/challenges`.
- Direct `/register` while logged out → `/login?from=…register…`.
- Logged in with profile still skips landing → `/dashboard`.

Checks: `npx tsc --noEmit` and `npm run build` pass. Only the three source files above (+ plan doc) should change.

## 9. Commit message

`Wire modernist landing CTAs to program, login, and track pages`
