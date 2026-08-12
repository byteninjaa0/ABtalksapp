# 063 — Program day TZ: Chicago → IST so cohort day matches today's mission

## 1. Goal

Fix Mission Control showing **Cohort day 13** while **Today's Mission** is **Day 12** by switching program day boundaries back to IST (`Asia/Kolkata`) for the global cohort and making admin start/end datetimes round-trip in that same zone.

## 2. Current behavior

- `PROGRAM_TZ` is `"America/Chicago"` (`src/features/program/constants.ts`).
- `getCohortCalendarDay` formats `startsAt` / now in Chicago → dashboard **Cohort day**.
- Today's Mission is the first `AVAILABLE` content day (`src/features/program/dashboard.ts`).
- Admin form labels/formats **IST** but saves with `new Date(naive)` (UTC on Vercel), so Chicago `startKey` is often one civil day early → cohort day inflated by 1.

## 3. Files to touch

| Path | Change |
|------|--------|
| `docs/plans/063-program-day-tz-ist-fix.md` | `[new]` this plan |
| `src/features/program/constants.ts` | `[edit]` `PROGRAM_TZ = "Asia/Kolkata"` |
| `src/app/actions/admin-program-actions.ts` | `[edit]` `fromZonedTime(..., PROGRAM_TZ)` for starts/ends |
| `src/app/admin/program/page.tsx` | `[edit]` `toDatetimeLocal` uses `PROGRAM_TZ` |
| `src/features/program/admin.ts` | `[edit]` engagement buckets use `PROGRAM_TZ` |
| `docs/CHANGELOG.md` | `[edit]` one pending-reconcile line |

`src/components/program/program-cohort-panel.tsx` — labels already say IST; no edit once TZ is IST.

## 4. Server vs Client

- `admin-program-actions.ts` — Server Action.
- `admin/program/page.tsx` — Server Component.
- `admin.ts` — server-only feature module.
- No new Client props; no functions across the boundary.

## 5. Steps

1. Set `PROGRAM_TZ` to `"Asia/Kolkata"`; update the comment (no longer Texas/US Central).
2. In `createOrUpdateCohortAction`, import `fromZonedTime` and `PROGRAM_TZ`; set `startsAt`/`endsAt` via `fromZonedTime(parsed.data.startsAt, PROGRAM_TZ)` (same for ends).
3. In admin overview `toDatetimeLocal`, import `PROGRAM_TZ` and use `formatInTimeZone(d, PROGRAM_TZ, "yyyy-MM-dd'T'HH:mm")`; drop the `IST` import from that page.
4. In `admin.ts` daily engagement loops, replace `IST` with `PROGRAM_TZ` for `formatInTimeZone` keys; keep `formatDateTimeIST` for human-readable overview strings (same zone once `PROGRAM_TZ` is IST).
5. Append one CHANGELOG line under Pending reconcile.
6. Run typecheck/build.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** change schema, migrations, or seed data.
- **DO NOT** edit `CLAUDE.md` or `docs/project-context.md`.
- **DO NOT** fix videos Day-4 lock, pre-start clamp, or admin member day-state calendar gate (out of scope).
- **DO NOT** invent a new date helper file; use `fromZonedTime` / `formatInTimeZone` + `PROGRAM_TZ`.
- **DO NOT** touch middleware or edge imports.
- Keep middleware edge-safe (no `@/lib/*` in middleware path).

## 7. DB safety

No schema or data migration. Existing `startsAt`/`endsAt` instants are reinterpreted under IST for calendar keys (intended). New saves use proper IST wall-clock via `fromZonedTime`.

## 8. Verification

- After deploy/switch: for a member on Day 12 AVAILABLE with prior Chicago “13”, Cohort day should read **12** and match Today's Mission.
- Admin: set cohort start `00:00`, save, reload — field still shows `00:00` (not +5:30).
- `npx tsc --noEmit` passes.
- Files changed: only those in §3.

## 9. Commit message

```
fix(program): use IST day boundaries so cohort day matches today's mission
```
