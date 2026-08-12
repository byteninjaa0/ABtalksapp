# 064 — Program behind-pace uses calendar day, not unlock ceiling

## 1. Goal

Stop marking on-time members as ~4 days behind / at-risk. Pace must compare progress to the cohort **calendar day** (same number as Mission Control “Cohort day”), not the Day-4 **unlock ceiling** (calendar + 3).

## 2. Current behavior

`getBehindByDays` uses `getCalendarDerivedMaxContentDay(getCohortCalendarDay(...))` → expected = calendar + 3. At-risk when `behindBy > 2`. A member on calendar 12 with progress 11 gets behindBy 4 and `behind_pace`.

## 3. Files to touch

| Path | Change |
|------|--------|
| `docs/plans/064-program-behind-pace-calendar.md` | `[new]` this plan |
| `src/features/program/progression.ts` | `[edit]` `getBehindByDays` + comment cleanup |
| `src/features/program/recommendations.ts` | `[edit]` prompt uses calendar day |
| `docs/CHANGELOG.md` | `[edit]` one pending-reconcile line |

## 4. Server vs Client

All server-only feature modules. No Client boundary changes.

## 5. Steps

1. Change `getBehindByDays` to `expected = getCohortCalendarDay(cohort)`.
2. Update unlock / calendar / behind comments (drop stale “Texas”).
3. In `recommendations.ts`, `expectedDay = calendarDay`; remove unused `getCalendarDerivedMaxContentDay` import.
4. CHANGELOG line; `npx tsc --noEmit`.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** change `getCalendarDerivedMaxContentDay` / `getMaxContentDay` unlock math.
- **DO NOT** change at-risk threshold (`behindBy > 2`).
- **DO NOT** edit schema, UI copy, `CLAUDE.md`, or `docs/project-context.md`.
- **DO NOT** edit the Cursor plan file in `.cursor/plans/`.

## 7. DB safety

None.

## 8. Verification

- Calendar 12, progress 11 → behindBy 1, not at-risk.
- Calendar 12, progress 12 → behindBy 0.
- Calendar 12, progress 8 → behindBy 4, at-risk.
- Unlock on calendar day 1 still allows content through day 4.

## 9. Commit message

```
fix(program): measure behind-pace against calendar day not unlock ceiling
```
