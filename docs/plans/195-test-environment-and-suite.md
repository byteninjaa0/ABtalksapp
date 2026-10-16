# Plan 195 — Test environment and platform test suite

## 1. Goal

Give Sohail a self-contained environment to exercise the whole platform — all
four tracks plus admin and the hire desk — where candidate, recruiter and admin
sessions coexist in one browser instead of evicting each other, backed by a
local throwaway database that can be reset and re-shaped on demand.

Two problems are being solved: **session collision** (one browser can hold only
one identity today) and **the absence of any test surface** (107 `test:*`
scripts exist, all unit-level; nothing drives the product).

## 2. Current behaviour

**Sessions.** `src/auth.config.ts:179` declares exactly one session cookie,
`authjs.session-token.v2`, host-only with no `domain`. Candidate, recruiter and
admin all authenticate into that single cookie, so signing in at `/hire` evicts
the `/dashboard` session. This is the reported "cookies getting messed up" — it
is structural, not cache corruption.

**Database.** This machine's `.env` and `.env.local` both point `DATABASE_URL`
at Neon host `ep-young-shadow-amawetjy`, which holds ~13k real users. There is
no database on this machine that is safe to seed, mutate and wipe.

**Auth doors that obstruct testing.** `/login` is Google-only in practice;
recruiters need an emailed OTP, and `.env.local` carries a live `BREVO_API_KEY`,
so triggering recruiter OTP from local dev sends real mail.

**What already exists and is worth reusing.**
- Plan 193's preview auto-login (`src/app/preview/enter/route.ts`,
  `src/features/preview/preview-accounts.ts`) — the established pattern for
  "sign in without a door".
- A `password` credentials provider (plan 154, `authorizePassword` in
  `src/lib/email-auth.ts`) that already serves **both** audiences
  (`candidate` / `recruiter`) against scrypt hashes.
- ~20 seed scripts that already build valid object graphs, all keyed to the
  `@abtalks.dev` email suffix, which `db:cleanup:test` wipes.
- `next.config.ts:67` → `allowedDevOrigins: localNetworkHosts()`, which already
  reads an `ALLOWED_DEV_ORIGINS` env var.
- `isOtpDevBypassEnabled()` / `otpDevCode()` in `src/lib/feature-flags.ts`.

**Already done during investigation (environment, not code):**
- Homebrew `postgresql@17` installed and running as a service. *(Docker was the
  chosen option but this machine has no Docker and no container runtime at all;
  native Postgres gives identical isolation and resettability with no Docker
  Desktop install, no admin password, and faster resets.)*
- Role + database `abtalks_test`, `pg_trgm` created, all 99 migrations applied —
  149 tables.

## 3. Design decisions

### 3-A. Session isolation by hostname — zero production auth change

Cookies here are host-only. `*.localhost` resolves to `127.0.0.1` through the
macOS resolver with no `/etc/hosts` entry and no `sudo` (verified via
`dscacheutil`). So each hostname is an independent cookie jar:

| Host | Identity |
| --- | --- |
| `localhost:3100` | candidate |
| `recruiter.localhost:3100` | recruiter |
| `admin.localhost:3100` | admin |
| `program.localhost:3100` | AI-cohort member |
| `hackathon.localhost:3100` | hackathon participant |

Three tabs, three live sessions, **no change to `auth.config.ts`,
`middleware.ts` or any session read.** The alternative — namespacing the session
cookie per side — is a genuine authentication-architecture change and is not
taken here.

Cost: Next 16 blocks `/_next/*` from non-localhost origins, so each host must
appear in `ALLOWED_DEV_ORIGINS`. That is env-only; `next.config.ts` is untouched.

### 3-B. Identity switching reuses the existing `password` provider

`authorizePassword` already accepts an `audience` of `candidate` or `recruiter`
and verifies scrypt hashes. Seeded test accounts get real scrypt passwords
(`prisma/seed.ts:725` already does this), so the test console signs in by
calling the **existing** provider.

**Nothing is added to `src/auth.ts` or `src/auth.config.ts`.** This keeps the
build clear of CLAUDE.md rule 8 (auth changes need review) and of plan 193's
precedent of adding a URL that authenticates.

Preconditions it needs, all set in `.env.test`: `ENABLE_EMAIL_LOGIN=true` and
`ENABLE_RECRUITER_AUTH=true`.

### 3-C. The console is gated three ways, and the DB host is the real gate

`/dev/test-console` can set credit balances and read every identity, so:

1. `process.env.NODE_ENV !== "production"`, **and**
2. `ENABLE_TEST_CONSOLE === "true"`, **and**
3. `DATABASE_URL` host is loopback (`127.0.0.1` / `localhost`).

(3) is the one that matters: a flag mis-set on Vercel cannot defeat it, because
production's `DATABASE_URL` is a Neon host. Failing any check → `notFound()`.

### 3-D. Fixtures compose the existing seeds

The existing seed scripts already know how to build a valid graph across 149
tables. Fixtures therefore **run the real seeds and then apply a parametric
overlay** (day number, streak, credits, submission count) rather than
reconstructing object graphs by hand.

## 4. Files to touch

**New — environment**
- `.env.test` `[new]` — test DB URL, all gates open, no `BREVO_API_KEY`.
- `.claude/launch.json` `[edit]` — add `abtalks-test-env` on port 3100.
- `package.json` `[edit]` — `test:env:*` scripts.
- `.github/CODEOWNERS` `[edit]` — route the new paths to `@byteninjaa0`.

**New — harness (`scripts/test-env/`)**
- `guard.ts` `[new]` — refuses to run unless `DATABASE_URL` is loopback. Every
  other script imports this first.
- `identities.ts` `[new]` — the canonical cast: email, password, role, track, host.
- `bootstrap.ts` `[new]` — migrate → seed content → seed identities → grant admin.
- `reset.ts` `[new]` — drop test-suffix data and re-bootstrap.
- `dev.ts` `[new]` — spawn `next dev -p 3100` with `.env.test` injected as real
  process env (Next does not override pre-set vars, so this wins over `.env.local`).
- `fixtures/index.ts` + one file per track `[new]` — named parametric scenarios.
- `apply-fixture.ts` `[new]` — CLI runner.
- `smoke.ts` `[new]` — route × role sweep reporting status, redirect and errors.

**New — in-app console**
- `src/app/dev/test-console/page.tsx` `[new]` — Server Component, triple-gated.
- `src/app/dev/test-console/console-client.tsx` `[new]` — `"use client"`.
- `src/app/actions/test-console-actions.ts` `[new]` — guarded Server Actions.

**New — Playwright**
- `playwright.config.ts`, `e2e/auth.setup.ts`, `e2e/specs/*.spec.ts` `[new]`.

**Not touched:** `src/auth.ts`, `src/auth.config.ts`, `middleware.ts`,
`next.config.ts`, `prisma/schema.prisma`, and every existing seed (called, not
edited).

## 5. Server vs Client

- `src/app/dev/test-console/page.tsx` — **Server**. Runs the gate, reads the
  identity list and current session, passes plain serialisable data down.
- `console-client.tsx` — **Client**. Buttons and forms only. Receives arrays of
  plain objects (strings/numbers/booleans) — no functions, no icons, no class
  instances across the boundary.
- `src/app/actions/test-console-actions.ts` — **Server Actions**, Zod-validated
  at entry, returning the `{ ok: true, data } | { ok: false, message }` envelope.
- Everything under `scripts/` and `e2e/` is Node, outside the React tree.

## 6. Steps

1. `.env.test` with the loopback DB URL, `LANDING_ONE_PAGER=false`,
   `HIDE_GET_HIRED=false`, `ENABLE_EMAIL_LOGIN=true`,
   `ENABLE_RECRUITER_AUTH=true`, `ENABLE_TEST_CONSOLE=true`, OTP dev bypass,
   `ALLOWED_DEV_ORIGINS` listing every test host, and **no mail credentials**.
2. `scripts/test-env/guard.ts`, then `identities.ts`.
3. `bootstrap.ts` — calls `seedContent()` + `seedTestUsers()` from
   `prisma/seed.ts`, then `prisma/scripts/seed-admin.ts`'s grant, then the
   per-track seeds. **The admin grant is not optional**: `db:seed` sets
   `User.role = ADMIN` but writes no `UserRoleAssignment`, and
   `hasPlatformAdmin` trusts only that row.
4. `dev.ts` launcher + `.claude/launch.json` entry on port **3100** (never 3000,
   so it cannot be confused with the live-DB dev server).
5. Test console page + actions, triple-gated.
6. Fixtures per track + `apply-fixture.ts`.
7. `smoke.ts`.
8. Playwright: `auth.setup.ts` writes one `storageState` per role via the
   password provider; specs per track.
9. `package.json` scripts, CODEOWNERS.

## 7. Guardrails (DO NOT)

- **Do not touch `src/auth.ts`, `src/auth.config.ts` or `middleware.ts`.** The
  design deliberately avoids an auth change; if something seems to need one,
  stop and report rather than editing.
- **Do not put the test console behind `requireAdmin`.** Its gate is the
  env/DB-host check — an admin session is what you use it to *obtain*.
- **Do not let any test-env script run against a non-loopback `DATABASE_URL`.**
  `guard.ts` first, in every entry point, with no override flag.
- **Do not add mail credentials to `.env.test`.** The test env must be unable to
  send real email.
- Do not edit `.env` or `.env.local`.
- Do not modify any existing seed script — call them.
- Do not touch anything under the locked Notifications paths.
- No new abstraction files beyond those listed.
- Port 3100 only.

## 8. DB safety

No schema change and no migration authored. The only database written is the
local `abtalks_test`, created during investigation. Production hosts
(`ep-nameless-term-ams9a5e3`, `ep-young-shadow-amawetjy`) are never addressed:
`guard.ts` rejects any non-loopback host before a client is constructed.

## 9. Verification

- `npm run test:env:bootstrap` completes; identity count matches `identities.ts`.
- Dev server on 3100 serves `/`, `/dashboard`, `/hire`, `/admin`.
- Candidate signed in at `localhost:3100` **and** recruiter at
  `recruiter.localhost:3100` **and** admin at `admin.localhost:3100`, all three
  live at once, each surviving a reload of the others. This is the acceptance
  test for the whole plan.
- `npm run test:env:smoke` reports every route × role.
- `npx playwright test` passes.
- `npx tsc --noEmit` clean.

## 10. Commit message

```
test-env: a local platform test environment with per-host sessions

Adds a self-contained testing environment: a local Postgres database that is
safe to seed and wipe, a seeded cast of candidate / recruiter / admin / program
/ hackathon identities, an in-app test console for switching identity and
re-shaping state, parametric scenario fixtures, a route-by-role smoke sweep and
a Playwright suite.

The session collision is fixed without touching authentication. Cookies here are
host-only and *.localhost resolves to loopback, so each test host is its own
cookie jar: candidate at localhost, recruiter at recruiter.localhost, admin at
admin.localhost — three live sessions in one browser. Identity switching reuses
the existing plan-154 password provider rather than adding one, so auth.ts,
auth.config.ts and middleware.ts are untouched.

The console is gated on NODE_ENV, an explicit flag, and a loopback DATABASE_URL;
the last cannot be defeated by a mis-set flag in a deployed environment. No test
script will run against a non-loopback database, and the test env carries no mail
credentials, so it cannot email a real person.

Plan: docs/plans/195-test-environment-and-suite.md
```
