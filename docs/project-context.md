# ABTalks — Project Context Document

> **Purpose of this file:** Single-source-of-truth context to start fresh chats. Paste this at the beginning of any new conversation so the AI has full project context.

> **Last updated:** During active build, before launch. Real users not yet onboarded.

---

## 1. What is ABTalks

A 60-day coding challenge platform built around Anil Bajpai's community of recruiters and students. Students do daily coding tasks across three domains (AI / DS / SE), submit GitHub + LinkedIn proof of work, and become discoverable to recruiters from Anil sir's podcast network after completing the challenge.

**Vision:** Public daily commitment (GitHub + LinkedIn) produces real skill and real visibility.

**Audience:** Indian college students (1st year through recent graduates), primarily mobile users.

---

## 2. Hard constraints (non-negotiable for v1)

- Solo developer, building with Cursor + Claude
- 7-day target build, willing to extend by 1-2 days for admin dashboard
- Free or near-free hosting (Vercel free tier, Neon free tier)
- Max scale: 1,500 students, 100 recruiters, 1,500 daily submissions
- IST (Asia/Kolkata) timezone for all day boundaries
- Recruiter side deferred to Phase 2 (post-launch)
- One database for both dev and production (single Neon DB)

---

## 3. Tech stack (as deployed)

- **Framework:** Next.js 15 / 16 (App Router, TypeScript strict, Turbopack).
- **Database:** PostgreSQL on Neon (single shared instance — dev and prod)
- **ORM:** Prisma 6.19.3 (NOT Prisma 7 — pinned)
- **Auth:** Auth.js v5 (next-auth@beta) with split config (`auth.config.ts` for edge-safe middleware, `auth.ts` for full Node usage)
- **Auth providers:** Google OAuth (production), Credentials (dev-only, gated by `ENABLE_DEV_AUTH=true`, plain string password compare, no bcrypt)
- **Deployment:** Vercel (`abtalksapp.vercel.app`)
- **Styling:** Tailwind CSS + shadcn/ui (base-nova preset, slate base color)
- **Fonts:** Plus Jakarta Sans (display), Inter (body) via next/font
- **Forms:** React Hook Form + Zod
- **Theming:** next-themes with system default; toggle in header
- **Validation:** Zod everywhere
- **Logging:** Custom `lib/logger.ts` (console wrappers, edge-safe)
- **Charts:** Recharts (admin analytics)
- **File storage:** Vercel Blob (planned for resumes, not yet implemented)

**Critical:** Middleware must remain edge-safe — NO `@/lib/*` imports in `middleware.ts`. Uses only `next-auth` and `next/server`.

---

## 4. Domain model (Prisma schema)

### Auth tables (Auth.js standard)
- `User` — has `email`, `password` (dev only, plaintext), `role` (STUDENT | ADMIN)
- `Account` — OAuth account links
- `Session` — Auth.js sessions
- `VerificationToken` — Auth.js tokens

### Domain enums
- `Role`: STUDENT, ADMIN
- `UserType`: STUDENT, PROFESSIONAL — a `StudentProfile` row can represent either an Indian college student OR a working professional (different required fields). Distinct from `Role`.
- `Domain`: SE, DS, AI, **CLAUDE** (Claude AI Mastery track — synchronized cohort, see `Challenge.startsAt`). Was ML originally, renamed to DS.
- `EnrollmentStatus`: ACTIVE, COMPLETED, ABANDONED
- `SubmissionStatus`: ON_TIME, LATE

### Core domain tables
- `StudentProfile` (1:1 with User) — `userType` (STUDENT | PROFESSIONAL), `fullName`, `domain`, `skills` (string[]), `phone` (admin-only visibility), `resumeUrl` (admin-only visibility), `linkedinUrl`, `githubUsername`, `referralCode` (unique), `isReadyForInterview`. Student-only fields: `college`, `graduationYear`. Professional-only fields: `organization`, `role`, `yearsExperience`. Campus-ambassador fields: `isCampusAmbassadorCandidate`, `ambassadorAppliedAt`, `ambassadorDismissedAt`.
- `Challenge` — one per Domain (SE / DS / AI / CLAUDE), has `totalDays = 60`. Optional `startsAt: DateTime?` — when set, all enrolled students share the same IST calendar day boundary anchored at `startsAt` (cohort mode, used for CLAUDE). Null = rolling start from `Enrollment.startedAt`.
- `DailyTask` — 1-60 per Challenge, contains `problemStatement`, `learningObjectives`, `resources`, `difficulty`, `estimatedMinutes`, `linkedinTemplate` (with `{{github_link}}` placeholder), `solutionApproach` (admin-only), `tags`, and `dayContent` (Json?) — optional structured day content (e.g. rich CLAUDE day pages) consumed by the challenge UI alongside the legacy text fields.
- `Enrollment` (unique on userId+challengeId) — daysCompleted, currentStreak, longestStreak, lastSubmittedDay, status, startedAt, completedAt
- `Submission` (unique on enrollmentId+dayNumber, githubUrl globally unique) — dayNumber, githubUrl, linkedinUrl, status (ON_TIME/LATE), submittedAt
- `Quiz` (unique on challengeId+weekNumber) — Week 1-8 quizzes per domain
- `QuizQuestion` — 10 per Quiz, with optionA/B/C/D, correctAnswer, explanation
- `QuizAttempt` (unique on userId+quizId) — score, answers (JSON)
- `Referral` (unique on referredId) — referrerId, referredId, rewardGiven

### Admin tables
- `AdminAction` — adminUserId, targetUserId, actionType (string: MARK_DAY_COMPLETE | RESET_PROGRESS | TOGGLE_READY_FOR_INTERVIEW | REMOVE_FROM_CHALLENGE | REJECT_SUBMISSION), metadata (JSON), reason (optional), createdAt

---

## 5. Business rules

### Day calculation (timezone)
- All day boundaries in IST (Asia/Kolkata)
- Day 1 = day of enrollment in IST
- Day N = N calendar days after start in IST
- `getCurrentDayNumber(startedAt)` in `lib/date-utils.ts` handles this

### Submission validation
- GitHub URL must match `https://github.com/{owner}/{repo}` pattern
- GitHub URL must be globally unique (no two students, no two days, can share)
- GitHub URL must return HTTP 2xx on HEAD request (5s timeout)
- LinkedIn URL must match `https://www.linkedin.com/posts/...` or `linkedin.com/feed/update/...`
- LinkedIn URL is format-only (no network check, LinkedIn blocks bots)

### Streak rules
- `currentStreak` = consecutive ON_TIME submissions ending today/yesterday
- `longestStreak` = max value currentStreak has reached
- Late submissions don't count toward streaks
- Missing a day resets `currentStreak` to 0

### Leaderboard sort order (per-domain)
1. daysCompleted DESC
2. currentStreak DESC
3. longestStreak DESC
4. startedAt ASC (earlier joiners win ties)
- Cached with 5-minute TTL via `unstable_cache`

### Ready for Interview
- Set automatically when daysCompleted reaches 60 AND profile has minimum fields
- Admin can manually toggle (creates AdminAction)
- Phase 2 visibility: only Ready students appear to recruiters

### Quiz availability
- Only the CURRENT week's quiz is shown (not past unattempted)
- currentWeek = `Math.min(Math.floor(daysCompleted / 7), 8)`
- If user attempted current week's quiz: show "Already attempted, scored X/10"
- If quiz not seeded for current week: show nothing
- Past attempts visible in "Quiz History" section

### Referrals
- 6-character alphanumeric code (uppercase) per StudentProfile
- New user enters code at registration → Referral row created
- When referred user completes Day 7: `rewardGiven = true`
- Referral persisted via `abtalks_ref` httpOnly cookie (10-min lifetime) for OAuth flow
- Badges: bronze (1), silver (5), gold (10), platinum (25) — based on rewarded count

### Admin actions (require requireAdmin)
- markDayCompleteAction: creates manual submission with `admin-marked://` URL
- resetProgressAction: deletes all submissions, resets enrollment counters
- toggleReadyForInterviewAction: flips boolean
- removeFromChallengeAction: sets status to ABANDONED (soft, not deleted)
- rejectSubmissionAction: deletes specific submission, decrements daysCompleted
- All wrapped in transaction with AdminAction audit log row

---

## 6. Authentication architecture

### Two auth modes
- **Production (Vercel):** Google OAuth only. `ENABLE_DEV_AUTH` not set.
- **Local dev:** Both Google OAuth (if configured) AND Credentials (email + plaintext password).

### Auth.js v5 split config
- `src/auth.config.ts` — minimal, edge-safe (no Prisma, no `@/lib/*` imports). Used by middleware.
- `src/auth.ts` — full config with PrismaAdapter and real Credentials authorize. Used everywhere else.
- This split is REQUIRED because middleware on Vercel runs in Edge Runtime with strict bundle size limits. Including Prisma would exceed the 1 MB Edge limit.

### Session strategy
- JWT-based sessions (stateless, no DB lookup per request)
- `AUTH_SECRET` required env var (no fallback)
- `trustHost: true` set for Vercel proxy compatibility
- Cookies: `__Secure-authjs.session-token` (production HTTPS) or `authjs.session-token` (local HTTP)

### Admin authentication
- Email-based gating via `ADMIN_EMAILS` env var (comma-separated list)
- `requireAdmin()` helper redirects non-admins to `/dashboard`
- `session.user.isAdmin` boolean computed in JWT/session callback
- No DB role assignment for admin (just env var membership)

### Stale session warning
- JWT sessions don't verify user still exists in DB on every request
- If a user is deleted from DB, their browser cookie remains valid until expiry
- Cleanup script deletions require users to clear cookies / use incognito to re-auth
- Foreign key violations possible if action tries to use a deleted-user's userId

---

## 7. Routing structure

### Public routes
- `/` — landing page (real marketing landing in `components/landing/`, no longer a placeholder)
- `/login` — Server Component, redirects logged-in users to dashboard or register based on profile state
- `/students/[id]` — public profile page for a finished/active student (basic info only — no email, phone, resume)
- `/claude-signup` — public Claude track signup / interest page (Claude cohort entry)

### Protected routes (require session via middleware)
- `/register` — Server Component, redirects to dashboard if profile + enrollment exist; auto-cleans orphaned profiles (profile without enrollment). Supports both STUDENT and PROFESSIONAL `userType`, and a CLAUDE-only forced-domain mode via `?domain=CLAUDE`.
- `/dashboard` — student home with stats, today's task, leaderboard, heatmap, quiz card, recent activity
- `/challenge/today` — redirects to `/challenge/{currentDay}`
- `/challenge/[day]` — Server Component shows problem; renders submission flow client component. Uses `dailyTask.dayContent` (Json) when present (CLAUDE), otherwise legacy text fields.
- `/profile` — view + edit profile
- `/quiz/[quizId]` — take quiz or view results

### Admin routes (require admin email)
- `/admin` — overview with stat cards, live submissions feed, recent admin actions
- `/admin/students` — searchable/filterable student list
- `/admin/students/[id]` — full student detail with tabs (Submissions, Quiz Attempts, Admin Actions) + StudentActionPanel
- `/admin/submissions` — recent submissions feed, filterable
- `/admin/content` — read-only viewer for problems and quizzes
- `/admin/analytics` — Recharts dashboards (registrations, domain distribution, drop-off, hourly submissions, top performers)
- `/admin/campus-ambassadors` — review students who flagged interest in the campus ambassador program (`isCampusAmbassadorCandidate`); accept / dismiss actions

### API routes (sparse — most logic via Server Actions)
- `/api/auth/[...nextauth]` — Auth.js handler

---

## 8. Server Actions (`src/app/actions/`)

- `auth-actions.ts` — signOutAction
- `submission-actions.ts` — submitGithubStepAction (validate GitHub, return template), submitLinkedinStepAction (full submission with streak update)
- `registration-actions.ts` — completeRegistrationAction (handles STUDENT and PROFESSIONAL `userType`, plus CLAUDE-domain forced flow)
- `enrollment-actions.ts` — enroll/upgrade flows decoupled from initial registration (e.g. opt-in to a new Challenge after profile already exists)
- `profile-actions.ts` — updateProfileAction
- `quiz-actions.ts` — submitQuizAction
- `referral-actions.ts` — setReferralCookie, getReferralCookie, clearReferralCookie
- `admin-actions.ts` — 5 admin actions (markDayComplete, resetProgress, toggleReadyForInterview, removeFromChallenge, rejectSubmission)
- `admin-export-actions.ts` — CSV export server actions (uses `lib/csv.ts`); admin-gated
- `campus-ambassador-actions.ts` — student-side opt-in / dismiss + admin-side accept / reject for the campus ambassador program

All return discriminated union: `{ ok: true, data } | { ok: false, message }`

---

## 9. Feature modules (`src/features/`)

- `auth/` — login, register, logout
- `registration/` — completeRegistration, generateUniqueReferralCode
- `enrollment/` — post-registration enrollment helpers (separate from initial registration; e.g. Claude track signup, additional challenge enrollment)
- `submission/` — validateGithubUrl, validateLinkedinUrl, submitDay
- `challenge/` — getTodaysTask, getDayData
- `dashboard/` — getDashboardData, getLeaderboard, getHeatmapData
- `profile/` — getProfile, getPublicProfile (for `/students/[id]`), updateProfile, getReferralStats
- `quiz/` — getAvailableQuiz, getQuizWithQuestions, submitQuiz
- `user/` — cross-cutting user lookups, including `checkClaudeEnrollment` / `shouldShowClaudeBanner` used by header / profile / dashboard
- `admin/` — getOverviewStats, getStudents, getStudentDetail, getSubmissionsFeed, getContent, getAnalyticsData (campus-ambassador admin views included)

---

## 10. Content management

- Content stored in JSON: `prisma/content/problems.json` and `prisma/content/quizzes.json`
- Seeded via `npm run db:seed`
- Upserts on (challengeId, dayNumber) for problems, on (challengeId, weekNumber) for quizzes
- Quiz questions are clean-replaced on each reseed
- Days/weeks NOT in JSON show as "Day X placeholder" content
- Real Day 1-10 content + Week 1 quiz × 3 domains expected from senior (status: pending)
- NO admin UI for content editing in v1

---

## 11. Test data (seed script)

10 test users with `@abtalks.dev` emails, password `test`:
- Arjun (SE, fresh Day 1)
- Priya (DS, fresh Day 1)
- Rohan (AI, fresh Day 1)
- Sneha (SE, Day 7, has Week 1 quiz attempt)
- Vikram (DS, Day 15)
- Anika (SE, Day 30)
- Karan (AI, Day 45, broken streak)
- Meera (SE, Day 60, COMPLETED, isReadyForInterview)
- Dhruv (SE, Day 20, has 3 referrals to Arjun/Priya/Rohan)
- admin@abtalks.dev (ADMIN role, password "admin")

---

## 12. Cleanup scripts

`prisma/cleanup.ts` exposes:
- `npm run db:cleanup:test` — delete only @abtalks.dev test users
- `npm run db:cleanup:real` — delete all real Google users (keep test)
- `npm run db:cleanup:all` — wipe everything
Each prompts a 5-second pause before deletion. Cascades handle related rows.

---

## 13. Environment variables

### Required everywhere
- `DATABASE_URL` — Neon Postgres connection string
- `AUTH_SECRET` — random hex (64 bytes), no fallback in code
- `AUTH_URL` — `https://abtalksapp.vercel.app` (prod) or `http://localhost:3000` (local)

### Auth providers
- `AUTH_GOOGLE_ID` — Google OAuth client ID
- `AUTH_GOOGLE_SECRET` — Google OAuth secret

### Local-only
- `ENABLE_DEV_AUTH` — `"true"` enables Credentials provider on localhost ONLY

### Admin
- `ADMIN_EMAILS` — comma-separated list of admin email addresses

### Public
- `NEXT_PUBLIC_APP_URL` — same as AUTH_URL

---

## 14. Conventions

### Code style
- TypeScript strict mode, no `any` allowed
- Server Components by default, `"use client"` only when needed
- Server Actions for mutations (preferred over API routes)
- Zod validation at every boundary (action entry, route handler)
- Prisma queries always use `select` clauses (no full-record returns)
- Multi-step writes wrapped in transactions
- Errors logged via `lib/logger.ts`, never `console.error`
- Result envelope: `{ ok: true, data } | { ok: false, message }` everywhere

### Routing
- Auth routes are public (no requireRole)
- All other routes use `requireRole(["STUDENT", "ADMIN"])` or `requireAdmin()`
- Logout is idempotent (always succeeds, fail-closed silent)

### Files
- `src/features/<domain>/` — business logic
- `src/lib/` — shared utilities (db, auth, logger, validations)
- `src/app/actions/` — Server Actions
- `src/components/ui/` — shadcn primitives (don't modify)
- `src/components/<feature>/` — feature-specific components

---

## 15. Design system

### Typography
- Display font: Plus Jakarta Sans (font-display class) — for headings
- Body font: Inter (default font-sans) — for body, buttons, inputs

### Colors (CSS vars in globals.css)
- Light theme: warm off-white background (`38 38% 98%`), pure white cards
- Dark theme: deep blue-gray background, slightly lighter cards
- Primary: indigo `239 84% 67%` (#4F46E5)
- Domain colors:
  - AI: violet `#8B5CF6`
  - DS: cyan `#0891B2`
  - SE: emerald `#10B981`

### UX patterns
- Cards: rounded-xl, soft border, subtle shadow, hover:shadow-md
- Buttons: shadcn defaults, NEVER use `<Button asChild>` with `<Link>` — use `buttonVariants` directly on the Link instead (Base UI strict about button semantics)
- Theme toggle: single button (sun/moon), light ↔ dark, system as initial default
- Mobile-first responsive (390px tested)

### Polish completed
- Custom design pass replacing default shadcn slate
- Domain badge in header (color-coded)
- Theme toggle with optional click sound (off by default, configured in profile)

---

## 16. Known issues / decisions parked

### Resolved (don't touch)
- Edge Runtime middleware must avoid `@/lib/*` imports → split auth.config.ts
- Auth.js v5 default cookie name change → `auth()` middleware pattern
- Stale Prisma client after `node_modules` delete → `npx prisma generate` required
- Postgres enum rename ML → DS via ALTER TYPE RENAME VALUE
- Foreign key violation when User deleted but session still valid → user must clear cookies
- `<Button render={<Link>}>` triggers Base UI nativeButton warning → use `buttonVariants` directly

### Shipped since the original doc snapshot (no longer pending)
- Phone number on registration + profile, admin-only visibility (`StudentProfile.phone`, `optionalPhoneSchema` in `lib/validations/phone.ts`)
- Clickable student names → public profile at `/students/[id]` (basic info only — see `features/profile/get-public-profile.ts`)
- Resume link field on `StudentProfile.resumeUrl` (paste-a-URL flavour; Vercel Blob upload still deferred)
- Real landing page at `/` (see `components/landing/`)
- Campus ambassador program (student opt-in chip + admin review screen)
- Professional `userType` track on `StudentProfile` (organization / role / yearsExperience)
- CLAUDE 4th domain with synchronized cohort start via `Challenge.startsAt`, structured day content via `DailyTask.dayContent`, and the `/claude-signup` + Claude enrollment banner UX
- CSV admin exports (`admin-export-actions.ts` + `lib/csv.ts`)
- Confetti on celebration (`canvas-confetti` is in deps)

### Pending tester feedback (planned but not built)
- Leaderboard filters: college, domain, search by name; cross-domain view; scrolling
- Resume **upload** (binary, Vercel Blob) — only the URL field exists today
- More polish on celebration screen after day completion
- Heatmap cells clickable to view past day's problem
- Logo scroll animation (ABTalks → AB collapse on scroll)

### Deferred to Phase 2 (post-launch)
- Recruiter dashboard, registration, approval
- Admin UI for content CRUD (editing problems via UI instead of JSON)
- Plagiarism detection (currently only global URL uniqueness)
- Email notifications (welcome, streak warnings)
- Email verification (Google handles for OAuth users)
- Rate limiting on submission/login
- Password complexity rules (only min 8 today)

### Security TODOs (`docs/security-todos.md`)
- No rate limiting on auth or submission endpoints
- No email verification for any flow
- No password policy beyond min 8 chars
- No CSRF tokens beyond Next.js defaults
- No content security policy headers
- No automated session invalidation on user deletion

---

## 17. Working with Cursor — guardrails

### Before any DB-touching change
1. Commit current state: `git add -A && git commit -m "checkpoint before X"`
2. Create Neon branch as snapshot
3. Note current commit hash

### Cursor failure modes observed
- Adds `requireRole` to public routes (logout, login) when rule says "every route needs it" — must explicitly mark exceptions
- Confuses Server vs Client component boundaries when passing component props (e.g., Lucide icons)
- Defends wrong choices when build errors contradict its model (jose subpath import)
- Over-engineers (creates files like `lib/jwt-env.ts` for trivial logic)
- Misses transitive imports causing Edge Runtime bundle size violations
- Sometimes silently fails to apply file changes

### Working pattern that works
1. Small, scoped prompts (one feature at a time)
2. Explicit "do NOT" lists in prompts
3. Cursor reports back, you verify
4. Manually test each change before committing
5. Commit after each successful task
6. If something breaks: gather data (logs, file contents, exact error) before fixing

---

## 18. Current state

### Working
- Full auth flow (Google OAuth + dev login)
- Registration with three domains
- Dashboard with stats, leaderboard, heatmap, quiz card, recent activity
- Challenge submission with GitHub validation + LinkedIn template (editable)
- Quizzes (Week 1 only seeded; logic supports 1-8)
- Profile view + edit
- Referral system with cookie persistence and badges
- Theme toggle (light/dark/system)
- Admin dashboard: overview, students, student detail, submissions feed, content viewer, analytics, action panel with audit log
- Production deployment on Vercel

### Not yet built
- Real Day 1-10 content (pending from senior, seeded with placeholders)
- Landing page at `/` (currently placeholder)
- Recruiter side (Phase 2)

### Active testing
- Parallel testing in progress with multiple Google accounts
- Real Google users have been onboarded (no real student users; testers only)
- Cleanup scripts available to wipe test data before real launch

### Next priorities
1. Tester feedback batch (leaderboard filters, clickable names, phone, resume) — chosen order: phone → leaderboard → clickable → resume
2. Real content from senior when delivered
3. Landing page before broader launch
4. Soft launch to 5-10 trusted users

---

## 19. How to use this document in new chats

Open a new chat and paste this entire document at the start, with a message like:

> "I'm working on a project called ABTalks. Read this context document carefully before we start. After reading, just say 'Context loaded' and ask me what I want to work on."

This onboards the AI with everything needed to continue. Update this document at major milestones to keep it current.

---

## 20. Document maintenance

Update this document when:
- A major feature ships
- A core decision changes (tech stack, business rule, scope)
- Schema changes
- New env vars added
- New conventions adopted

Don't update for:
- Tiny bug fixes
- Cosmetic changes
- Routine commits

The doc should reflect the architecture and decisions, not every line of code.
