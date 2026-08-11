## Pending reconcile

<!-- Reconciled through 2026-08-05 (commit 519cc34) into docs/project-context.md. -->

- 2026-08-11 — hire: Scout at `/hire` — TalentRequest pipeline, deterministic evidence scoring, demand board (`/admin/hire-demand`); migration `20260811140000_talent_requests_hire_scout` (apply on Neon **branch** first)
- 2026-08-06 [schema] Baselined orphaned HackathonProblem/HackathonSubmission migration and added /hackathon/submission flow on the existing tables to avoid shared-Neon drift
- 2026-08-06 [rule] Hackathon registration stays open until registrationClosesUtc (Fri 7 Aug 2026 6:00 PM IST); registrationOpen remains an emergency kill switch
- 2026-08-07 [rule] Hackathon registrationOpen kill switch set false; unregistered /hackathon/dashboard visitors see closed message instead of register redirect
- 2026-08-09 [convention] /admin/students lists challenge + hackathon via track filter (ALL|CHALLENGE|HACKATHON)
- 2026-08-09 [rule] Adjusted hackathon submission deadline to Sun 9 Aug 8:45 PM IST
- 2026-08-10 [convention] /admin/submissions gains Hackathon sub-tab for HackathonSubmission feed + CSV
- 2026-08-10 — `/` now renders the landing hub for signed-in users too (no more redirect to /dashboard); track cards show "Open dashboard" per-track via `features/landing/get-landing-state.ts`; `/login` bounces signed-in users to `/` instead of `/dashboard`.
