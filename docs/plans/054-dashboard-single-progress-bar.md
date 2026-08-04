# 054 — Dashboard Day card: single progress bar

> Pure UI fix. No schema, no deps. One file. Branch optional:
> `git checkout -b fix/dashboard-single-progress-bar`

## 1. Goal

On `/dashboard`, the "Day X of 60" stat card currently shows **two** stacked progress bars. Convert it to a **single** progress bar by fixing the incorrect `Progress` composition — nothing else on the dashboard should change.

## 2. Current behavior

- Route: `src/app/dashboard/page.tsx` (Server Component).
- Stat grid has a Calendar card (~lines 502–525) labeled `Day {currentDay} of {totalDays}`.
- Progress percent is already correct:

```tsx
const progressPct = Math.min(
  100,
  Math.round((enrollment.currentDay / enrollment.totalDays) * 100),
);
```

- The card renders nested `ProgressTrack` / `ProgressIndicator` as children of `Progress`.
- `src/components/ui/progress.tsx` **always** appends its own track inside `Progress`, so children + default track = **two bars** (with `gap-3` between them). This is a usage bug, not two intentional metrics.

## 3. Files to touch

- `docs/plans/054-dashboard-single-progress-bar.md` `[new]` — this plan.
- `src/app/dashboard/page.tsx` `[edit]` — Day card `Progress` usage + unused imports.

**Do not touch:** `src/components/ui/progress.tsx` (shadcn primitive — project rule: do not modify), data layer, heatmap card, other stat cards, schema, env.

## 4. Server vs Client

- `dashboard/page.tsx` stays a **Server Component**.
- `Progress` remains a client primitive imported into the server page (existing pattern). No new client components, no new Server→Client props.

## 5. Steps

1. In `src/app/dashboard/page.tsx`, change the Day card progress markup from nested tracks to self-contained Progress:

```tsx
<div className="mt-4">
  <Progress value={progressPct} />
  <p className="mt-2 text-xs text-muted-foreground">
    Calendar progress (IST) from your start date
  </p>
</div>
```

2. Update the import at the top of the same file — remove unused `ProgressTrack` and `ProgressIndicator`:

```tsx
import { Progress } from "@/components/ui/progress";
```

3. Leave `progressPct`, caption text, card layout, Calendar icon, and all other dashboard sections unchanged.

## 6. Guardrails for Cursor (DO NOT)

- Do NOT edit `src/components/ui/progress.tsx`.
- Do NOT change how `progressPct` is calculated.
- Do NOT add a second progress metric (e.g. daysCompleted bar) — user asked for a single bar.
- Do NOT refactor the stat grid, heatmap, or Today's Task card.
- Do NOT add new files/abstractions under `src/`.
- Do NOT touch middleware, auth, schema, or env.
- Do NOT edit `CLAUDE.md` or `docs/project-context.md`.
- Do NOT append to `docs/CHANGELOG.md` (cosmetic UI fix only).

## 7. DB safety

None — no schema or data changes.

## 8. Verification

1. Open `/dashboard` as an enrolled user whose challenge has started.
2. On the Calendar/"Day X of 60" card: **exactly one** progress bar is visible; fill width matches `currentDay / totalDays`.
3. Caption under the bar still reads: `Calendar progress (IST) from your start date`.
4. Other three stat cards (streak, days completed, referrals) unchanged.
5. `npx tsc --noEmit` (or project typecheck) passes; no unused-import lint on `page.tsx`.
6. Files changed should be only:
   - `docs/plans/054-dashboard-single-progress-bar.md` (plan doc)
   - `src/app/dashboard/page.tsx`

## 9. Commit message

```
fix(dashboard): show a single progress bar on the Day of 60 card
```
