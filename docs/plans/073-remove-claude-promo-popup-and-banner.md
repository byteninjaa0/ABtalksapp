# 073 — Remove the Claude promo popup and enrollment ribbon

## 1. Goal
Stop showing the Claude Challenge promotional modal and the "Master Claude AI in
60 Days" ribbon to users. Members who sign up for Software Engineering, AI, or
Data Science currently get an unsolicited full-screen popup on `/dashboard` and a
persistent ribbon above the dashboard heading/heatmap on four pages. Remove both
surfaces everywhere.

## 2. Current behavior

**The popup** — `ClaudeChallengeModal` (`src/components/dashboard/claude-challenge-modal.tsx`).
Mounted on `/dashboard` only. On mount it reads `sessionStorage["claude-modal-dismissed-session"]`;
if unset, it opens itself after an 800ms timer. It also listens on `window` for
the `claude-challenge-modal-open` custom event so the ribbon's "Learn More"
button can re-open it. "Register Now" calls the `enrollInClaudeChallenge` Server
Action.

**The ribbon** — `ClaudeEnrollmentBanner` (`src/components/shared/claude-enrollment-banner.tsx`).
Rendered directly under `<AppHeader />` on:
- `src/app/dashboard/page.tsx` — three separate return branches (ABANDONED at
  line ~233, pre-start at ~274, normal at ~345), each with `useSharedModal`
- `src/app/challenge/[day]/page.tsx` — inside `ChallengePageShell` (line ~64), so
  it appears on every branch of that page
- `src/app/profile/page.tsx` — two branches (~90 and ~149)
- `src/app/students/[id]/page.tsx` — one (~80)

When `useSharedModal` is false the banner mounts its own copy of
`ClaudeChallengeModal` with `forceOpen`.

**The gate** — `shouldShowClaudeBanner` (`src/features/user/check-claude-enrollment.ts`).
Returns `{ show: true, startsAt }` for any signed-in user who has no CLAUDE
enrollment and where a CLAUDE challenge row with a `startsAt` exists. This is
why every SE / AI / DS signup sees it. Each page wraps the call in
`isClaudeEnabled()` and falls back to `{ show: false, startsAt: null }`.

**Why not just flip the flag.** `ENABLE_CLAUDE_CHALLENGE` also gates the CLAUDE
track card on the landing hub, the CLAUDE card in `/explore`, the CLAUDE option
in the registration domain picker, `/claude-signup`, and the CLAUDE tab in the
community leaderboard. Setting it to `false` would remove the entire track, not
just the promos. The flag stays as-is; only the two promo surfaces are deleted.

## 3. Files to touch

| Path | Action | Note |
|---|---|---|
| `src/components/dashboard/claude-challenge-modal.tsx` | `[delete]` | The popup. Sole consumer of `enrollInClaudeChallenge`. |
| `src/components/shared/claude-enrollment-banner.tsx` | `[delete]` | The ribbon. |
| `src/features/user/check-claude-enrollment.ts` | `[delete]` | `shouldShowClaudeBanner` + its cached `startsAt` lookup; no other consumers. |
| `src/app/dashboard/page.tsx` | `[edit]` | Drop 2 imports, the `claudeBanner` fetch, `showClaudeModal`/`claudeModalStartsAt`, 3 banner blocks, 1 modal block. |
| `src/app/challenge/[day]/page.tsx` | `[edit]` | Drop import, `claudeBanner` fetch, the `claudeBanner` prop on `ChallengePageShell` (type + 4 call sites), banner block. |
| `src/app/profile/page.tsx` | `[edit]` | Drop import, the `Promise.all` slot, 2 banner blocks. |
| `src/app/students/[id]/page.tsx` | `[edit]` | Drop import, the `Promise.all` slot, 1 banner block. |
| `src/app/actions/enrollment-actions.ts` | `[edit]` | See step 7 — verify orphaned, then decide. |

**Not touched (deliberately):** `src/lib/feature-flags.ts`, `landing-hub.tsx`,
`explore/track-list.tsx`, `challenge-switcher.tsx`, `community-leaderboard.tsx`,
`claude-signup/page.tsx`, `register/page.tsx`, `claude-day0-share-prompt.tsx`,
anything under `src/components/claude/`. The CLAUDE track keeps working for
users who choose it.

## 4. Server vs Client

- `src/app/dashboard/page.tsx` — **Server Component**. Unchanged.
- `src/app/challenge/[day]/page.tsx` — **Server Component**; `ChallengePageShell`
  is a Server function component in the same file. Unchanged.
- `src/app/profile/page.tsx` — **Server Component**. Unchanged.
- `src/app/students/[id]/page.tsx` — **Server Component**. Unchanged.
- `claude-challenge-modal.tsx` / `claude-enrollment-banner.tsx` — **Client**
  (`"use client"`). Both deleted.

**Server→Client boundary:** this change only *removes* a boundary crossing (the
`Date` passed as `claudeStartsAt`, and the `{ show, startsAt }` object passed to
`ChallengePageShell`). No new props cross the boundary. Nothing else in these
files changes shape.

## 5. Steps

Work in this order so the build stays interpretable — call sites first, then
delete the modules.

**Step 1 — `src/app/dashboard/page.tsx`**
1. Remove the import of `ClaudeChallengeModal` (line ~44) and of
   `ClaudeEnrollmentBanner` (line ~48).
2. In the import on line ~46, drop `isClaudeEnabled` but **keep**
   `isOtpVerificationRequired` — it is still used further down the file.
3. Delete the `const claudeEnabled = isClaudeEnabled();` assignment (line ~128).
   Before deleting, check the commented-out leaderboard block at line ~133 and
   the live `claudeEnabled={claudeEnabled}` prop passed to the leaderboard at
   line ~598. **The prop at ~598 is a real consumer** — see Step 1a.
4. Delete the `const claudeBanner = claudeEnabled ? await shouldShowClaudeBanner(...)`
   block (lines ~190–192).
5. Delete `const showClaudeModal = ...` and `const claudeModalStartsAt = ...`
   (lines ~256–257).
6. Delete all three `{!hasClaudeEnrollment && claudeBanner.show && ...}` JSX
   blocks (~233–238, ~274–279, ~345–350).
7. Delete the `{showClaudeModal && claudeModalStartsAt ? <ClaudeChallengeModal ... /> : null}`
   block (~356–358).
8. Leave `hasClaudeEnrollment`, `claudeEnrollment`, `hasClaudeDay1Submission`,
   and the `<ClaudeDay0SharePrompt />` blocks alone — those serve users who
   *are* enrolled in CLAUDE and are not part of this change.

**Step 1a — the leaderboard prop.** `CommunityLeaderboard` takes
`claudeEnabled?: boolean` (default `true`) and uses it to show/hide a CLAUDE tab.
Keep that working: retain `const claudeEnabled = isClaudeEnabled();` and the
`isClaudeEnabled` import in this file purely for that prop. Only the
`claudeBanner`-related uses go. (If you find the leaderboard render is fully
commented out, then remove the flag import here too — verify by reading the file,
don't assume.)

**Step 2 — `src/app/challenge/[day]/page.tsx`**
1. Remove the `ClaudeEnrollmentBanner` import (line ~25) and the
   `shouldShowClaudeBanner` import (line ~24).
2. From line ~23, drop `isClaudeEnabled` but **keep** `isDayLockBypassEnabled`.
3. In `ChallengePageShell`: remove the `claudeBanner` destructured param, remove
   `claudeBanner: { show: boolean; startsAt: Date | null };` from its prop type,
   and delete the banner JSX (lines ~64–66). The shell keeps `headerUser`,
   `children`, `mainClassName`.
4. Delete the `claudeEnabled` / `claudeBanner` assignments (lines ~86–89).
5. Remove `claudeBanner={claudeBanner}` from **all four** `ChallengePageShell`
   call sites (~117, ~148, ~201, ~259).

**Step 3 — `src/app/profile/page.tsx`**
1. Remove the `ClaudeEnrollmentBanner` import (~30) and `shouldShowClaudeBanner`
   import (~28). From line ~27 drop `isClaudeEnabled`, **keep**
   `isOtpVerificationRequired` if still used — check before removing.
2. Delete `const claudeEnabled = isClaudeEnabled();` (~69).
3. Reduce the `Promise.all` (lines ~70–76) from three entries to two:
   `const [bundle, myRedemptions] = await Promise.all([getProfile(userId), getMyRedemptions(userId)]);`
   Note the destructuring order changes — `claudeBanner` sat in the middle.
4. Delete both banner JSX blocks (~90–92 and ~149–151).

**Step 4 — `src/app/students/[id]/page.tsx`**
1. Remove the `ClaudeEnrollmentBanner` import (~23), the `shouldShowClaudeBanner`
   import (~22), and the `isClaudeEnabled` import (~21) — confirm `isClaudeEnabled`
   has no other use in this file first.
2. Delete `const claudeEnabled = isClaudeEnabled();` (~52).
3. Reduce the `Promise.all` (~53–60) to three entries:
   `const [publicProfile, enrollmentId, image] = await Promise.all([...])` —
   drop the trailing `claudeBanner` slot.
4. Delete the banner JSX block (~80–82).

**Step 5 — delete the components**
Delete `src/components/shared/claude-enrollment-banner.tsx` and
`src/components/dashboard/claude-challenge-modal.tsx`.

**Step 6 — delete the gate**
Delete `src/features/user/check-claude-enrollment.ts`. Before deleting, grep for
`check-claude-enrollment` and `shouldShowClaudeBanner` across `src/` to confirm
zero remaining references. Also grep for `challenge:CLAUDE` — that cache tag is
declared in this file; if a `revalidateTag("challenge:CLAUDE")` call exists in a
seed script or admin action it becomes a no-op tag, which is harmless, but note
it in the PR description rather than silently changing seed code.

**Step 7 — `enrollInClaudeChallenge`**
The deleted modal is its only caller. Do **not** delete the action in this pass —
leave `src/app/actions/enrollment-actions.ts` as-is and just confirm the file
still compiles. Rationale: it's a Server Action guarded by `isClaudeEnabled()`,
it may be wanted for a future deliberate opt-in entry point, and removing it is a
separate decision. If lint flags it as unused, report that rather than deleting.

**Step 8 — dead session key**
`sessionStorage["claude-modal-dismissed-session"]` is written by the deleted
modal. No cleanup needed — it's per-session and simply stops being read. Do not
add migration or cleanup code for it.

## 6. Guardrails for Cursor (DO NOT)

- **DO NOT** change `src/lib/feature-flags.ts` or the `ENABLE_CLAUDE_CHALLENGE`
  env value. The CLAUDE track stays enabled; only its promos are removed.
- **DO NOT** touch `middleware.ts`, `auth.config.ts`, or `auth.ts`. Nothing in
  this change is in the edge import path.
- **DO NOT** remove `isOtpVerificationRequired` from the dashboard/profile
  imports or `isDayLockBypassEnabled` from the challenge page import — they share
  an import line with `isClaudeEnabled` and are still used.
- **DO NOT** remove or alter `ClaudeDay0SharePrompt`, `hasClaudeEnrollment`,
  `hasClaudeDay1Submission`, or the CLAUDE branches in `challenge-switcher.tsx`,
  `track-list.tsx`, `landing-hub.tsx`, `community-leaderboard.tsx`, or
  `claude-signup/page.tsx`. Users who chose CLAUDE keep their full experience.
- **DO NOT** delete `enrollInClaudeChallenge` (see Step 7).
- **DO NOT** create a replacement banner, a "dismissed forever" preference, a
  feature flag wrapper, or any new abstraction file. This is a pure deletion —
  no new files.
- **DO NOT** convert any of the four Server Components to Client Components or
  add `"use client"` anywhere.
- **DO NOT** reformat or reorder unrelated code in the four page files. Diffs
  should be deletions only, plus the two `Promise.all` destructuring lines.
- **DO NOT** report done without running the build — a missed
  `claudeBanner={claudeBanner}` prop on one of the four `ChallengePageShell`
  call sites is the most likely failure here, and TypeScript will catch it.

## 7. DB safety
Not applicable — no schema, migration, or data changes. The CLAUDE `Challenge`
row and all `Enrollment` records are untouched.

## 8. Verification

**Typecheck / build**
- `npx tsc --noEmit` must pass with zero errors.
- `npm run build` must pass. Expect zero new warnings.
- Grep must return zero hits across `src/` for: `ClaudeEnrollmentBanner`,
  `ClaudeChallengeModal`, `OPEN_CLAUDE_MODAL_EVENT`, `shouldShowClaudeBanner`,
  `claudeBanner`, `claude-modal-dismissed-session`.

**Manual test — sign in as a Software Engineering user with no CLAUDE enrollment**
(the seeded `@abtalks.dev` test users work):
1. `/dashboard` — no ribbon under the header, no popup after 800ms or on any
   later reload. The dashboard heading sits directly below the header, the
   heatmap renders normally.
2. Hard-reload with sessionStorage cleared — still no popup.
3. `/challenge/1` — no ribbon. Also check a locked day and a bad day number
   (e.g. `/challenge/999` → 404 path) so all four `ChallengePageShell` branches
   render.
4. `/profile` — no ribbon; profile form renders and saves.
5. `/students/<some-other-user-id>` — no ribbon; public profile and heatmap render.
6. `/explore` and the landing page — the CLAUDE track card is **still there**.
7. `/register` — CLAUDE is **still** an option in the domain picker.

**Manual test — a user who IS enrolled in CLAUDE**
8. `/dashboard` — the Day-0 share prompt still appears as before; the CLAUDE
   entry is still in the challenge switcher; the CLAUDE leaderboard tab still
   renders.

**Exactly these files should show in `git status`:**
- deleted: `src/components/dashboard/claude-challenge-modal.tsx`
- deleted: `src/components/shared/claude-enrollment-banner.tsx`
- deleted: `src/features/user/check-claude-enrollment.ts`
- modified: `src/app/dashboard/page.tsx`
- modified: `src/app/challenge/[day]/page.tsx`
- modified: `src/app/profile/page.tsx`
- modified: `src/app/students/[id]/page.tsx`

Nothing else. If any other file changed, revert it.

## 9. Commit message

```
remove Claude challenge promo popup and enrollment ribbon

The Claude Challenge modal auto-opened on /dashboard and the "Master
Claude AI in 60 Days" ribbon rendered on dashboard, challenge day,
profile, and public student pages for every signed-in user without a
CLAUDE enrollment -- so SE, AI, and DS members were shown an unrequested
promo on each visit.

Delete ClaudeChallengeModal, ClaudeEnrollmentBanner, and the
shouldShowClaudeBanner gate, and strip their call sites from the four
pages. ENABLE_CLAUDE_CHALLENGE and the rest of the CLAUDE track
(landing card, explore card, registration option, /claude-signup,
leaderboard tab, day-0 share prompt) are unchanged -- users who choose
CLAUDE keep the full experience.

No schema or data changes.
```

## Note for the reconcile pass
`docs/project-context.md` describes the Claude enrollment banner / modal as part
of the cross-track promo surface. Once this ships, that section needs updating —
handle it in the next reconcile, not in this commit.
