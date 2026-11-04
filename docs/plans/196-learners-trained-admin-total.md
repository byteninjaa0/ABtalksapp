# 196 — "Learners Trained" total on the admin side

> Small UI change, no schema change. Branch: `feat/learners-trained-total`
> (from `origin/master` @ `dc4ed87d`). Implemented directly in this session at
> the user's request (exception to the architect-only rule, this change only).
>
> Decisions locked with the user:
> - The admin side shows the full learners-trained figure: platform
>   registrations + learners trained who are not registered on the
>   platform yet.
> - It is labelled **"Learners Trained"**, with no breakdown on screen.
> - It is never labelled as candidates and never added to candidate, filtered,
>   exported or recruiter-facing counts — those stay live database counts.
> - The extra figure is one server env var, `LEARNERS_TRAINED_BASELINE`, so it
>   can be changed or removed without a code change (e.g. as those learners
>   register and the baseline shrinks).

## 1. Goal

Show the total number of learners ABTalks has trained on the admin overview and
the Candidates page, while every candidate count stays a true database count.

## 2. Current behavior

- `src/app/admin/page.tsx` (Server): first `<StatCard>` is "Total Candidates" =
  `data.stats.totalStudents` (`countRegisteredUsers()` via `getOverviewStats()`).
- `src/app/admin/students/page.tsx` (Server): header description
  "Showing X of N matching candidates" where N is a track/domain-filtered count.
- `src/lib/feature-flags.ts`: server env helpers; not imported by `middleware.ts`.

## 3. Files to touch

| Path | Kind | Note |
| --- | --- | --- |
| `src/lib/feature-flags.ts` | `[edit]` | `learnersTrainedBaseline()` — Zod-parsed `LEARNERS_TRAINED_BASELINE`, 0 when unset/invalid |
| `src/app/admin/page.tsx` | `[edit]` | first card: "Learners Trained" = registrations + baseline when baseline > 0 |
| `src/app/admin/students/page.tsx` | `[edit]` | header leads with "N learners trained." when baseline > 0 |
| `.env.example` | `[edit]` | document the variable |
| `docs/plans/196-learners-trained-admin-total.md` | `[new]` | this file |

## 4. Server vs Client

| Component | Boundary | Notes |
| --- | --- | --- |
| `AdminHomePage` | Server | reads the helper; passes a number + string label to `StatCard` |
| `AdminStudentsPage` | Server | reads the helper + `countRegisteredUsers()` |
| `learnersTrainedBaseline()` | Server-only | reads `process.env`; never imported by `middleware.ts` |

Nothing new crosses a Server→Client boundary.

## 5. Steps (as implemented)

1. `feature-flags.ts`: `import { z } from "zod"`; add
   `learnersTrainedBaseline()` = `z.coerce.number().int().min(0).safeParse(env ?? "")`,
   returning `0` on failure.
2. `admin/page.tsx`: `const trainedBaseline = learnersTrainedBaseline();` first
   card `label={trainedBaseline > 0 ? "Learners Trained" : "Total Candidates"}`,
   `value={data.stats.totalStudents + trainedBaseline}`. `delta` and `series`
   unchanged (weekly platform registrations).
3. `admin/students/page.tsx`: add `countRegisteredUsers()` (only when the
   baseline > 0, else `Promise.resolve(0)`) to the existing `Promise.all`;
   prefix the description with `` `${registeredTotal + trainedBaseline} learners trained. ` ``.
   `filteredCount`, filters and table unchanged.
4. `.env.example`: document `LEARNERS_TRAINED_BASELINE`.
5. Vercel (user): set `LEARNERS_TRAINED_BASELINE` for Production to the
   agreed baseline and redeploy. The figure then grows with new
   registrations; lower the baseline as those learners sign up.

## 6. Guardrails (DO NOT)

- DO NOT label the figure "candidates", "users", "registered" or "on the platform".
- DO NOT add the baseline to `filteredCount`, domain/track counts, deltas,
  sparklines, CSV exports, analytics, `/hire`, landing page stats or anything a
  recruiter or candidate sees.
- DO NOT create rows or seed data to represent these learners.
- DO NOT use `NEXT_PUBLIC_`; DO NOT import `feature-flags.ts` into `middleware.ts`.
- DO NOT change any Prisma query or `StatCard` itself.

## 7. DB safety

Not applicable — no schema, migration or data change.

## 8. Verification

1. Unset → `/admin` shows "Total Candidates" with the registration count;
   `/admin/students` header unchanged.
2. `LEARNERS_TRAINED_BASELINE=1000` → `/admin` first card "Learners Trained"
   = registrations + 1,000; `/admin/students` header starts "N learners trained."
   and the "Showing … of … matching candidates" count still changes with filters.
3. `abc` / `-5` → same as unset.
4. `npx tsc --noEmit` and `npx eslint` on the changed files pass; `npm run build`
   on Vercel preview.
5. Changed files: the five in §3, nothing else.

## 9. Commit message

```
feat(admin): "Learners Trained" total on admin overview + candidates (plan 196)

Adds LEARNERS_TRAINED_BASELINE (server-only, default off). When set, the first
admin card reads "Learners Trained" = registrations + baseline, and the
Candidates header leads with the same figure. Candidate, filtered, exported
and recruiter-facing counts are unchanged.
```
