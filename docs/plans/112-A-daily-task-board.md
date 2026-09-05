# 112-A — Daily Task Board · 5–30 September 2026

> **Companion to** [`112-september-execution-plan.md`](112-september-execution-plan.md) and
> [`assets/ABTalks-September-Execution-Tracker.xlsx`](assets/ABTalks-September-Execution-Tracker.xlsx).
> Same 217 tasks, same ids — laid out by day so every person knows what they own each morning.
> **Tick the box when the acceptance criterion passes**, not when the code compiles.
>
> Task ids (`T-001`) match the Activity Tracker exactly. Update `Status` there; use this for standup.

## How to run a day

1. **09:30 standup, 10 minutes.** Each person reads out their box for today: what they finished yesterday, what they are on now, what is blocking them.
2. **Blocked more than 3 hours — post in the channel and tag Sohail.** A day lost is 1/21st of the build window.
3. **A task is done when its acceptance criterion passes** — the line under the task, written as something you can demonstrate. Not when the code compiles, not when it looks right.
4. **Every developer is junior and pairs with Claude.** Read the `Where to start` note in the tracker before opening an editor — most of these tasks extend something that already exists rather than creating something new.
5. **If an acceptance criterion cannot be demonstrated in a browser or a test, the task is badly written.** Raise it at standup rather than guessing.

## The team

| Person | Owns | Load |
|---|---|---|
| **Shivansh** | Recruiter onboarding · Jobs · Workspace UI · Candidate profile | 108% |
| **Zainab** | Evidence spine · Outreach · Assessments · Interview & cohort verification | 95% |
| **shashank** | Talent projects · Insights · Pipeline · Analytics · Non-tech | 104% |
| **Manuvrtti** | Recruiter notifications · Notifications & email · Analytics · External links | 107% (part-time) |
| **Sohail** | Decisions & contracts · Entitlements · Security & testing · Release | 104% |

> **Zainab is the designated absorber at 95%.** If Shivansh is behind at the 16 September checkpoint, his remaining profile fixes move to her **before** any release valve is called.

---

# P1 FOUNDATION

*Architecture, contracts, blockers, schema*

## Saturday 05 September

**Shivansh**

- [ ] `T-017` **AUDIT: walk the current recruiter registration and first-run experience end to end** *(day 1 of 3)*
      - *Done when:* A written walk-through of what a new recruiter sees today, screen by screen, from /hire to first search. Names every point where they are dropped into a surface with no explanation. This audit sizes the rest of R1.
      - *Start here:* src/app/hire/page.tsx, layout.tsx, src/components/hire/hire-chrome.tsx, src/features/talent-pool/recruiter-registration.ts
- [ ] `T-122` **AUDIT: map every profile section to its editor, action, repository and recruiter renderer** *(day 1 of 4)*
      - *Done when:* One table covering identity, contact, education, experience, internships, projects, skills, certifications, achievements, resume, portfolio, links, role/domain, preferences, availability, participation, evidence, visibility and preview - each with its file paths. Then a 12-point check per section: create, read, update, delete, validation, persistence, empty, error, loading, mobile, privacy, recruiter render.
      - *Start here:* src/components/profile/ has 9 section components; src/features/profile/update-profile.ts; src/repositories/candidate.ts

**Zainab**

- [ ] `T-146` **Design emitSkillEvidence and publish the C1 stub** *(day 1 of 2)*
      - *Done when:* A file exports emitSkillEvidence(input), idempotent on (sourceType, sourceKey, skillId). It typechecks and no-ops. Merged 5 Sep so R9, C4 and C5 can import it. The signature is reviewed by all four consumers before it lands.
      - *Start here:* prisma SkillEvidence (~2318) exists; grep confirms NOTHING in src/ writes it - only prisma/scripts/migrate-2i-achievements.ts

**shashank**

- [ ] `T-039` **AUDIT: does TalentRequest today save a SEARCH, or a PROJECT?** *(day 1 of 2)*
      - *Done when:* A written answer naming exactly what persists between two visits and what does not. Must state whether criteria, matches, viewed state, shortlist and notes each survive a sign-out - with the file and column that proves each answer.
      - *Start here:* prisma TalentRequest (line ~1052), TalentRequestMatch (~1110), src/features/hire/load-request-matches.ts, run-match action

**Manuvrtti**

- [ ] `T-152` **Publish the C3 notify() stub and freeze the type list** *(day 1 of 3)*
      - *Done when:* notify({userId, type, payload, channels}) typechecks and no-ops, merged 6 Sep. The candidate and recruiter type lists are named and circulated; no renames after 8 Sep.
      - **Waits on:** D-9

**Sohail**

- [ ] `T-001` **D-2: prove prisma migrate deploy against a Neon child branch and record the outcome**
      - *Done when:* Run migrate deploy on a child branch. PASS = migrate status reports every migration applied. FAIL = the exact error is pasted into the decision record and resolved with migrate resolve --applied before any migration merges.
      - **Security:** Child branch only - never the default branch
      - *Start here:* prisma/migrations/, .neon, AGENTS.md Neon safety rule
- [ ] `T-002` **D-1: freeze 078 Phase 7 (W1-B onward) through September**
      - *Done when:* One paragraph in the decision record stating: dual-write stays ON, no legacy table is dropped, every new model is 078-native with plain cuids.
      - *Start here:* lib/feature-flags.ts, docs/plans/099, docs/plans/101
- [ ] `T-003` **D-3: plan tiers, their limits and what each gates** *(day 1 of 2)*
      - *Done when:* A table naming Starter/Prime/Scale, the monthly USD price, and a NUMBER for each of: searches, profile unlocks, contact unlocks, outreach emails, active talent projects, active jobs, assessments, seats. Seeded as SubscriptionPlan rows, not hard-coded.
      - **Waits on:** Prices confirmed USD per the reference design
      - *Start here:* src/components/hire/subscription-gate.tsx - the PLANS array is the starting copy; its own header says the split needs sign-off
- [ ] `T-015` **Write the Cursor implementation plans, one per P0 workstream** *(day 1 of 4)*
      - *Done when:* Every P0 workstream has a numbered plan in docs/plans/ using the CLAUDE.md 9-part template, including its Guardrails and DB safety sections. A developer can start Tuesday without asking a design question.
      - *Start here:* docs/plans/ - next free number is 113; follow the template in CLAUDE.md

---

## Sunday 06 September

**Shivansh**

- [ ] `T-017` **AUDIT: walk the current recruiter registration and first-run experience end to end** *(day 2 of 3)*
      - *Done when:* A written walk-through of what a new recruiter sees today, screen by screen, from /hire to first search. Names every point where they are dropped into a surface with no explanation. This audit sizes the rest of R1.
      - *Start here:* src/app/hire/page.tsx, layout.tsx, src/components/hire/hire-chrome.tsx, src/features/talent-pool/recruiter-registration.ts
- [ ] `T-079` **AUDIT: every Job and JobApplication read and write path** *(day 1 of 2)*
      - *Done when:* A gap list naming every missing column, surface and transition with a file path. Must state explicitly how an applicant reaches the recruiter's hiring pipeline today (answer: they do not).
      - *Start here:* prisma Job (~552) has no organizationId and no status; JobApplication (~571) has no stage; src/app/actions/job-actions.ts, admin-job-actions.ts
- [ ] `T-122` **AUDIT: map every profile section to its editor, action, repository and recruiter renderer** *(day 2 of 4)*
      - *Done when:* One table covering identity, contact, education, experience, internships, projects, skills, certifications, achievements, resume, portfolio, links, role/domain, preferences, availability, participation, evidence, visibility and preview - each with its file paths. Then a 12-point check per section: create, read, update, delete, validation, persistence, empty, error, loading, mobile, privacy, recruiter render.
      - *Start here:* src/components/profile/ has 9 section components; src/features/profile/update-profile.ts; src/repositories/candidate.ts

**Zainab**

- [ ] `T-146` **Design emitSkillEvidence and publish the C1 stub** *(day 2 of 2)*
      - *Done when:* A file exports emitSkillEvidence(input), idempotent on (sourceType, sourceKey, skillId). It typechecks and no-ops. Merged 5 Sep so R9, C4 and C5 can import it. The signature is reviewed by all four consumers before it lands.
      - *Start here:* prisma SkillEvidence (~2318) exists; grep confirms NOTHING in src/ writes it - only prisma/scripts/migrate-2i-achievements.ts

**shashank**

- [ ] `T-039` **AUDIT: does TalentRequest today save a SEARCH, or a PROJECT?** *(day 2 of 2)*
      - *Done when:* A written answer naming exactly what persists between two visits and what does not. Must state whether criteria, matches, viewed state, shortlist and notes each survive a sign-out - with the file and column that proves each answer.
      - *Start here:* prisma TalentRequest (line ~1052), TalentRequestMatch (~1110), src/features/hire/load-request-matches.ts, run-match action
- [ ] `T-040` **Design the persistent project model and hand the migration to Sohail for review** *(day 1 of 2)*
      - *Done when:* A reviewed schema diff adding: TalentRequest.name, and TalentRequestMatch.firstSeenAt / viewedAt / decision. Sohail signs it before 9 Sep.
      - **Needs:** D-2
      - *Start here:* Extend the existing models - do NOT create a parallel Project table
- [ ] `T-102` **Name every metric and the exact query behind it** *(day 1 of 3)*
      - *Done when:* A table with one row per metric: the recruiter question it answers, the source table or AnalyticsEvent, and its period. Any metric with no traceable source is struck out rather than estimated.
      - *Start here:* Do this AFTER D-9 so the event names are fixed

**Manuvrtti**

- [ ] `T-152` **Publish the C3 notify() stub and freeze the type list** *(day 2 of 3)*
      - *Done when:* notify({userId, type, payload, channels}) typechecks and no-ops, merged 6 Sep. The candidate and recruiter type lists are named and circulated; no renames after 8 Sep.
      - **Waits on:** D-9
- [ ] `T-157` **Publish the C2 track() stub and name the event taxonomy** *(day 1 of 3)*
      - *Done when:* track(event, userId, props) typechecks and no-ops, merged 6 Sep. The event list is circulated and frozen after 8 Sep.

**Sohail**

- [ ] `T-003` **D-3: plan tiers, their limits and what each gates** *(day 2 of 2)*
      - *Done when:* A table naming Starter/Prime/Scale, the monthly USD price, and a NUMBER for each of: searches, profile unlocks, contact unlocks, outreach emails, active talent projects, active jobs, assessments, seats. Seeded as SubscriptionPlan rows, not hard-coded.
      - **Waits on:** Prices confirmed USD per the reference design
      - *Start here:* src/components/hire/subscription-gate.tsx - the PLANS array is the starting copy; its own header says the split needs sign-off
- [ ] `T-004` **D-4: payment gateway is OUT of September - record the decision and the October seam**
      - *Done when:* Decision states: no Razorpay/Stripe in September. Plan selection creates an OrganizationSubscription in PENDING; an admin activates it. The activation function is the single seam a gateway webhook will later call - named in the record.
      - **Waits on:** D-4 - already DECIDED by product direction before kickoff: payment integration deferred
      - *Start here:* No payment dependency exists in package.json today - this is a deferral, not a removal
- [ ] `T-005` **D-5: contact unlock becomes a PLAN CREDIT, not an admin approval**
      - *Done when:* Decision states: a paying recruiter spends one contact-unlock entitlement and gets details immediately. TalentEngagementRequest is kept as the audit record and written with status CONTACT_SHARED at unlock time, so hasContactAccess needs no change. Names the privacy basis and the exact candidate-facing copy.
      - **Waits on:** D-5 - already DECIDED by product direction before kickoff: plan credit, instant unlock · **Security:** Changes who releases PII - the privacy copy must move with it
      - *Start here:* src/features/hire/contact-access.ts (hasContactAccess derives from status - keep that), prisma TalentEngagementRequest
- [ ] `T-006` **D-6: recruiter access stays allow-listed for September**
      - *Done when:* Decision states: VerifiedRecruiterSeat still gates registration; self-serve open signup waits for the payment gateway in October. Recorded so R1 does not build an open funnel that cannot be charged.
      - *Start here:* prisma VerifiedRecruiterSeat, src/features/talent-pool/recruiter-registration.ts
- [ ] `T-007` **D-7: company verification is NOT a gate on search**
      - *Done when:* Decision states: company details are collected at onboarding and shown to candidates; nothing blocks search on them. Recorded so R1 does not build an admin verification queue.
      - **Waits on:** D-7 - already DECIDED by product direction before kickoff: no company verification gate
- [ ] `T-008` **D-8: resolve the privacy copy vs searchableByRecruiters default, now that contact unlock is paid**
      - *Done when:* Either the published Privacy/Terms copy is corrected, or the default changes. Recorded BEFORE R1, R3 or the C1 visibility control merges. Open since 2026-08-24 and now higher stakes because money changes hands for contact.
      - **Security:** Published copy says opt-in; the column defaults true
      - *Start here:* docs/legal/, prisma CandidateVisibility, docs/project-context.md section 5
- [ ] `T-014` **Publish the C5 assertEntitlement stub**
      - *Done when:* A file exports assertEntitlement(orgId, key, n) returning {ok:true}. It typechecks, is imported by one caller, and master builds. R3, R6, R8 and R9 can import it from 6 Sep.
      - *Start here:* new src/features/entitlement/assert.ts, mirror the Result envelope in lib/validations
- [ ] `T-015` **Write the Cursor implementation plans, one per P0 workstream** *(day 2 of 4)*
      - *Done when:* Every P0 workstream has a numbered plan in docs/plans/ using the CLAUDE.md 9-part template, including its Guardrails and DB safety sections. A developer can start Tuesday without asking a design question.
      - *Start here:* docs/plans/ - next free number is 113; follow the template in CLAUDE.md

---

## Monday 07 September

**Shivansh**

- [ ] `T-017` **AUDIT: walk the current recruiter registration and first-run experience end to end** *(day 3 of 3)*
      - *Done when:* A written walk-through of what a new recruiter sees today, screen by screen, from /hire to first search. Names every point where they are dropped into a surface with no explanation. This audit sizes the rest of R1.
      - *Start here:* src/app/hire/page.tsx, layout.tsx, src/components/hire/hire-chrome.tsx, src/features/talent-pool/recruiter-registration.ts
- [ ] `T-079` **AUDIT: every Job and JobApplication read and write path** *(day 2 of 2)*
      - *Done when:* A gap list naming every missing column, surface and transition with a file path. Must state explicitly how an applicant reaches the recruiter's hiring pipeline today (answer: they do not).
      - *Start here:* prisma Job (~552) has no organizationId and no status; JobApplication (~571) has no stage; src/app/actions/job-actions.ts, admin-job-actions.ts
- [ ] `T-113` **Design the recruiter information architecture and get it signed off** *(day 1 of 2)*
      - *Done when:* One agreed nav list with a route per item and a rule for which items appear before a plan is active. R12 builds exactly this; no nav item is invented inside a component.
      - **Waits on:** D-13
      - *Start here:* src/components/hire/hire-chrome.tsx holds today's nav; /hire has only 5 routes
- [ ] `T-122` **AUDIT: map every profile section to its editor, action, repository and recruiter renderer** *(day 3 of 4)*
      - *Done when:* One table covering identity, contact, education, experience, internships, projects, skills, certifications, achievements, resume, portfolio, links, role/domain, preferences, availability, participation, evidence, visibility and preview - each with its file paths. Then a 12-point check per section: create, read, update, delete, validation, persistence, empty, error, loading, mobile, privacy, recruiter render.
      - *Start here:* src/components/profile/ has 9 section components; src/features/profile/update-profile.ts; src/repositories/candidate.ts

**Zainab**

- [ ] `T-065` **Design the contact-unlock-to-email flow on the plan-credit model**
      - *Done when:* A written flow: recruiter clicks Contact -> assertEntitlement('contact_unlock') -> on success write a TalentEngagementRequest at status CONTACT_SHARED -> contact details render. Names what happens when the entitlement is exhausted and what the candidate is told.
      - **Waits on:** D-5, D-8 · **Security:** This is the moment PII is released - the privacy copy must match
      - *Start here:* src/features/hire/contact-access.ts derives access from status; keep that function unchanged
- [ ] `T-091` **Design the V1 assessment model on the existing question tables** *(day 1 of 2)*
      - *Done when:* A reviewed schema: RecruiterAssessment, AssessmentQuestion, AssessmentAssignment, AssessmentAttempt. Results write to the EXISTING AssessmentReport / AssessmentScore. The design names why each new table is needed and what it does not duplicate.
      - **Waits on:** D-10
      - *Start here:* prisma Question (~2558) / QuestionOption (~2572) already model MCQ; AssessmentReport (~3011) / AssessmentScore (~3036) exist unused by application code

**shashank**

- [ ] `T-040` **Design the persistent project model and hand the migration to Sohail for review** *(day 2 of 2)*
      - *Done when:* A reviewed schema diff adding: TalentRequest.name, and TalentRequestMatch.firstSeenAt / viewedAt / decision. Sohail signs it before 9 Sep.
      - **Needs:** D-2
      - *Start here:* Extend the existing models - do NOT create a parallel Project table
- [ ] `T-051` **Define the insight contract: what is a fact, what is inference, what is 'not enough evidence'** *(day 1 of 2)*
      - *Done when:* A written spec listing every signal the panel may show, its source table, and its class (FACT or INFERENCE). Any signal with no source row is deleted from the spec rather than estimated.
      - **Waits on:** D-11
      - *Start here:* prisma SkillEvidence, CandidateSkill, CandidateProjectEntry, AssessmentScore, MockInterviewReport, CandidateAchievement, JobApplication
- [ ] `T-102` **Name every metric and the exact query behind it** *(day 2 of 3)*
      - *Done when:* A table with one row per metric: the recruiter question it answers, the source table or AnalyticsEvent, and its period. Any metric with no traceable source is struck out rather than estimated.
      - *Start here:* Do this AFTER D-9 so the event names are fixed

**Manuvrtti**

- [ ] `T-152` **Publish the C3 notify() stub and freeze the type list** *(day 3 of 3)*
      - *Done when:* notify({userId, type, payload, channels}) typechecks and no-ops, merged 6 Sep. The candidate and recruiter type lists are named and circulated; no renames after 8 Sep.
      - **Waits on:** D-9
- [ ] `T-157` **Publish the C2 track() stub and name the event taxonomy** *(day 2 of 3)*
      - *Done when:* track(event, userId, props) typechecks and no-ops, merged 6 Sep. The event list is circulated and frozen after 8 Sep.

**Sohail**

- [ ] `T-009` **D-9: recruiter notification taxonomy and which events earn an email**
      - *Done when:* A table of recruiter events with a channel decision each: in-app only, or in-app + email. At most three earn email. Recorded so R7 does not ship a spam engine.
      - *Start here:* prisma Notification / NotificationRead key scheme, docs/plans/067
- [ ] `T-010` **D-10: assessment V1 question types**
      - *Done when:* Decision states MCQ + multiple-select only, on the existing Question / QuestionOption models. Descriptive deferred (needs a grading surface). Coding excluded - no execution sandbox exists. Names the entitlement key that gates publish.
      - *Start here:* prisma Question, QuestionOption, QuizActivityConfig, CodingActivityConfig (models coding but nothing executes it)
- [ ] `T-011` **D-11: the candidate-insight methodology - what is a fact and what is inference**
      - *Done when:* Decision defines two visual classes: FACTS (a row exists: SkillEvidence, CandidateSkill, project, assessment score, application) and INFERENCE (a derived judgement). Names the exact rule for 'Strong / Possible / Not enough evidence' and forbids any score the platform cannot cite.
      - *Start here:* prisma SkillEvidence, CandidateSkill.evidenceScore, src/features/hire/explain-matches.ts, score-candidate.ts
- [ ] `T-012` **D-12: the role-family taxonomy including non-technical families** *(day 1 of 2)*
      - *Done when:* Final list agreed and frozen: the existing AI_ML, DATA, BACKEND, FRONTEND, FULLSTACK, ANALYST, MANAGER, STUDENT plus PRODUCT, SALES, MARKETING, BUSINESS_DEVELOPMENT, OPERATIONS, DESIGN, FINANCE, HR, BUSINESS_ANALYST. No renames after Mon 8 Sep.
      - *Start here:* src/features/hire/role-family.ts - RULES is ordered most-specific-first; extend it, do not replace it
- [ ] `T-013` **D-13: recruiter information architecture - the workspace navigation**
      - *Done when:* The final left-nav list is agreed and written down, with the route for each item and which are visible before a plan is active. R12 builds exactly this list; no nav item is invented in a component.
      - *Start here:* src/components/hire/hire-chrome.tsx - the nav lives here today with 5 destinations
- [ ] `T-015` **Write the Cursor implementation plans, one per P0 workstream** *(day 3 of 4)*
      - *Done when:* Every P0 workstream has a numbered plan in docs/plans/ using the CLAUDE.md 9-part template, including its Guardrails and DB safety sections. A developer can start Tuesday without asking a design question.
      - *Start here:* docs/plans/ - next free number is 113; follow the template in CLAUDE.md

---

## Tuesday 08 September

> **GATE — Foundation exit, this evening.** Sohail signs: C1–C5 stubs on master, migration path proven on a Neon child branch, D-1…D-13 all Decided, every workstream has a numbered plan. **If D-2 is unresolved, no migration merges tomorrow.**

**Shivansh**

- [ ] `T-113` **Design the recruiter information architecture and get it signed off** *(day 2 of 2)*
      - *Done when:* One agreed nav list with a route per item and a rule for which items appear before a plan is active. R12 builds exactly this; no nav item is invented inside a component.
      - **Waits on:** D-13
      - *Start here:* src/components/hire/hire-chrome.tsx holds today's nav; /hire has only 5 routes
- [ ] `T-122` **AUDIT: map every profile section to its editor, action, repository and recruiter renderer** *(day 4 of 4)*
      - *Done when:* One table covering identity, contact, education, experience, internships, projects, skills, certifications, achievements, resume, portfolio, links, role/domain, preferences, availability, participation, evidence, visibility and preview - each with its file paths. Then a 12-point check per section: create, read, update, delete, validation, persistence, empty, error, loading, mobile, privacy, recruiter render.
      - *Start here:* src/components/profile/ has 9 section components; src/features/profile/update-profile.ts; src/repositories/candidate.ts

**Zainab**

- [ ] `T-091` **Design the V1 assessment model on the existing question tables** *(day 2 of 2)*
      - *Done when:* A reviewed schema: RecruiterAssessment, AssessmentQuestion, AssessmentAssignment, AssessmentAttempt. Results write to the EXISTING AssessmentReport / AssessmentScore. The design names why each new table is needed and what it does not duplicate.
      - **Waits on:** D-10
      - *Start here:* prisma Question (~2558) / QuestionOption (~2572) already model MCQ; AssessmentReport (~3011) / AssessmentScore (~3036) exist unused by application code

**shashank**

- [ ] `T-051` **Define the insight contract: what is a fact, what is inference, what is 'not enough evidence'** *(day 2 of 2)*
      - *Done when:* A written spec listing every signal the panel may show, its source table, and its class (FACT or INFERENCE). Any signal with no source row is deleted from the spec rather than estimated.
      - **Waits on:** D-11
      - *Start here:* prisma SkillEvidence, CandidateSkill, CandidateProjectEntry, AssessmentScore, MockInterviewReport, CandidateAchievement, JobApplication
- [ ] `T-102` **Name every metric and the exact query behind it** *(day 3 of 3)*
      - *Done when:* A table with one row per metric: the recruiter question it answers, the source table or AnalyticsEvent, and its period. Any metric with no traceable source is struck out rather than estimated.
      - *Start here:* Do this AFTER D-9 so the event names are fixed

**Manuvrtti**

- [ ] `T-157` **Publish the C2 track() stub and name the event taxonomy** *(day 3 of 3)*
      - *Done when:* track(event, userId, props) typechecks and no-ops, merged 6 Sep. The event list is circulated and frozen after 8 Sep.

**Sohail**

- [ ] `T-012` **D-12: the role-family taxonomy including non-technical families** *(day 2 of 2)*
      - *Done when:* Final list agreed and frozen: the existing AI_ML, DATA, BACKEND, FRONTEND, FULLSTACK, ANALYST, MANAGER, STUDENT plus PRODUCT, SALES, MARKETING, BUSINESS_DEVELOPMENT, OPERATIONS, DESIGN, FINANCE, HR, BUSINESS_ANALYST. No renames after Mon 8 Sep.
      - *Start here:* src/features/hire/role-family.ts - RULES is ordered most-specific-first; extend it, do not replace it
- [ ] `T-015` **Write the Cursor implementation plans, one per P0 workstream** *(day 4 of 4)*
      - *Done when:* Every P0 workstream has a numbered plan in docs/plans/ using the CLAUDE.md 9-part template, including its Guardrails and DB safety sections. A developer can start Tuesday without asking a design question.
      - *Start here:* docs/plans/ - next free number is 113; follow the template in CLAUDE.md
- [ ] `T-016` **GATE: Foundation exit - contracts published, migration path proven, 13 decisions closed**
      - *Done when:* All of: C1-C5 stubs on master; migrate deploy proven on a child branch; D-1 to D-13 all marked Decided; every P0 workstream has a numbered plan. If D-2 is unresolved, no migration merges on 9 Sep.
- [ ] `T-028` **Enumerate every gated recruiter action and name its entitlement key**
      - *Done when:* A list with one row per gated action: the Server Action file, the function, the key string, and the plan limit. Handed to shashank, Shivansh and Zainab on 5 Sep so they build against real key names.
      - **Waits on:** D-3
      - *Start here:* Walk src/app/actions/hire-actions.ts, talent-actions.ts, job-actions.ts for every mutation
- [ ] `T-166` **Install Playwright, its config and the CI workflow** *(day 1 of 2)*
      - *Done when:* npm run test:e2e runs in CI on every pull request and fails the build on a red spec.

---

# P2 CORE BUILD

*Core implementation*

## Wednesday 09 September

**Shivansh**

- [ ] `T-018` **Migration: extend Organization with website, industry, sizeBucket, logoUrl, locationCity, and the recruiter's designation + hiring need**
      - *Done when:* npx prisma migrate dev creates one additive migration. Every new column is nullable or defaulted so existing Organization rows keep loading. Rehearsed on a Neon child branch before it merges.
      - **Needs:** D-2
      - *Start here:* prisma/schema.prisma model Organization (line ~2893) and OrganizationMember
- [ ] `T-019` **Step 1 of onboarding: Create account - registration + email OTP** *(day 1 of 2)*
      - *Done when:* A fresh allow-listed email registers, receives a 6-digit code by email, enters it, and lands on step 2 - not on a search screen. A wrong code shows a readable error and does not consume the attempt budget silently.
      - **Needs:** D-6 · **Security:** Role comes from VerifiedRecruiterSeat lookup, never from anything the user submits
      - *Start here:* src/app/actions/recruiter-auth-actions.ts, prisma RecruiterEmailOtp, src/lib/email.ts
- [ ] `T-080` **Migration: Job.organizationId, status DRAFT/PUBLISHED/CLOSED, workMode, experience range**
      - *Done when:* Applied on a child branch with live Job rows intact. Existing jobs backfill to PUBLISHED and to the ABTalks organisation so nothing disappears from /jobs on deploy.
      - **Needs:** D-2
- [ ] `T-081` **Migration: JobApplication.stage + stageChangedAt**
      - *Done when:* Applied on a child branch. Every existing application backfills to SOURCED. Uses the same PipelineStage enum as TalentListItem so a job applicant and a sourced candidate sit in one pipeline vocabulary.
      - **Needs:** R5 stages
- [ ] `T-123` **Fix identity and contact: name, avatar, headline, bio, phone, location** *(day 1 of 2)*
      - *Done when:* Each field saves, survives a reload and a logout/login, rejects invalid input with a readable message, and appears on the recruiter side only where the privacy flag allows. Phone is absent from the recruiter payload unless showPhone is true.
      - **Security:** Verified by inspecting the recruiter network payload, not the screen
- [ ] `T-127` **Cut /register to five fields and route straight to the dashboard**
      - *Done when:* A fresh account reaches the dashboard in under 90 seconds on a mid-range Android, having filled five fields.

**Zainab**

- [ ] `T-092` **Migration: the four assessment tables, org-scoped** *(day 1 of 2)*
      - *Done when:* Applied on a child branch. Every table carries the organisation scope so a cross-org assessment id can 404.
      - **Needs:** D-2
- [ ] `T-147` **Implement the idempotent upsert and recomputeCandidateSkill in one transaction** *(day 1 of 3)*
      - *Done when:* Calling the emitter three times for the same activity produces exactly one row. evidenceScore moves on the first call and is unchanged on the second and third. Both writes happen inside one prisma.$transaction.

**shashank**

- [ ] `T-041` **Migration: TalentRequest.name + TalentRequestMatch state columns**
      - *Done when:* Migration applies on a child branch with existing TalentRequest rows intact. firstSeenAt defaults to now() for existing matches so nothing is falsely flagged NEW on the first load after deploy.
- [ ] `T-042` **Named talent projects: create, rename, list, archive** *(day 1 of 3)*
      - *Done when:* A recruiter creates 'Senior Backend Engineer - Delhi NCR', sees it in a project list with its criteria summary and last-activity date, renames it, and archives it. Archived projects leave the default list but are not deleted.
      - **Security:** Org-scoped: another organisation's projectId must 404
      - *Start here:* src/app/hire/[requestId]/page.tsx is the current single-project surface; add the list above it
- [ ] `T-058` **TalentList / TalentListItem become the live shortlist, keyed on candidateUserId** *(day 1 of 3)*
      - *Done when:* Shortlist a candidate in Browser A, sign out, open Browser B, sign in, and the candidate is still shortlisted in the correct project. Nothing about the shortlist is read from localStorage.
      - **Security:** Org-scoped reads and writes; another org's listId must 404
      - *Start here:* prisma TalentList (~2937) and TalentListItem (~2958) exist and are referenced by ZERO application code; RecruiterShortlistItem is FK'd to ProgramMember which is why non-cohort candidates cannot be shortlisted today
- [ ] `T-107` **Extend role-family.ts with the nine non-technical families** *(day 1 of 2)*
      - *Done when:* roleFamilyFor('Marketing Manager') returns MARKETING, not OTHER. A unit test covers one real job title per new family, taken from live ProgramMember.jobRole values. Existing technical titles return the same family they did before.
      - **Waits on:** D-12
      - *Start here:* src/features/hire/role-family.ts - RULES is ordered most-specific-first and that order carries meaning; add new rules without reordering the existing ones

**Manuvrtti**

- [ ] `T-153` **In-app delivery through the existing NotificationRead key scheme** *(day 1 of 3)*
      - *Done when:* A test notification appears in the bell with a stable key, and marking it read persists. Re-sending the same event does not create a second unread item.
      - *Start here:* prisma Notification (~1637) / NotificationRead (~1666); notificationKey is a string with no FK by design
- [ ] `T-158` **Migration: AnalyticsEvent, and track() that never blocks** *(day 1 of 3)*
      - *Done when:* track() called from a Server Action writes a row and does not delay the response. A forced database error inside track() does not fail the calling action - proven by a unit test that injects the failure.

**Sohail**

- [ ] `T-029` **Migration: SubscriptionPlan, OrganizationSubscription, EntitlementUsage** *(day 1 of 2)*
      - *Done when:* Three tables created on a child branch. SubscriptionPlan is SEED DATA holding the limits - no limit is a constant in TypeScript. EntitlementUsage is keyed (organizationId, key, periodStart) with a unique constraint.
      - **Waits on:** D-3 · **Needs:** D-2
      - *Start here:* prisma/schema.prisma; seed the three plans in prisma/seed alongside the existing per-track seeds
- [ ] `T-166` **Install Playwright, its config and the CI workflow** *(day 2 of 2)*
      - *Done when:* npm run test:e2e runs in CI on every pull request and fails the build on a red spec.
- [ ] `T-167` **db:seed:e2e fixtures: technical candidate, non-technical candidate, recruiter with an active plan, admin** *(day 1 of 3)*
      - *Done when:* Every E2E spec can start from a genuinely fresh account with production-like reference data: skills, an open cohort, an open hackathon, a published job, a published assessment.
      - *Start here:* Follow the existing per-track seed scripts in prisma/

---

## Thursday 10 September

**Shivansh**

- [ ] `T-019` **Step 1 of onboarding: Create account - registration + email OTP** *(day 2 of 2)*
      - *Done when:* A fresh allow-listed email registers, receives a 6-digit code by email, enters it, and lands on step 2 - not on a search screen. A wrong code shows a readable error and does not consume the attempt budget silently.
      - **Needs:** D-6 · **Security:** Role comes from VerifiedRecruiterSeat lookup, never from anything the user submits
      - *Start here:* src/app/actions/recruiter-auth-actions.ts, prisma RecruiterEmailOtp, src/lib/email.ts
- [ ] `T-020` **Step 2 of onboarding: Tell us about your company** *(day 1 of 2)*
      - *Done when:* Company name, website, logo upload, industry, size and location save to Organization. Reloading the page shows the saved values. Skipping the step is not possible; the Continue button stays disabled until name and website are valid.
      - **Needs:** D-7 · **Security:** requireRecruiter; the write is scoped to the recruiter's own organizationId
      - *Start here:* Vercel Blob for the logo - the avatar store pattern is in src/features/profile/avatar-storage.ts
- [ ] `T-082` **Recruiter job create and edit, with skills** *(day 1 of 3)*
      - *Done when:* A recruiter creates a job with title, description, skills, location, work mode and type; reopens it and sees every value; edits the skills and the change persists. Skills write JobSkill rows, which is what the candidate skill filter matches on.
      - **Security:** requireRecruiter + organizationId scoping on every read and write
      - *Start here:* prisma JobSkill (~2996) exists unused; src/app/actions/job-actions.ts
- [ ] `T-123` **Fix identity and contact: name, avatar, headline, bio, phone, location** *(day 2 of 2)*
      - *Done when:* Each field saves, survives a reload and a logout/login, rejects invalid input with a readable message, and appears on the recruiter side only where the privacy flag allows. Phone is absent from the recruiter payload unless showPhone is true.
      - **Security:** Verified by inspecting the recruiter network payload, not the screen
- [ ] `T-124` **Fix education, experience and internships, with delete** *(day 1 of 2)*
      - *Done when:* An internship is expressible without a workaround and renders as an internship to a recruiter. Deleting one row removes it from the editor, the public profile and the recruiter preview in the same request cycle.
      - *Start here:* prisma CandidateEducation, CandidateExperience

**Zainab**

- [ ] `T-092` **Migration: the four assessment tables, org-scoped** *(day 2 of 2)*
      - *Done when:* Applied on a child branch. Every table carries the organisation scope so a cross-org assessment id can 404.
      - **Needs:** D-2
- [ ] `T-093` **Create an assessment: title, instructions, sections, duration, marks, passing mark** *(day 1 of 3)*
      - *Done when:* A recruiter sets all six, saves a draft, reopens it and sees all six. Duration is stored in seconds and is later enforced by the server, not the browser.
      - **Security:** requireRecruiter + organizationId scoping
      - *Start here:* Sections are an ordered label on the question in V1, not a separate builder surface
- [ ] `T-147` **Implement the idempotent upsert and recomputeCandidateSkill in one transaction** *(day 2 of 3)*
      - *Done when:* Calling the emitter three times for the same activity produces exactly one row. evidenceScore moves on the first call and is unchanged on the second and third. Both writes happen inside one prisma.$transaction.

**shashank**

- [ ] `T-042` **Named talent projects: create, rename, list, archive** *(day 2 of 3)*
      - *Done when:* A recruiter creates 'Senior Backend Engineer - Delhi NCR', sees it in a project list with its criteria summary and last-activity date, renames it, and archives it. Archived projects leave the default list but are not deleted.
      - **Security:** Org-scoped: another organisation's projectId must 404
      - *Start here:* src/app/hire/[requestId]/page.tsx is the current single-project surface; add the list above it
- [ ] `T-058` **TalentList / TalentListItem become the live shortlist, keyed on candidateUserId** *(day 2 of 3)*
      - *Done when:* Shortlist a candidate in Browser A, sign out, open Browser B, sign in, and the candidate is still shortlisted in the correct project. Nothing about the shortlist is read from localStorage.
      - **Security:** Org-scoped reads and writes; another org's listId must 404
      - *Start here:* prisma TalentList (~2937) and TalentListItem (~2958) exist and are referenced by ZERO application code; RecruiterShortlistItem is FK'd to ProgramMember which is why non-cohort candidates cannot be shortlisted today
- [ ] `T-107` **Extend role-family.ts with the nine non-technical families** *(day 2 of 2)*
      - *Done when:* roleFamilyFor('Marketing Manager') returns MARKETING, not OTHER. A unit test covers one real job title per new family, taken from live ProgramMember.jobRole values. Existing technical titles return the same family they did before.
      - **Waits on:** D-12
      - *Start here:* src/features/hire/role-family.ts - RULES is ordered most-specific-first and that order carries meaning; add new rules without reordering the existing ones
- [ ] `T-108` **Seed non-technical skill categories** *(day 1 of 2)*
      - *Done when:* SkillCategory and Skill rows exist for each new family, enough that a recruiter filtering a Marketing project on skills gets a usable list rather than an empty dropdown.
      - *Start here:* prisma SkillCategory (~2256) / Skill (~2265); follow the existing per-track seed scripts

**Manuvrtti**

- [ ] `T-153` **In-app delivery through the existing NotificationRead key scheme** *(day 2 of 3)*
      - *Done when:* A test notification appears in the bell with a stable key, and marking it read persists. Re-sending the same event does not create a second unread item.
      - *Start here:* prisma Notification (~1637) / NotificationRead (~1666); notificationKey is a string with no FK by design
- [ ] `T-158` **Migration: AnalyticsEvent, and track() that never blocks** *(day 2 of 3)*
      - *Done when:* track() called from a Server Action writes a row and does not delay the response. A forced database error inside track() does not fail the calling action - proven by a unit test that injects the failure.

**Sohail**

- [ ] `T-029` **Migration: SubscriptionPlan, OrganizationSubscription, EntitlementUsage** *(day 2 of 2)*
      - *Done when:* Three tables created on a child branch. SubscriptionPlan is SEED DATA holding the limits - no limit is a constant in TypeScript. EntitlementUsage is keyed (organizationId, key, periodStart) with a unique constraint.
      - **Waits on:** D-3 · **Needs:** D-2
      - *Start here:* prisma/schema.prisma; seed the three plans in prisma/seed alongside the existing per-track seeds
- [ ] `T-030` **Implement assertEntitlement with transactional usage counters** *(day 1 of 3)*
      - *Done when:* Calling it 10 times concurrently against a limit of 5 lets exactly 5 through. The 6th returns {ok:false, message} rather than throwing. A unit test proves the concurrency case with Promise.all.
      - **Security:** Server-side only. A React dialog is never the enforcement point.
      - *Start here:* src/features/entitlement/assert.ts (the C5 stub); wrap the read-check-increment in prisma.$transaction
- [ ] `T-167` **db:seed:e2e fixtures: technical candidate, non-technical candidate, recruiter with an active plan, admin** *(day 2 of 3)*
      - *Done when:* Every E2E spec can start from a genuinely fresh account with production-like reference data: skills, an open cohort, an open hackathon, a published job, a published assessment.
      - *Start here:* Follow the existing per-track seed scripts in prisma/

---

## Friday 11 September

**Shivansh**

- [ ] `T-020` **Step 2 of onboarding: Tell us about your company** *(day 2 of 2)*
      - *Done when:* Company name, website, logo upload, industry, size and location save to Organization. Reloading the page shows the saved values. Skipping the step is not possible; the Continue button stays disabled until name and website are valid.
      - **Needs:** D-7 · **Security:** requireRecruiter; the write is scoped to the recruiter's own organizationId
      - *Start here:* Vercel Blob for the logo - the avatar store pattern is in src/features/profile/avatar-storage.ts
- [ ] `T-021` **Step 3 of onboarding: Tell us what you are hiring for**
      - *Done when:* The recruiter's designation and their hiring need save and are visible to admin. The answers pre-fill the first talent project's criteria in R3, so the recruiter is not asked the same question twice.
      - *Start here:* Store on OrganizationMember or Organization per the R1 migration; hand the shape to shashank for R3
- [ ] `T-082` **Recruiter job create and edit, with skills** *(day 2 of 3)*
      - *Done when:* A recruiter creates a job with title, description, skills, location, work mode and type; reopens it and sees every value; edits the skills and the change persists. Skills write JobSkill rows, which is what the candidate skill filter matches on.
      - **Security:** requireRecruiter + organizationId scoping on every read and write
      - *Start here:* prisma JobSkill (~2996) exists unused; src/app/actions/job-actions.ts
- [ ] `T-124` **Fix education, experience and internships, with delete** *(day 2 of 2)*
      - *Done when:* An internship is expressible without a workaround and renders as an internship to a recruiter. Deleting one row removes it from the editor, the public profile and the recruiter preview in the same request cycle.
      - *Start here:* prisma CandidateEducation, CandidateExperience
- [ ] `T-125` **Fix projects, certifications, skills and resume, with delete** *(day 1 of 3)*
      - *Done when:* Adding, editing and removing an item in each of the four persists across a logout/login. A replaced resume re-parses; a removed resume disappears from the recruiter surface immediately.
      - **Security:** showResume gates every recruiter read of the resume URL

**Zainab**

- [ ] `T-093` **Create an assessment: title, instructions, sections, duration, marks, passing mark** *(day 2 of 3)*
      - *Done when:* A recruiter sets all six, saves a draft, reopens it and sees all six. Duration is stored in seconds and is later enforced by the server, not the browser.
      - **Security:** requireRecruiter + organizationId scoping
      - *Start here:* Sections are an ordered label on the question in V1, not a separate builder surface
- [ ] `T-147` **Implement the idempotent upsert and recomputeCandidateSkill in one transaction** *(day 3 of 3)*
      - *Done when:* Calling the emitter three times for the same activity produces exactly one row. evidenceScore moves on the first call and is unchanged on the second and third. Both writes happen inside one prisma.$transaction.
- [ ] `T-148` **Wire the six learning call sites** *(day 1 of 4)*
      - *Done when:* Challenge submission accepted, program mission passed, Databricks/DS-Architect activity passed, quiz passed, project graded and hackathon result published each write evidence in the SAME transaction as the action. Six integration tests, one per site.

**shashank**

- [ ] `T-042` **Named talent projects: create, rename, list, archive** *(day 3 of 3)*
      - *Done when:* A recruiter creates 'Senior Backend Engineer - Delhi NCR', sees it in a project list with its criteria summary and last-activity date, renames it, and archives it. Archived projects leave the default list but are not deleted.
      - **Security:** Org-scoped: another organisation's projectId must 404
      - *Start here:* src/app/hire/[requestId]/page.tsx is the current single-project surface; add the list above it
- [ ] `T-043` **Hiring criteria panel: the project stores WHAT it is looking for** *(day 1 of 3)*
      - *Done when:* Role, skills, experience range, location, work mode, education, graduation year, candidate type, role family and open-to-work all save on the project. Reopening the project shows every value the recruiter set, editable in place.
      - **Waits on:** D-12
      - *Start here:* TalentRequest already carries mustHaveStack, seniority, workMode, locationCity, minExperience, maxExperience - extend, do not duplicate; jobSpecSchema is in src/lib/validations/hire.ts
- [ ] `T-058` **TalentList / TalentListItem become the live shortlist, keyed on candidateUserId** *(day 3 of 3)*
      - *Done when:* Shortlist a candidate in Browser A, sign out, open Browser B, sign in, and the candidate is still shortlisted in the correct project. Nothing about the shortlist is read from localStorage.
      - **Security:** Org-scoped reads and writes; another org's listId must 404
      - *Start here:* prisma TalentList (~2937) and TalentListItem (~2958) exist and are referenced by ZERO application code; RecruiterShortlistItem is FK'd to ProgramMember which is why non-cohort candidates cannot be shortlisted today
- [ ] `T-059` **Multi-track shortlist: cohort, challenge, hackathon and Claude candidates** *(day 1 of 2)*
      - *Done when:* One candidate from each of the four tracks is shortlisted and all four persist. This closes a live defect where only ProgramMember rows could be saved.
      - *Start here:* TalentListItem keys on candidateUserId - the one key every track shares
- [ ] `T-108` **Seed non-technical skill categories** *(day 2 of 2)*
      - *Done when:* SkillCategory and Skill rows exist for each new family, enough that a recruiter filtering a Marketing project on skills gets a usable list rather than an empty dropdown.
      - *Start here:* prisma SkillCategory (~2256) / Skill (~2265); follow the existing per-track seed scripts
- [ ] `T-109` **Role-family selection drives which optional signals a candidate is offered** *(day 1 of 3)*
      - *Done when:* A candidate choosing Design is offered portfolio, Behance, Dribbble and Figma. A candidate choosing Marketing is offered campaigns and work samples. Neither is offered GitHub as a required field, and none of the optional fields blocks profile completion.
      - **Needs:** C1
      - *Start here:* prisma CandidateLinkType already carries BEHANCE and DRIBBBLE

**Manuvrtti**

- [ ] `T-153` **In-app delivery through the existing NotificationRead key scheme** *(day 3 of 3)*
      - *Done when:* A test notification appears in the bell with a stable key, and marking it read persists. Re-sending the same event does not create a second unread item.
      - *Start here:* prisma Notification (~1637) / NotificationRead (~1666); notificationKey is a string with no FK by design
- [ ] `T-154` **Email delivery through sendEmail with a preference check and a send log** *(day 1 of 3)*
      - *Done when:* An email arrives in a real inbox. Switching the preference off stops that email and logs the suppression rather than failing silently. @abtalks.dev addresses are suppressed in production.
      - *Start here:* src/lib/email.ts - Brevo is the one configured provider; SendEmailResult already distinguishes ok from skipped
- [ ] `T-158` **Migration: AnalyticsEvent, and track() that never blocks** *(day 3 of 3)*
      - *Done when:* track() called from a Server Action writes a row and does not delay the response. A forced database error inside track() does not fail the calling action - proven by a unit test that injects the failure.
- [ ] `T-159` **Sentry wired into lib/logger.ts with team-channel alerting** *(day 1 of 2)*
      - *Done when:* A deliberate error reaches Sentry and the team channel within a minute. No console.error is introduced anywhere.
      - *Start here:* src/lib/logger.ts is the single logging seam

**Sohail**

- [ ] `T-030` **Implement assertEntitlement with transactional usage counters** *(day 2 of 3)*
      - *Done when:* Calling it 10 times concurrently against a limit of 5 lets exactly 5 through. The 6th returns {ok:false, message} rather than throwing. A unit test proves the concurrency case with Promise.all.
      - **Security:** Server-side only. A React dialog is never the enforcement point.
      - *Start here:* src/features/entitlement/assert.ts (the C5 stub); wrap the read-check-increment in prisma.$transaction
- [ ] `T-167` **db:seed:e2e fixtures: technical candidate, non-technical candidate, recruiter with an active plan, admin** *(day 3 of 3)*
      - *Done when:* Every E2E spec can start from a genuinely fresh account with production-like reference data: skills, an open cohort, an open hackathon, a published job, a published assessment.
      - *Start here:* Follow the existing per-track seed scripts in prisma/
- [ ] `T-168` **Get the first journey green in CI so every owner has a pattern to copy** *(day 1 of 2)*
      - *Done when:* One spec green on master, with a documented one-page 'how to write a spec here' note for the four builders.

---

## Saturday 12 September

**Shivansh**

- [ ] `T-082` **Recruiter job create and edit, with skills** *(day 3 of 3)*
      - *Done when:* A recruiter creates a job with title, description, skills, location, work mode and type; reopens it and sees every value; edits the skills and the change persists. Skills write JobSkill rows, which is what the candidate skill filter matches on.
      - **Security:** requireRecruiter + organizationId scoping on every read and write
      - *Start here:* prisma JobSkill (~2996) exists unused; src/app/actions/job-actions.ts
- [ ] `T-083` **Draft, publish, close and reopen** *(day 1 of 2)*
      - *Done when:* A DRAFT job returns 404 for a signed-in candidate hitting its URL directly. Publishing makes it visible. Closing stops new applications with a readable message. Reopening restores it. Publish calls assertEntitlement first.
      - **Needs:** R2 · **Security:** Draft invisibility verified by direct URL, not by absence from a list
- [ ] `T-125` **Fix projects, certifications, skills and resume, with delete** *(day 2 of 3)*
      - *Done when:* Adding, editing and removing an item in each of the four persists across a logout/login. A replaced resume re-parses; a removed resume disappears from the recruiter surface immediately.
      - **Security:** showResume gates every recruiter read of the resume URL

**Zainab**

- [ ] `T-093` **Create an assessment: title, instructions, sections, duration, marks, passing mark** *(day 3 of 3)*
      - *Done when:* A recruiter sets all six, saves a draft, reopens it and sees all six. Duration is stored in seconds and is later enforced by the server, not the browser.
      - **Security:** requireRecruiter + organizationId scoping
      - *Start here:* Sections are an ordered label on the question in V1, not a separate builder surface
- [ ] `T-094` **Question authoring: MCQ and multiple-select, with reorder, edit and delete** *(day 1 of 3)*
      - *Done when:* Adding four questions, reordering them, editing one and deleting one all persist across a reload. Saving a question with no correct option is refused with a readable message.
      - **Waits on:** D-10
- [ ] `T-148` **Wire the six learning call sites** *(day 2 of 4)*
      - *Done when:* Challenge submission accepted, program mission passed, Databricks/DS-Architect activity passed, quiz passed, project graded and hackathon result published each write evidence in the SAME transaction as the action. Six integration tests, one per site.

**shashank**

- [ ] `T-043` **Hiring criteria panel: the project stores WHAT it is looking for** *(day 2 of 3)*
      - *Done when:* Role, skills, experience range, location, work mode, education, graduation year, candidate type, role family and open-to-work all save on the project. Reopening the project shows every value the recruiter set, editable in place.
      - **Waits on:** D-12
      - *Start here:* TalentRequest already carries mustHaveStack, seniority, workMode, locationCity, minExperience, maxExperience - extend, do not duplicate; jobSpecSchema is in src/lib/validations/hire.ts
- [ ] `T-059` **Multi-track shortlist: cohort, challenge, hackathon and Claude candidates** *(day 2 of 2)*
      - *Done when:* One candidate from each of the four tracks is shortlisted and all four persist. This closes a live defect where only ProgramMember rows could be saved.
      - *Start here:* TalentListItem keys on candidateUserId - the one key every track shares
- [ ] `T-060` **Pipeline stages on each candidate in a project** *(day 1 of 3)*
      - *Done when:* A candidate can be moved through NEW, VIEWED, SHORTLISTED, CONTACT_REQUESTED, CONTACTED, ASSESSMENT_SENT, ASSESSMENT_COMPLETED, SCREENING, INTERVIEWING, OFFER, HIRED, REJECTED. The stage survives a sign-out. Moving a stage records who moved it and when.
      - *Start here:* PipelineStage enum already exists on TalentListItem - use it; extend only if D-11 stages are genuinely missing
- [ ] `T-109` **Role-family selection drives which optional signals a candidate is offered** *(day 2 of 3)*
      - *Done when:* A candidate choosing Design is offered portfolio, Behance, Dribbble and Figma. A candidate choosing Marketing is offered campaigns and work samples. Neither is offered GitHub as a required field, and none of the optional fields blocks profile completion.
      - **Needs:** C1
      - *Start here:* prisma CandidateLinkType already carries BEHANCE and DRIBBBLE

**Manuvrtti**

- [ ] `T-154` **Email delivery through sendEmail with a preference check and a send log** *(day 2 of 3)*
      - *Done when:* An email arrives in a real inbox. Switching the preference off stops that email and logs the suppression rather than failing silently. @abtalks.dev addresses are suppressed in production.
      - *Start here:* src/lib/email.ts - Brevo is the one configured provider; SendEmailResult already distinguishes ok from skipped
- [ ] `T-159` **Sentry wired into lib/logger.ts with team-channel alerting** *(day 2 of 2)*
      - *Done when:* A deliberate error reaches Sentry and the team channel within a minute. No console.error is introduced anywhere.
      - *Start here:* src/lib/logger.ts is the single logging seam

**Sohail**

- [ ] `T-030` **Implement assertEntitlement with transactional usage counters** *(day 3 of 3)*
      - *Done when:* Calling it 10 times concurrently against a limit of 5 lets exactly 5 through. The 6th returns {ok:false, message} rather than throwing. A unit test proves the concurrency case with Promise.all.
      - **Security:** Server-side only. A React dialog is never the enforcement point.
      - *Start here:* src/features/entitlement/assert.ts (the C5 stub); wrap the read-check-increment in prisma.$transaction
- [ ] `T-031` **Enforce on search run and profile unlock** *(day 1 of 2)*
      - *Done when:* With the UI removed, calling the search Server Action past the monthly limit returns {ok:false}. Same for profile unlock. Both counters increment by exactly one per successful call.
      - *Start here:* src/app/actions/hire-actions.ts, src/features/hire/search-candidates.ts
- [ ] `T-168` **Get the first journey green in CI so every owner has a pattern to copy** *(day 2 of 2)*
      - *Done when:* One spec green on master, with a documented one-page 'how to write a spec here' note for the four builders.

---

## Sunday 13 September

**Shivansh**

- [ ] `T-083` **Draft, publish, close and reopen** *(day 2 of 2)*
      - *Done when:* A DRAFT job returns 404 for a signed-in candidate hitting its URL directly. Publishing makes it visible. Closing stops new applications with a readable message. Reopening restores it. Publish calls assertEntitlement first.
      - **Needs:** R2 · **Security:** Draft invisibility verified by direct URL, not by absence from a list
- [ ] `T-084` **Candidate job browse with search and filters** *(day 1 of 3)*
      - *Done when:* Filtering by one skill on a seeded pool returns exactly the jobs carrying that JobSkill. Filters cover skills, role, location, work mode and job type. Filters run in SQL - the network response contains only the filtered rows.
      - *Start here:* src/app/jobs/page.tsx, src/app/jobs/[id]/page.tsx
- [ ] `T-114` **Build the workspace shell: persistent left nav, header, active state** *(day 1 of 3)*
      - *Done when:* Every recruiter surface renders inside one shell. The current section is visibly active. Moving between sections does not reload the page or lose scroll position on the nav.
      - **Needs:** D-13
      - *Start here:* Extend HireChrome rather than creating a second layout; src/app/hire/layout.tsx is the entry
- [ ] `T-125` **Fix projects, certifications, skills and resume, with delete** *(day 3 of 3)*
      - *Done when:* Adding, editing and removing an item in each of the four persists across a logout/login. A replaced resume re-parses; a removed resume disappears from the recruiter surface immediately.
      - **Security:** showResume gates every recruiter read of the resume URL
- [ ] `T-126` **Fix links and preferences: role/domain, opportunity types, work mode, locations, availability** *(day 1 of 2)*
      - *Done when:* Every CandidateLinkType the schema supports is reachable from the UI. Empty opportunityTypes renders as 'unstated', never as 'any'. Expected salary never appears in any recruiter payload.
      - *Start here:* prisma CandidatePreference, CandidateLink; CandidateLinkType already has PORTFOLIO, LEETCODE, CODECHEF, BEHANCE, DRIBBBLE, KAGGLE

**Zainab**

- [ ] `T-066` **Contact unlock spends a plan credit and reveals details** *(day 1 of 3)*
      - *Done when:* A recruiter with credits clicks Unlock and sees the candidate's email immediately; the counter decrements by one. A recruiter with zero credits sees the limit-reached message and NO contact details anywhere in the response payload.
      - **Waits on:** D-5 · **Needs:** R2 assertEntitlement · **Security:** Verified by inspecting the network payload, not the screen
      - *Start here:* Write TalentEngagementRequest with status CONTACT_SHARED inside the same transaction as the usage increment
- [ ] `T-094` **Question authoring: MCQ and multiple-select, with reorder, edit and delete** *(day 2 of 3)*
      - *Done when:* Adding four questions, reordering them, editing one and deleting one all persist across a reload. Saving a question with no correct option is refused with a readable message.
      - **Waits on:** D-10
- [ ] `T-148` **Wire the six learning call sites** *(day 3 of 4)*
      - *Done when:* Challenge submission accepted, program mission passed, Databricks/DS-Architect activity passed, quiz passed, project graded and hackathon result published each write evidence in the SAME transaction as the action. Six integration tests, one per site.

**shashank**

- [ ] `T-043` **Hiring criteria panel: the project stores WHAT it is looking for** *(day 3 of 3)*
      - *Done when:* Role, skills, experience range, location, work mode, education, graduation year, candidate type, role family and open-to-work all save on the project. Reopening the project shows every value the recruiter set, editable in place.
      - **Waits on:** D-12
      - *Start here:* TalentRequest already carries mustHaveStack, seniority, workMode, locationCity, minExperience, maxExperience - extend, do not duplicate; jobSpecSchema is in src/lib/validations/hire.ts
- [ ] `T-044` **Convert the match run from delete+create to an upsert that preserves firstSeenAt** *(day 1 of 2)*
      - *Done when:* Run a match, note a candidate's firstSeenAt, run it again, and firstSeenAt is unchanged. A candidate who did not match before and matches now has a firstSeenAt later than the previous run.
      - *Start here:* The current runMatchAction deletes all TalentRequestMatch rows then recreates them - that is what loses history
- [ ] `T-052` **Assemble top signals from real rows** *(day 1 of 3)*
      - *Done when:* Opening a candidate with 3 verified Node.js evidence rows shows 'Node.js - verified through 3 activities'. A candidate with zero evidence rows shows 'Not enough evidence yet' and NO skill line. The panel never renders a skill it cannot count.
      - **Needs:** P1 emitter
      - *Start here:* Read SkillEvidence grouped by skillId for the candidate; CandidateSkill.evidenceScore is the existing rollup
- [ ] `T-060` **Pipeline stages on each candidate in a project** *(day 2 of 3)*
      - *Done when:* A candidate can be moved through NEW, VIEWED, SHORTLISTED, CONTACT_REQUESTED, CONTACTED, ASSESSMENT_SENT, ASSESSMENT_COMPLETED, SCREENING, INTERVIEWING, OFFER, HIRED, REJECTED. The stage survives a sign-out. Moving a stage records who moved it and when.
      - *Start here:* PipelineStage enum already exists on TalentListItem - use it; extend only if D-11 stages are genuinely missing
- [ ] `T-109` **Role-family selection drives which optional signals a candidate is offered** *(day 3 of 3)*
      - *Done when:* A candidate choosing Design is offered portfolio, Behance, Dribbble and Figma. A candidate choosing Marketing is offered campaigns and work samples. Neither is offered GitHub as a required field, and none of the optional fields blocks profile completion.
      - **Needs:** C1
      - *Start here:* prisma CandidateLinkType already carries BEHANCE and DRIBBBLE
- [ ] `T-110` **No coding signal affects a non-technical candidate's standing** *(day 1 of 2)*
      - *Done when:* A complete Marketing profile with zero GitHub, LeetCode and CodeChef reaches the same profile-strength band as an equivalently complete engineering profile. Removing GitHub from an engineering profile does not change a Marketing candidate's rank.
      - *Start here:* src/features/profile/completeness.ts and src/features/hire/score-candidate.ts both need the role-family branch
- [ ] `T-162` **Migration: CandidateProfileView with a dedupe window** *(day 1 of 2)*
      - *Done when:* One additive table. A unique or windowed constraint means five refreshes of the same candidate by the same recruiter inside the window record one row, proven by an integration test.
      - **Waits on:** D-8

**Manuvrtti**

- [ ] `T-074` **Recruiter notification types wired to the existing key scheme** *(day 1 of 4)*
      - *Done when:* Seven recruiter events write a notification the recruiter sees in a bell: candidate applied, candidate replied, assessment completed, new project matches, contact request status, subscription near limit, subscription expired. Each key is stable and unique per event instance.
      - **Waits on:** D-9 · **Needs:** P2 notify()
      - *Start here:* prisma NotificationRead uses a notificationKey string with no FK - follow the existing 'admin:<id>' / 'hackathon:kickoff' convention
- [ ] `T-154` **Email delivery through sendEmail with a preference check and a send log** *(day 3 of 3)*
      - *Done when:* An email arrives in a real inbox. Switching the preference off stops that email and logs the suppression rather than failing silently. @abtalks.dev addresses are suppressed in production.
      - *Start here:* src/lib/email.ts - Brevo is the one configured provider; SendEmailResult already distinguishes ok from skipped

**Sohail**

- [ ] `T-031` **Enforce on search run and profile unlock** *(day 2 of 2)*
      - *Done when:* With the UI removed, calling the search Server Action past the monthly limit returns {ok:false}. Same for profile unlock. Both counters increment by exactly one per successful call.
      - *Start here:* src/app/actions/hire-actions.ts, src/features/hire/search-candidates.ts
- [ ] `T-032` **Enforce on contact unlock, outreach email, talent project create, job publish and assessment publish** *(day 1 of 4)*
      - *Done when:* Each of the five, called directly with the client bypassed at its limit, is refused server-side. Five separate assertions in the E-R7 spec, not one.
      - **Waits on:** D-5 · **Needs:** R3, R6, R8, R9
      - *Start here:* Add the assertEntitlement call as the FIRST statement inside each Server Action, before any read

---

## Monday 14 September

**Shivansh**

- [ ] `T-084` **Candidate job browse with search and filters** *(day 2 of 3)*
      - *Done when:* Filtering by one skill on a seeded pool returns exactly the jobs carrying that JobSkill. Filters cover skills, role, location, work mode and job type. Filters run in SQL - the network response contains only the filtered rows.
      - *Start here:* src/app/jobs/page.tsx, src/app/jobs/[id]/page.tsx
- [ ] `T-114` **Build the workspace shell: persistent left nav, header, active state** *(day 2 of 3)*
      - *Done when:* Every recruiter surface renders inside one shell. The current section is visibly active. Moving between sections does not reload the page or lose scroll position on the nav.
      - **Needs:** D-13
      - *Start here:* Extend HireChrome rather than creating a second layout; src/app/hire/layout.tsx is the entry
- [ ] `T-126` **Fix links and preferences: role/domain, opportunity types, work mode, locations, availability** *(day 2 of 2)*
      - *Done when:* Every CandidateLinkType the schema supports is reachable from the UI. Empty opportunityTypes renders as 'unstated', never as 'any'. Expected salary never appears in any recruiter payload.
      - *Start here:* prisma CandidatePreference, CandidateLink; CandidateLinkType already has PORTFOLIO, LEETCODE, CODECHEF, BEHANCE, DRIBBBLE, KAGGLE

**Zainab**

- [ ] `T-066` **Contact unlock spends a plan credit and reveals details** *(day 2 of 3)*
      - *Done when:* A recruiter with credits clicks Unlock and sees the candidate's email immediately; the counter decrements by one. A recruiter with zero credits sees the limit-reached message and NO contact details anywhere in the response payload.
      - **Waits on:** D-5 · **Needs:** R2 assertEntitlement · **Security:** Verified by inspecting the network payload, not the screen
      - *Start here:* Write TalentEngagementRequest with status CONTACT_SHARED inside the same transaction as the usage increment
- [ ] `T-094` **Question authoring: MCQ and multiple-select, with reorder, edit and delete** *(day 3 of 3)*
      - *Done when:* Adding four questions, reordering them, editing one and deleting one all persist across a reload. Saving a question with no correct option is refused with a readable message.
      - **Waits on:** D-10
- [ ] `T-095` **AI-drafted questions that the recruiter must approve** *(day 1 of 3)*
      - *Done when:* The recruiter asks for draft questions on a topic, reviews them, edits two and approves. Nothing AI-generated can be assigned without an explicit approval action. An unapproved draft cannot be published.
      - *Start here:* src/lib/anthropic.ts is the existing model client; approval is a boolean on AssessmentQuestion
- [ ] `T-148` **Wire the six learning call sites** *(day 4 of 4)*
      - *Done when:* Challenge submission accepted, program mission passed, Databricks/DS-Architect activity passed, quiz passed, project graded and hackathon result published each write evidence in the SAME transaction as the action. Six integration tests, one per site.
- [ ] `T-149` **Emitter failure isolation**
      - *Done when:* A forced throw inside the emitter leaves the candidate's submission successful and logs the failure. Evidence emission can never fail a user's action.
- [ ] `T-150` **Backfill script: batched, checkpointed, restartable** *(day 1 of 3)*
      - *Done when:* Runs over ~15k historical attempts to completion, survives a kill and resumes, and reports zero MigrationConflict rows on a child-branch rehearsal. Uses batched INSERT ON CONFLICT, not per-row upserts.
      - **Security:** Child branch rehearsal before production
      - *Start here:* prisma/scripts/migrate-078-bulk.ts is the batching pattern; the 078 Phase 2 rehearsal died at 4.5h from per-row upserts

**shashank**

- [ ] `T-044` **Convert the match run from delete+create to an upsert that preserves firstSeenAt** *(day 2 of 2)*
      - *Done when:* Run a match, note a candidate's firstSeenAt, run it again, and firstSeenAt is unchanged. A candidate who did not match before and matches now has a firstSeenAt later than the previous run.
      - *Start here:* The current runMatchAction deletes all TalentRequestMatch rows then recreates them - that is what loses history
- [ ] `T-052` **Assemble top signals from real rows** *(day 2 of 3)*
      - *Done when:* Opening a candidate with 3 verified Node.js evidence rows shows 'Node.js - verified through 3 activities'. A candidate with zero evidence rows shows 'Not enough evidence yet' and NO skill line. The panel never renders a skill it cannot count.
      - **Needs:** P1 emitter
      - *Start here:* Read SkillEvidence grouped by skillId for the candidate; CandidateSkill.evidenceScore is the existing rollup
- [ ] `T-060` **Pipeline stages on each candidate in a project** *(day 3 of 3)*
      - *Done when:* A candidate can be moved through NEW, VIEWED, SHORTLISTED, CONTACT_REQUESTED, CONTACTED, ASSESSMENT_SENT, ASSESSMENT_COMPLETED, SCREENING, INTERVIEWING, OFFER, HIRED, REJECTED. The stage survives a sign-out. Moving a stage records who moved it and when.
      - *Start here:* PipelineStage enum already exists on TalentListItem - use it; extend only if D-11 stages are genuinely missing
- [ ] `T-110` **No coding signal affects a non-technical candidate's standing** *(day 2 of 2)*
      - *Done when:* A complete Marketing profile with zero GitHub, LeetCode and CodeChef reaches the same profile-strength band as an equivalently complete engineering profile. Removing GitHub from an engineering profile does not change a Marketing candidate's rank.
      - *Start here:* src/features/profile/completeness.ts and src/features/hire/score-candidate.ts both need the role-family branch
- [ ] `T-162` **Migration: CandidateProfileView with a dedupe window** *(day 2 of 2)*
      - *Done when:* One additive table. A unique or windowed constraint means five refreshes of the same candidate by the same recruiter inside the window record one row, proven by an integration test.
      - **Waits on:** D-8
- [ ] `T-163` **Record the view, and refuse unauthorised callers** *(day 1 of 3)*
      - *Done when:* An approved entitled recruiter opening a candidate records one view. A candidate, an anonymous caller and a recruiter from another organisation each record nothing and are refused server-side.
      - **Security:** Three negative cases tested explicitly, not assumed

**Manuvrtti**

- [ ] `T-074` **Recruiter notification types wired to the existing key scheme** *(day 2 of 4)*
      - *Done when:* Seven recruiter events write a notification the recruiter sees in a bell: candidate applied, candidate replied, assessment completed, new project matches, contact request status, subscription near limit, subscription expired. Each key is stable and unique per event instance.
      - **Waits on:** D-9 · **Needs:** P2 notify()
      - *Start here:* prisma NotificationRead uses a notificationKey string with no FK - follow the existing 'admin:<id>' / 'hackathon:kickoff' convention

**Sohail**

- [ ] `T-032` **Enforce on contact unlock, outreach email, talent project create, job publish and assessment publish** *(day 2 of 4)*
      - *Done when:* Each of the five, called directly with the client bypassed at its limit, is refused server-side. Five separate assertions in the E-R7 spec, not one.
      - **Waits on:** D-5 · **Needs:** R3, R6, R8, R9
      - *Start here:* Add the assertEntitlement call as the FIRST statement inside each Server Action, before any read

---

## Tuesday 15 September

**Shivansh**

- [ ] `T-084` **Candidate job browse with search and filters** *(day 3 of 3)*
      - *Done when:* Filtering by one skill on a seeded pool returns exactly the jobs carrying that JobSkill. Filters cover skills, role, location, work mode and job type. Filters run in SQL - the network response contains only the filtered rows.
      - *Start here:* src/app/jobs/page.tsx, src/app/jobs/[id]/page.tsx
- [ ] `T-114` **Build the workspace shell: persistent left nav, header, active state** *(day 3 of 3)*
      - *Done when:* Every recruiter surface renders inside one shell. The current section is visibly active. Moving between sections does not reload the page or lose scroll position on the nav.
      - **Needs:** D-13
      - *Start here:* Extend HireChrome rather than creating a second layout; src/app/hire/layout.tsx is the entry
- [ ] `T-115` **Recruiter Home: what should I do next** *(day 1 of 3)*
      - *Done when:* Home shows: continue your work (each project with its new-match count), hiring activity (shortlisted, contacted, assessments pending, replies), jobs (active, applicants), and an action list. Every line links to the exact surface that resolves it. A brand-new recruiter sees a first-run version with one call to action, not empty tiles.
      - **Needs:** R3, R5, R8, R10
      - *Start here:* This replaces the current /hire landing; read counts from the R10 queries rather than writing new ones

**Zainab**

- [ ] `T-066` **Contact unlock spends a plan credit and reveals details** *(day 3 of 3)*
      - *Done when:* A recruiter with credits clicks Unlock and sees the candidate's email immediately; the counter decrements by one. A recruiter with zero credits sees the limit-reached message and NO contact details anywhere in the response payload.
      - **Waits on:** D-5 · **Needs:** R2 assertEntitlement · **Security:** Verified by inspecting the network payload, not the screen
      - *Start here:* Write TalentEngagementRequest with status CONTACT_SHARED inside the same transaction as the usage increment
- [ ] `T-067` **Migration: OutreachMessage (recruiter, candidate, project, subject, body, status, sentAt)** *(day 1 of 2)*
      - *Done when:* One additive table on a child branch. Indexed for the per-candidate history read and the per-project analytics read.
      - **Needs:** D-2
      - *Start here:* Do NOT reuse TalentEngagementMessage - that is the admin ticket thread, a different thing
- [ ] `T-095` **AI-drafted questions that the recruiter must approve** *(day 2 of 3)*
      - *Done when:* The recruiter asks for draft questions on a topic, reviews them, edits two and approves. Nothing AI-generated can be assigned without an explicit approval action. An unapproved draft cannot be published.
      - *Start here:* src/lib/anthropic.ts is the existing model client; approval is a boolean on AssessmentQuestion
- [ ] `T-136` **AUDIT: walk the mock interview journey on production with a fresh account** *(day 1 of 2)*
      - *Done when:* A written walk-through of catalogue, domain choice, start, questions, answers, completion, report and history - every break recorded with a severity and a file path. Nothing is marked working because the code exists.
      - *Start here:* src/app/mock-interviews/, src/features/interview/platform/ (domains.ts, service.ts, report.ts)
- [ ] `T-141` **AUDIT: walk the cohort journey on production with a fresh account** *(day 1 of 2)*
      - *Done when:* Discover, details, enrol, enter, activity, submit, evaluate, progress - every break recorded with a severity and an owner. Walked on the live 078-native cohorts.
      - *Start here:* /program/databricks and /program/ds-architect are the 078-native cohorts
- [ ] `T-150` **Backfill script: batched, checkpointed, restartable** *(day 2 of 3)*
      - *Done when:* Runs over ~15k historical attempts to completion, survives a kill and resumes, and reports zero MigrationConflict rows on a child-branch rehearsal. Uses batched INSERT ON CONFLICT, not per-row upserts.
      - **Security:** Child branch rehearsal before production
      - *Start here:* prisma/scripts/migrate-078-bulk.ts is the batching pattern; the 078 Phase 2 rehearsal died at 4.5h from per-row upserts

**shashank**

- [ ] `T-052` **Assemble top signals from real rows** *(day 3 of 3)*
      - *Done when:* Opening a candidate with 3 verified Node.js evidence rows shows 'Node.js - verified through 3 activities'. A candidate with zero evidence rows shows 'Not enough evidence yet' and NO skill line. The panel never renders a skill it cannot count.
      - **Needs:** P1 emitter
      - *Start here:* Read SkillEvidence grouped by skillId for the candidate; CandidateSkill.evidenceScore is the existing rollup
- [ ] `T-163` **Record the view, and refuse unauthorised callers** *(day 2 of 3)*
      - *Done when:* An approved entitled recruiter opening a candidate records one view. A candidate, an anonymous caller and a recruiter from another organisation each record nothing and are refused server-side.
      - **Security:** Three negative cases tested explicitly, not assumed

**Manuvrtti**

- [ ] `T-074` **Recruiter notification types wired to the existing key scheme** *(day 3 of 4)*
      - *Done when:* Seven recruiter events write a notification the recruiter sees in a bell: candidate applied, candidate replied, assessment completed, new project matches, contact request status, subscription near limit, subscription expired. Each key is stable and unique per event instance.
      - **Waits on:** D-9 · **Needs:** P2 notify()
      - *Start here:* prisma NotificationRead uses a notificationKey string with no FK - follow the existing 'admin:<id>' / 'hackathon:kickoff' convention

**Sohail**

- [ ] `T-032` **Enforce on contact unlock, outreach email, talent project create, job publish and assessment publish** *(day 3 of 4)*
      - *Done when:* Each of the five, called directly with the client bypassed at its limit, is refused server-side. Five separate assertions in the E-R7 spec, not one.
      - **Waits on:** D-5 · **Needs:** R3, R6, R8, R9
      - *Start here:* Add the assertEntitlement call as the FIRST statement inside each Server Action, before any read

---

## Wednesday 16 September

> **CHECKPOINT 1, this evening.** Each owner demos on a preview. A recruiter must be able to register, onboard, create a project and search. **First release-valve decision** — Sohail calls it, dropped whole.

**Shivansh**

- [ ] `T-115` **Recruiter Home: what should I do next** *(day 2 of 3)*
      - *Done when:* Home shows: continue your work (each project with its new-match count), hiring activity (shortlisted, contacted, assessments pending, replies), jobs (active, applicants), and an action list. Every line links to the exact surface that resolves it. A brand-new recruiter sees a first-run version with one call to action, not empty tiles.
      - **Needs:** R3, R5, R8, R10
      - *Start here:* This replaces the current /hire landing; read counts from the R10 queries rather than writing new ones

**Zainab**

- [ ] `T-067` **Migration: OutreachMessage (recruiter, candidate, project, subject, body, status, sentAt)** *(day 2 of 2)*
      - *Done when:* One additive table on a child branch. Indexed for the per-candidate history read and the per-project analytics read.
      - **Needs:** D-2
      - *Start here:* Do NOT reuse TalentEngagementMessage - that is the admin ticket thread, a different thing
- [ ] `T-095` **AI-drafted questions that the recruiter must approve** *(day 3 of 3)*
      - *Done when:* The recruiter asks for draft questions on a topic, reviews them, edits two and approves. Nothing AI-generated can be assigned without an explicit approval action. An unapproved draft cannot be published.
      - *Start here:* src/lib/anthropic.ts is the existing model client; approval is a boolean on AssessmentQuestion
- [ ] `T-136` **AUDIT: walk the mock interview journey on production with a fresh account** *(day 2 of 2)*
      - *Done when:* A written walk-through of catalogue, domain choice, start, questions, answers, completion, report and history - every break recorded with a severity and a file path. Nothing is marked working because the code exists.
      - *Start here:* src/app/mock-interviews/, src/features/interview/platform/ (domains.ts, service.ts, report.ts)
- [ ] `T-141` **AUDIT: walk the cohort journey on production with a fresh account** *(day 2 of 2)*
      - *Done when:* Discover, details, enrol, enter, activity, submit, evaluate, progress - every break recorded with a severity and an owner. Walked on the live 078-native cohorts.
      - *Start here:* /program/databricks and /program/ds-architect are the 078-native cohorts
- [ ] `T-142` **AUDIT: walk the hackathon journey on production, solo and team**
      - *Done when:* Discover, register, create team, join team, submit, duplicate submission, result - every break recorded. Duplicate-submission behaviour recorded explicitly rather than assumed.
      - *Start here:* src/app/hackathon/, src/features/hackathon/
- [ ] `T-150` **Backfill script: batched, checkpointed, restartable** *(day 3 of 3)*
      - *Done when:* Runs over ~15k historical attempts to completion, survives a kill and resumes, and reports zero MigrationConflict rows on a child-branch rehearsal. Uses batched INSERT ON CONFLICT, not per-row upserts.
      - **Security:** Child branch rehearsal before production
      - *Start here:* prisma/scripts/migrate-078-bulk.ts is the batching pattern; the 078 Phase 2 rehearsal died at 4.5h from per-row upserts

**shashank**

- [ ] `T-163` **Record the view, and refuse unauthorised callers** *(day 3 of 3)*
      - *Done when:* An approved entitled recruiter opening a candidate records one view. A candidate, an anonymous caller and a recruiter from another organisation each record nothing and are refused server-side.
      - **Security:** Three negative cases tested explicitly, not assumed

**Manuvrtti**

- [ ] `T-074` **Recruiter notification types wired to the existing key scheme** *(day 4 of 4)*
      - *Done when:* Seven recruiter events write a notification the recruiter sees in a bell: candidate applied, candidate replied, assessment completed, new project matches, contact request status, subscription near limit, subscription expired. Each key is stable and unique per event instance.
      - **Waits on:** D-9 · **Needs:** P2 notify()
      - *Start here:* prisma NotificationRead uses a notificationKey string with no FK - follow the existing 'admin:<id>' / 'hackathon:kickoff' convention

**Sohail**

- [ ] `T-032` **Enforce on contact unlock, outreach email, talent project create, job publish and assessment publish** *(day 4 of 4)*
      - *Done when:* Each of the five, called directly with the client bypassed at its limit, is refused server-side. Five separate assertions in the E-R7 spec, not one.
      - **Waits on:** D-5 · **Needs:** R3, R6, R8, R9
      - *Start here:* Add the assertEntitlement call as the FIRST statement inside each Server Action, before any read

---

# P3 INTEGRATION

*Feature completion + integration*

## Thursday 17 September

**Shivansh**

- [ ] `T-022` **Step 4 of onboarding: choose a plan**
      - *Done when:* The three seeded plans render with their real limits. Choosing one creates an OrganizationSubscription with status PENDING and shows 'we will activate this shortly'. No payment is taken and none is implied.
      - **Waits on:** D-3, D-4 · **Needs:** R2 plan catalogue
      - *Start here:* Reuse the copy and layout of src/components/hire/subscription-gate.tsx; it is presentation-only today
- [ ] `T-023` **Step 5: workspace initialization - land the recruiter somewhere useful** *(day 1 of 2)*
      - *Done when:* On completing onboarding the recruiter lands on the recruiter Home, not a blank search. Home shows their company name, their plan status, and one obvious next action: 'Create your first talent project'.
      - **Needs:** R12 Home
      - *Start here:* src/app/hire/page.tsx is the current entry; R12 builds the Home surface
- [ ] `T-085` **Apply once, with duplicate prevention**
      - *Done when:* A candidate applies and sees a confirmation. Replaying the Server Action directly returns a friendly {ok:false} - no 500, and the JobApplication count for that pair stays at one.
      - *Start here:* JobApplication already has @@unique([jobId, userId]) - catch the constraint, do not let it 500
- [ ] `T-086` **My Applications with a stage timeline** *(day 1 of 2)*
      - *Done when:* Each application shows its current stage and when it last changed. A stage change made by the recruiter appears here on the candidate's next load.
- [ ] `T-115` **Recruiter Home: what should I do next** *(day 3 of 3)*
      - *Done when:* Home shows: continue your work (each project with its new-match count), hiring activity (shortlisted, contacted, assessments pending, replies), jobs (active, applicants), and an action list. Every line links to the exact surface that resolves it. A brand-new recruiter sees a first-run version with one call to action, not empty tiles.
      - **Needs:** R3, R5, R8, R10
      - *Start here:* This replaces the current /hire landing; read counts from the R10 queries rather than writing new ones
- [ ] `T-116` **Design consistency pass across every recruiter surface** *(day 1 of 3)*
      - *Done when:* Typography, spacing, cards, tables, filters, badges, buttons and pipeline chips all come from docs/design-system.md tokens. A reviewer opening five recruiter screens in sequence cannot tell they were built by different people.
      - *Start here:* docs/design-system.md is binding; tokens are bare HSL triplets in globals.css wrapped at the consumption site; do not fork src/components/ui/
- [ ] `T-128` **Dashboard completion checklist driven by real persistence** *(day 1 of 2)*
      - *Done when:* A checklist item flips to complete only when that section actually holds saved data. Completing every item moves profile strength above 60%.
      - *Start here:* src/features/profile/completeness.ts

**Zainab**

- [ ] `T-068` **Compose and send an email to an unlocked candidate** *(day 1 of 3)*
      - *Done when:* From a shortlisted, unlocked candidate the recruiter enters a subject and a body, sends, and the candidate receives it in a real inbox within 60 seconds. Sending without an unlock is refused server-side.
      - **Needs:** P2 email · **Security:** assertEntitlement('outreach_email') then hasContactAccess - both, in that order
      - *Start here:* src/lib/email.ts sendEmail() is the Brevo path already used by OTP and hire alerts
- [ ] `T-096` **Preview, publish and assign to shortlisted candidates** *(day 1 of 2)*
      - *Done when:* Preview renders the real attempt surface read-only. Publishing calls assertEntitlement. Assigning to three shortlisted candidates creates exactly three assignments and cannot duplicate one.
      - **Needs:** R2, R5

**shashank**

- [ ] `T-045` **New since last visit**
      - *Done when:* Returning to a project shows a NEW badge on exactly the candidates whose firstSeenAt is after the recruiter's last visit to that project, and on no others. Opening the project updates the last-visit timestamp.
      - *Start here:* Store lastViewedAt on TalentRequest per recruiter; compare against TalentRequestMatch.firstSeenAt
- [ ] `T-046` **Push hard filters into SQL** *(day 1 of 3)*
      - *Done when:* The skills, experience, location, work-mode and role-family filters run as Prisma where clauses ANDed onto the visibility fragment. EXPLAIN on the generated query shows index scans, not a sequential scan of the whole candidate table.
      - *Start here:* src/features/hire/search-candidates.ts loads CHALLENGE_POOL_CAP=600 rows per track then ranks in memory; repositories/talent.ts holds visibleProgramMemberWhere()
- [ ] `T-053` **Assemble possible gaps against the project's criteria** *(day 1 of 2)*
      - *Done when:* For a project requiring AWS and 2 years, a candidate with no AWS evidence and 1.3 years shows exactly two gap lines naming both. A candidate meeting every criterion shows no gap section at all.
      - **Needs:** R3 criteria
      - *Start here:* Compare the project criteria object against the candidate's evidence and CandidateExperience totals
- [ ] `T-061` **Org-scoped candidate notes** *(day 1 of 2)*
      - *Done when:* A note written by one recruiter is visible to their colleague in the same organisation and returns 404 for a recruiter in another organisation. Editing a note preserves its author and updates its timestamp.
      - **Security:** Cross-org note id must 404, tested explicitly
      - *Start here:* prisma CandidateNote (~2979) exists unused - it already has the org scope
- [ ] `T-103` **Overall metrics: jobs, projects, candidates discovered / viewed / shortlisted / contacted, response rate, assessments, applications, conversion** *(day 1 of 3)*
      - *Done when:* Every number reconciles against a hand-run SQL count on seeded data. Numbers are org-scoped: a second organisation's activity never appears.
      - **Needs:** R5, R6, R8, P4 · **Security:** Org scoping verified by querying as a second organisation
- [ ] `T-111` **Recruiter searches by role family and its relevant skills** *(day 1 of 3)*
      - *Done when:* Creating a Product project and filtering returns non-technical candidates who can be shortlisted like anyone else. Their insight panel shows their real experience and work, not an empty engineering panel.
      - **Needs:** R3, R4 · **Security:** Role family is a filter, never a protected-attribute proxy - the existing hard gate stays in front of Scout

**Manuvrtti**

- [ ] `T-075` **Only three types send email** *(day 1 of 2)*
      - *Done when:* Candidate replied, assessment completed and subscription expired send email. The other four are in-app only. A recruiter moving ten candidates through stages receives zero emails from those moves.
      - **Waits on:** D-9
      - *Start here:* Channel selection belongs in the notify() call site, not in the email layer
- [ ] `T-155` **Migration: NotificationPreference, per type and per channel** *(day 1 of 2)*
      - *Done when:* A user can switch off one type on one channel. The toggle silences exactly that and nothing else, verified by triggering every type after switching one off.
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 1 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-033` **Plan catalogue: view and compare plans**
      - *Done when:* The three seeded plans render from the database with their real limits. Changing a limit in SubscriptionPlan changes the page without a code change. The recruiter's current plan is marked.
      - **Waits on:** D-3
      - *Start here:* src/components/hire/subscription-gate.tsx holds the copy; replace its hard-coded PLANS array with a server read
- [ ] `T-034` **Admin plan activation - the seam a payment webhook will later call** *(day 1 of 2)*
      - *Done when:* One function activateSubscription(orgId, planId) flips PENDING to ACTIVE, sets periodStart/periodEnd, and resets usage counters. Admin UI calls it. It is the ONLY way a subscription becomes active, so a gateway webhook can call the same function in October.
      - **Waits on:** D-4 · **Security:** requireAdmin
      - *Start here:* Keep it in one file so October's webhook has a single target
- [ ] `T-169` **Tighten /hire/* to requireRecruiter, including /hire/evidence**
      - *Done when:* Every /hire route refuses a signed-in candidate and an anonymous caller. Login, logout and the Auth.js handler are explicitly left public and verified still working.
      - **Security:** Public surfaces must NOT get requireRole - that is a known Cursor failure mode
- [ ] `T-170` **Cross-org isolation sweep across seven recruiter surfaces** *(day 1 of 3)*
      - *Done when:* Requesting another organisation's project, talent list, note, applicant, assessment, outreach message and profile-view id each returns 404 or a refusal. Seven cases, each asserted separately.

---

## Friday 18 September

**Shivansh**

- [ ] `T-023` **Step 5: workspace initialization - land the recruiter somewhere useful** *(day 2 of 2)*
      - *Done when:* On completing onboarding the recruiter lands on the recruiter Home, not a blank search. Home shows their company name, their plan status, and one obvious next action: 'Create your first talent project'.
      - **Needs:** R12 Home
      - *Start here:* src/app/hire/page.tsx is the current entry; R12 builds the Home surface
- [ ] `T-024` **Onboarding is resumable and shows progress**
      - *Done when:* Closing the browser at step 3 and signing back in returns the recruiter to step 3 with steps 1 and 2 still complete. A step indicator shows which of the five steps they are on.
      - *Start here:* Derive the current step from what is persisted; do not keep wizard state in the client only
- [ ] `T-025` **Admin approval and plan activation path** *(day 1 of 2)*
      - *Done when:* An admin sees the pending recruiter and the pending subscription, approves both, and the recruiter's entitlements are live on their next page load without a redeploy.
      - **Needs:** R2 activation · **Security:** requireAdmin on every approval and activation route
      - *Start here:* src/app/actions/admin-recruiter-actions.ts, src/app/admin/
- [ ] `T-086` **My Applications with a stage timeline** *(day 2 of 2)*
      - *Done when:* Each application shows its current stage and when it last changed. A stage change made by the recruiter appears here on the candidate's next load.
- [ ] `T-087` **Recruiter applicant list with stage transitions** *(day 1 of 3)*
      - *Done when:* The recruiter opens a job, sees its applicants, and moves one to SCREENING. The candidate sees the new stage and receives one in-app notification and one email within 60 seconds.
      - **Needs:** P2 notify · **Security:** Cross-org applicant ids must 404
- [ ] `T-116` **Design consistency pass across every recruiter surface** *(day 2 of 3)*
      - *Done when:* Typography, spacing, cards, tables, filters, badges, buttons and pipeline chips all come from docs/design-system.md tokens. A reviewer opening five recruiter screens in sequence cannot tell they were built by different people.
      - *Start here:* docs/design-system.md is binding; tokens are bare HSL triplets in globals.css wrapped at the consumption site; do not fork src/components/ui/
- [ ] `T-128` **Dashboard completion checklist driven by real persistence** *(day 2 of 2)*
      - *Done when:* A checklist item flips to complete only when that section actually holds saved data. Completing every item moves profile strength above 60%.
      - *Start here:* src/features/profile/completeness.ts
- [ ] `T-129` **Visibility control and preview as a recruiter sees me** *(day 1 of 3)*
      - *Done when:* Turning visibility off removes the candidate from a live recruiter search AND from a re-read of a stored TalentRequestMatch. The preview renders from the same component the recruiter desk uses, so a field hidden by a toggle is absent from the preview too.
      - **Waits on:** D-8 · **Security:** The preview must apply the same gating as the real read, not a relaxed copy

**Zainab**

- [ ] `T-068` **Compose and send an email to an unlocked candidate** *(day 2 of 3)*
      - *Done when:* From a shortlisted, unlocked candidate the recruiter enters a subject and a body, sends, and the candidate receives it in a real inbox within 60 seconds. Sending without an unlock is refused server-side.
      - **Needs:** P2 email · **Security:** assertEntitlement('outreach_email') then hasContactAccess - both, in that order
      - *Start here:* src/lib/email.ts sendEmail() is the Brevo path already used by OTP and hire alerts
- [ ] `T-096` **Preview, publish and assign to shortlisted candidates** *(day 2 of 2)*
      - *Done when:* Preview renders the real attempt surface read-only. Publishing calls assertEntitlement. Assigning to three shortlisted candidates creates exactly three assignments and cannot duplicate one.
      - **Needs:** R2, R5
- [ ] `T-097` **Candidate attempt: notified, timed, resumable, submitted** *(day 1 of 3)*
      - *Done when:* The candidate's notification opens the right assessment. A mid-attempt refresh keeps their answers and does not grant extra time. Submitting after the server-side duration is refused. Correct answers never appear in any network response before submission.
      - **Security:** A candidate may open only their own assignment

**shashank**

- [ ] `T-046` **Push hard filters into SQL** *(day 2 of 3)*
      - *Done when:* The skills, experience, location, work-mode and role-family filters run as Prisma where clauses ANDed onto the visibility fragment. EXPLAIN on the generated query shows index scans, not a sequential scan of the whole candidate table.
      - *Start here:* src/features/hire/search-candidates.ts loads CHALLENGE_POOL_CAP=600 rows per track then ranks in memory; repositories/talent.ts holds visibleProgramMemberWhere()
- [ ] `T-053` **Assemble possible gaps against the project's criteria** *(day 2 of 2)*
      - *Done when:* For a project requiring AWS and 2 years, a candidate with no AWS evidence and 1.3 years shows exactly two gap lines naming both. A candidate meeting every criterion shows no gap section at all.
      - **Needs:** R3 criteria
      - *Start here:* Compare the project criteria object against the candidate's evidence and CandidateExperience totals
- [ ] `T-054` **Every claim opens its evidence** *(day 1 of 2)*
      - *Done when:* Clicking 'verified through 3 activities' opens the three underlying items - the submission, the project, the assessment - each naming what it was and when. A claim with no openable source is a defect, not a design choice.
      - **Security:** Evidence detail respects showAssessmentScores and showInterviewResults
      - *Start here:* src/app/hire/evidence/page.tsx already renders an evidence surface - reuse it rather than building a second one
- [ ] `T-061` **Org-scoped candidate notes** *(day 2 of 2)*
      - *Done when:* A note written by one recruiter is visible to their colleague in the same organisation and returns 404 for a recruiter in another organisation. Editing a note preserves its author and updates its timestamp.
      - **Security:** Cross-org note id must 404, tested explicitly
      - *Start here:* prisma CandidateNote (~2979) exists unused - it already has the org scope
- [ ] `T-062` **The Talent Hub board: who needs action** *(day 1 of 3)*
      - *Done when:* The hub groups candidates by stage and shows an 'awaiting action' count. A recruiter returning after three days can answer, without clicking into anything: who did I look at, who replied, who finished the test, who is advancing.
      - *Start here:* src/components/hire/ - the desk has a Shortlist view today; this replaces it with a staged board
- [ ] `T-103` **Overall metrics: jobs, projects, candidates discovered / viewed / shortlisted / contacted, response rate, assessments, applications, conversion** *(day 2 of 3)*
      - *Done when:* Every number reconciles against a hand-run SQL count on seeded data. Numbers are org-scoped: a second organisation's activity never appears.
      - **Needs:** R5, R6, R8, P4 · **Security:** Org scoping verified by querying as a second organisation
- [ ] `T-111` **Recruiter searches by role family and its relevant skills** *(day 2 of 3)*
      - *Done when:* Creating a Product project and filtering returns non-technical candidates who can be shortlisted like anyone else. Their insight panel shows their real experience and work, not an empty engineering panel.
      - **Needs:** R3, R4 · **Security:** Role family is a filter, never a protected-attribute proxy - the existing hard gate stays in front of Scout

**Manuvrtti**

- [ ] `T-075` **Only three types send email** *(day 2 of 2)*
      - *Done when:* Candidate replied, assessment completed and subscription expired send email. The other four are in-app only. A recruiter moving ten candidates through stages receives zero emails from those moves.
      - **Waits on:** D-9
      - *Start here:* Channel selection belongs in the notify() call site, not in the email layer
- [ ] `T-076` **Recruiter notification centre** *(day 1 of 2)*
      - *Done when:* The centre shows what happened, which candidate/project/job/assessment it concerns, when, and a working link. Clicking a 'candidate applied' item opens that applicant, not a list.
      - *Start here:* src/components/ - the candidate notification bell from plan 067 is the pattern to follow
- [ ] `T-155` **Migration: NotificationPreference, per type and per channel** *(day 2 of 2)*
      - *Done when:* A user can switch off one type on one channel. The toggle silences exactly that and nothing else, verified by triggering every type after switching one off.
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 2 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-034` **Admin plan activation - the seam a payment webhook will later call** *(day 2 of 2)*
      - *Done when:* One function activateSubscription(orgId, planId) flips PENDING to ACTIVE, sets periodStart/periodEnd, and resets usage counters. Admin UI calls it. It is the ONLY way a subscription becomes active, so a gateway webhook can call the same function in October.
      - **Waits on:** D-4 · **Security:** requireAdmin
      - *Start here:* Keep it in one file so October's webhook has a single target
- [ ] `T-035` **Usage meter - the recruiter can see what they have used** *(day 1 of 2)*
      - *Done when:* A panel shows each limit as used/total. Running one search increments the search figure on the next load. A recruiter at 90% of any limit sees a warning state.
      - *Start here:* Read EntitlementUsage for the current period; render with the design-system stat pattern
- [ ] `T-170` **Cross-org isolation sweep across seven recruiter surfaces** *(day 2 of 3)*
      - *Done when:* Requesting another organisation's project, talent list, note, applicant, assessment, outreach message and profile-view id each returns 404 or a refusal. Seven cases, each asserted separately.

---

## Saturday 19 September

**Shivansh**

- [ ] `T-025` **Admin approval and plan activation path** *(day 2 of 2)*
      - *Done when:* An admin sees the pending recruiter and the pending subscription, approves both, and the recruiter's entitlements are live on their next page load without a redeploy.
      - **Needs:** R2 activation · **Security:** requireAdmin on every approval and activation route
      - *Start here:* src/app/actions/admin-recruiter-actions.ts, src/app/admin/
- [ ] `T-087` **Recruiter applicant list with stage transitions** *(day 2 of 3)*
      - *Done when:* The recruiter opens a job, sees its applicants, and moves one to SCREENING. The candidate sees the new stage and receives one in-app notification and one email within 60 seconds.
      - **Needs:** P2 notify · **Security:** Cross-org applicant ids must 404
- [ ] `T-116` **Design consistency pass across every recruiter surface** *(day 3 of 3)*
      - *Done when:* Typography, spacing, cards, tables, filters, badges, buttons and pipeline chips all come from docs/design-system.md tokens. A reviewer opening five recruiter screens in sequence cannot tell they were built by different people.
      - *Start here:* docs/design-system.md is binding; tokens are bare HSL triplets in globals.css wrapped at the consumption site; do not fork src/components/ui/
- [ ] `T-117` **Interaction quality pass** *(day 1 of 3)*
      - *Done when:* Skeleton loaders on every list, empty states that name the next action, readable errors, confirmation on destructive actions, toasts only on background success, and no unnecessary full-page reload on a filter change.
      - *Start here:* sonner is already the toast library; Base UI button semantics mean buttonVariants on a Link, never Button asChild
- [ ] `T-129` **Visibility control and preview as a recruiter sees me** *(day 2 of 3)*
      - *Done when:* Turning visibility off removes the candidate from a live recruiter search AND from a re-read of a stored TalentRequestMatch. The preview renders from the same component the recruiter desk uses, so a field hidden by a toggle is absent from the preview too.
      - **Waits on:** D-8 · **Security:** The preview must apply the same gating as the real read, not a relaxed copy

**Zainab**

- [ ] `T-068` **Compose and send an email to an unlocked candidate** *(day 3 of 3)*
      - *Done when:* From a shortlisted, unlocked candidate the recruiter enters a subject and a body, sends, and the candidate receives it in a real inbox within 60 seconds. Sending without an unlock is refused server-side.
      - **Needs:** P2 email · **Security:** assertEntitlement('outreach_email') then hasContactAccess - both, in that order
      - *Start here:* src/lib/email.ts sendEmail() is the Brevo path already used by OTP and hire alerts
- [ ] `T-069` **Four outreach templates with variable substitution and preview** *(day 1 of 2)*
      - *Done when:* Initial outreach, interview invite, assessment invite and follow-up. Choosing one fills the subject and body with the candidate's name, the company and the role. The preview shows the substituted text, not the raw variables.
      - *Start here:* Keep templates as a plain TypeScript map; this is hiring outreach, not marketing automation
- [ ] `T-097` **Candidate attempt: notified, timed, resumable, submitted** *(day 2 of 3)*
      - *Done when:* The candidate's notification opens the right assessment. A mid-attempt refresh keeps their answers and does not grant extra time. Submitting after the server-side duration is refused. Correct answers never appear in any network response before submission.
      - **Security:** A candidate may open only their own assignment

**shashank**

- [ ] `T-046` **Push hard filters into SQL** *(day 3 of 3)*
      - *Done when:* The skills, experience, location, work-mode and role-family filters run as Prisma where clauses ANDed onto the visibility fragment. EXPLAIN on the generated query shows index scans, not a sequential scan of the whole candidate table.
      - *Start here:* src/features/hire/search-candidates.ts loads CHALLENGE_POOL_CAP=600 rows per track then ranks in memory; repositories/talent.ts holds visibleProgramMemberWhere()
- [ ] `T-047` **Migration: search indexes via CREATE INDEX CONCURRENTLY** *(day 1 of 2)*
      - *Done when:* Indexes on the columns the SQL filters now use. Applied without locking the table. Search p95 measured before and after and both numbers recorded.
      - *Start here:* CandidateSkill, CandidatePreference (GIN), CandidateEducation - see plan 112 section 8
- [ ] `T-054` **Every claim opens its evidence** *(day 2 of 2)*
      - *Done when:* Clicking 'verified through 3 activities' opens the three underlying items - the submission, the project, the assessment - each naming what it was and when. A claim with no openable source is a defect, not a design choice.
      - **Security:** Evidence detail respects showAssessmentScores and showInterviewResults
      - *Start here:* src/app/hire/evidence/page.tsx already renders an evidence surface - reuse it rather than building a second one
- [ ] `T-055` **Facts and inference are visually and semantically distinct**
      - *Done when:* Facts and inference use different treatments, and a screen reader announces which is which. A reviewer given the panel with no training can say which lines the platform can prove.
      - **Waits on:** D-11
      - *Start here:* docs/design-system.md - state which existing pattern carries each class; flag a new pattern if you need one
- [ ] `T-056` **Overall match verdict, computed from the same rows** *(day 1 of 2)*
      - *Done when:* The Strong / Possible / Not enough evidence verdict follows the rule written in D-11 exactly. Two reviewers reading the same candidate reach the same verdict by hand. No hidden weighting.
      - *Start here:* src/features/hire/score-candidate.ts already scores; make the verdict a pure function with a unit test
- [ ] `T-062` **The Talent Hub board: who needs action** *(day 2 of 3)*
      - *Done when:* The hub groups candidates by stage and shows an 'awaiting action' count. A recruiter returning after three days can answer, without clicking into anything: who did I look at, who replied, who finished the test, who is advancing.
      - *Start here:* src/components/hire/ - the desk has a Shortlist view today; this replaces it with a staged board
- [ ] `T-103` **Overall metrics: jobs, projects, candidates discovered / viewed / shortlisted / contacted, response rate, assessments, applications, conversion** *(day 3 of 3)*
      - *Done when:* Every number reconciles against a hand-run SQL count on seeded data. Numbers are org-scoped: a second organisation's activity never appears.
      - **Needs:** R5, R6, R8, P4 · **Security:** Org scoping verified by querying as a second organisation
- [ ] `T-104` **Per-project metrics** *(day 1 of 2)*
      - *Done when:* Each project shows matched, new, viewed, shortlisted, contacted, assessment-completed, interviewing and hired. Shortlisting one candidate moves exactly one number.
      - **Needs:** R3, R5
- [ ] `T-111` **Recruiter searches by role family and its relevant skills** *(day 3 of 3)*
      - *Done when:* Creating a Product project and filtering returns non-technical candidates who can be shortlisted like anyone else. Their insight panel shows their real experience and work, not an empty engineering panel.
      - **Needs:** R3, R4 · **Security:** Role family is a filter, never a protected-attribute proxy - the existing hard gate stays in front of Scout
- [ ] `T-164` **Views feed the recruiter's own analytics**
      - *Done when:* The 'candidates viewed' number on the analytics surface equals a hand-run count of CandidateProfileView rows for that organisation and period.
      - **Needs:** R10

**Manuvrtti**

- [ ] `T-076` **Recruiter notification centre** *(day 2 of 2)*
      - *Done when:* The centre shows what happened, which candidate/project/job/assessment it concerns, when, and a working link. Clicking a 'candidate applied' item opens that applicant, not a list.
      - *Start here:* src/components/ - the candidate notification bell from plan 067 is the pattern to follow
- [ ] `T-077` **Recruiter notification preferences** *(day 1 of 2)*
      - *Done when:* Each of the seven types can be switched off per channel. Switching off 'assessment completed' email stops that email and nothing else. Verified by triggering all seven after switching one off.
      - *Start here:* prisma NotificationPreference from P3 - reuse it, do not add a recruiter-only table
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 3 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-035` **Usage meter - the recruiter can see what they have used** *(day 2 of 2)*
      - *Done when:* A panel shows each limit as used/total. Running one search increments the search figure on the next load. A recruiter at 90% of any limit sees a warning state.
      - *Start here:* Read EntitlementUsage for the current period; render with the design-system stat pattern
- [ ] `T-036` **Limit-reached experience: refusal, explanation and an upgrade path** *(day 1 of 2)*
      - *Done when:* Hitting a limit in the UI shows what was blocked, which limit was hit, and a link to the plans page - not a generic error toast. The refusal message comes from the server's {ok:false} envelope.
      - *Start here:* Surface the message field from the Result envelope; do not invent client-side copy
- [ ] `T-170` **Cross-org isolation sweep across seven recruiter surfaces** *(day 3 of 3)*
      - *Done when:* Requesting another organisation's project, talent list, note, applicant, assessment, outreach message and profile-view id each returns 404 or a refusal. Seven cases, each asserted separately.

---

## Sunday 20 September

**Shivansh**

- [ ] `T-087` **Recruiter applicant list with stage transitions** *(day 3 of 3)*
      - *Done when:* The recruiter opens a job, sees its applicants, and moves one to SCREENING. The candidate sees the new stage and receives one in-app notification and one email within 60 seconds.
      - **Needs:** P2 notify · **Security:** Cross-org applicant ids must 404
- [ ] `T-088` **Move an applicant into a talent project - one candidate, no duplicate record** *(day 1 of 2)*
      - *Done when:* From the applicant list the recruiter adds an applicant to a talent project. The candidate appears in that project's Talent Hub keyed on the SAME candidateUserId, with their application history visible. No second candidate record is created.
      - **Needs:** R5
      - *Start here:* This is the C4 seam: addApplicantToTalentList(talentListId, candidateUserId, source)
- [ ] `T-117` **Interaction quality pass** *(day 2 of 3)*
      - *Done when:* Skeleton loaders on every list, empty states that name the next action, readable errors, confirmation on destructive actions, toasts only on background success, and no unnecessary full-page reload on a filter change.
      - *Start here:* sonner is already the toast library; Base UI button semantics mean buttonVariants on a Link, never Button asChild
- [ ] `T-129` **Visibility control and preview as a recruiter sees me** *(day 3 of 3)*
      - *Done when:* Turning visibility off removes the candidate from a live recruiter search AND from a re-read of a stored TalentRequestMatch. The preview renders from the same component the recruiter desk uses, so a field hidden by a toggle is absent from the preview too.
      - **Waits on:** D-8 · **Security:** The preview must apply the same gating as the real read, not a relaxed copy
- [ ] `T-130` **Persistence and removal sweep across every section** *(day 1 of 2)*
      - *Done when:* Fill every section, save, log out, log back in: nothing is lost. Then remove one item from three different sections: each disappears from the editor, the public profile, the recruiter preview and recruiter search.

**Zainab**

- [ ] `T-069` **Four outreach templates with variable substitution and preview** *(day 2 of 2)*
      - *Done when:* Initial outreach, interview invite, assessment invite and follow-up. Choosing one fills the subject and body with the candidate's name, the company and the role. The preview shows the substituted text, not the raw variables.
      - *Start here:* Keep templates as a plain TypeScript map; this is hiring outreach, not marketing automation
- [ ] `T-070` **Send status, timestamp and per-candidate outreach history** *(day 1 of 2)*
      - *Done when:* After sending, the candidate shows 'Contacted <date>' and the message is readable in a history list. A failed Brevo send shows FAILED with a retry, never a silent success.
      - *Start here:* Record the sendEmail result; SendEmailResult already distinguishes ok from skipped
- [ ] `T-097` **Candidate attempt: notified, timed, resumable, submitted** *(day 3 of 3)*
      - *Done when:* The candidate's notification opens the right assessment. A mid-attempt refresh keeps their answers and does not grant extra time. Submitting after the server-side duration is refused. Correct answers never appear in any network response before submission.
      - **Security:** A candidate may open only their own assignment
- [ ] `T-098` **Deterministic auto-evaluation writing AssessmentReport and AssessmentScore** *(day 1 of 2)*
      - *Done when:* A paper with four known answers scores exactly as hand-calculated. Re-running evaluation on the same attempt produces the same score and no second report row.

**shashank**

- [ ] `T-047` **Migration: search indexes via CREATE INDEX CONCURRENTLY** *(day 2 of 2)*
      - *Done when:* Indexes on the columns the SQL filters now use. Applied without locking the table. Search p95 measured before and after and both numbers recorded.
      - *Start here:* CandidateSkill, CandidatePreference (GIN), CandidateEducation - see plan 112 section 8
- [ ] `T-056` **Overall match verdict, computed from the same rows** *(day 2 of 2)*
      - *Done when:* The Strong / Possible / Not enough evidence verdict follows the rule written in D-11 exactly. Two reviewers reading the same candidate reach the same verdict by hand. No hidden weighting.
      - *Start here:* src/features/hire/score-candidate.ts already scores; make the verdict a pure function with a unit test
- [ ] `T-062` **The Talent Hub board: who needs action** *(day 3 of 3)*
      - *Done when:* The hub groups candidates by stage and shows an 'awaiting action' count. A recruiter returning after three days can answer, without clicking into anything: who did I look at, who replied, who finished the test, who is advancing.
      - *Start here:* src/components/hire/ - the desk has a Shortlist view today; this replaces it with a staged board
- [ ] `T-104` **Per-project metrics** *(day 2 of 2)*
      - *Done when:* Each project shows matched, new, viewed, shortlisted, contacted, assessment-completed, interviewing and hired. Shortlisting one candidate moves exactly one number.
      - **Needs:** R3, R5
- [ ] `T-105` **The analytics surface, built on the design-system stat pattern** *(day 1 of 2)*
      - *Done when:* Every tile states the question it answers. There is no chart present that a recruiter cannot act on. Empty, loading and error states exist for a recruiter with no activity yet.
      - *Start here:* docs/design-system.md - reuse the existing stat pattern in src/components/design/, do not add a chart library

**Manuvrtti**

- [ ] `T-077` **Recruiter notification preferences** *(day 2 of 2)*
      - *Done when:* Each of the seven types can be switched off per channel. Switching off 'assessment completed' email stops that email and nothing else. Verified by triggering all seven after switching one off.
      - *Start here:* prisma NotificationPreference from P3 - reuse it, do not add a recruiter-only table
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 4 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-036` **Limit-reached experience: refusal, explanation and an upgrade path** *(day 2 of 2)*
      - *Done when:* Hitting a limit in the UI shows what was blocked, which limit was hit, and a link to the plans page - not a generic error toast. The refusal message comes from the server's {ok:false} envelope.
      - *Start here:* Surface the message field from the Result envelope; do not invent client-side copy
- [ ] `T-037` **Expiry and renewal handling** *(day 1 of 2)*
      - *Done when:* A subscription past periodEnd stops satisfying assertEntitlement on the next call - not on a cron delay. The recruiter sees an expired banner and their data is still there, read-only where appropriate.
      - **Needs:** R7
      - *Start here:* Check periodEnd inside assertEntitlement itself, so nothing can be reached through a stale flag
- [ ] `T-171` **PII and contact leak sweep across every recruiter payload** *(day 1 of 3)*
      - *Done when:* For a candidate whose contact has not been unlocked, no email, phone or resume URL appears in any network response on the desk, the inspector, the analytics surface or /hire/evidence.
      - **Security:** Inspect the raw payload, not the rendered screen

---

## Monday 21 September

**Shivansh**

- [ ] `T-088` **Move an applicant into a talent project - one candidate, no duplicate record** *(day 2 of 2)*
      - *Done when:* From the applicant list the recruiter adds an applicant to a talent project. The candidate appears in that project's Talent Hub keyed on the SAME candidateUserId, with their application history visible. No second candidate record is created.
      - **Needs:** R5
      - *Start here:* This is the C4 seam: addApplicantToTalentList(talentListId, candidateUserId, source)
- [ ] `T-117` **Interaction quality pass** *(day 3 of 3)*
      - *Done when:* Skeleton loaders on every list, empty states that name the next action, readable errors, confirmation on destructive actions, toasts only on background success, and no unnecessary full-page reload on a filter change.
      - *Start here:* sonner is already the toast library; Base UI button semantics mean buttonVariants on a Link, never Button asChild
- [ ] `T-118` **The search surface specifically: filters, active criteria, project context** *(day 1 of 3)*
      - *Done when:* Filters are grouped and labelled, active filters are visible and individually removable, the project name is prominent, candidate cards are scannable at a glance, and the shortlist action is obvious without a tooltip.
      - **Needs:** R3
- [ ] `T-130` **Persistence and removal sweep across every section** *(day 2 of 2)*
      - *Done when:* Fill every section, save, log out, log back in: nothing is lost. Then remove one item from three different sections: each disappears from the editor, the public profile, the recruiter preview and recruiter search.

**Zainab**

- [ ] `T-070` **Send status, timestamp and per-candidate outreach history** *(day 2 of 2)*
      - *Done when:* After sending, the candidate shows 'Contacted <date>' and the message is readable in a history list. A failed Brevo send shows FAILED with a retry, never a silent success.
      - *Start here:* Record the sendEmail result; SendEmailResult already distinguishes ok from skipped
- [ ] `T-071` **Sending moves the candidate to CONTACTED**
      - *Done when:* Sending the first email moves that candidate's pipeline stage to CONTACTED automatically. Sending a second email does not move an already-advanced candidate backwards.
      - **Needs:** R5 pipeline
- [ ] `T-098` **Deterministic auto-evaluation writing AssessmentReport and AssessmentScore** *(day 2 of 2)*
      - *Done when:* A paper with four known answers scores exactly as hand-calculated. Re-running evaluation on the same attempt produces the same score and no second report row.
- [ ] `T-099` **The score emits SkillEvidence for the assessment's tagged skills** *(day 1 of 2)*
      - *Done when:* A completed assessment writes one SkillEvidence row per tagged skill through emitSkillEvidence. Re-evaluating creates no duplicate. The score then appears in the candidate's insights panel.
      - **Needs:** P1, R4
- [ ] `T-137` **Fix every S1 the audit found in entry, run and report** *(day 1 of 2)*
      - *Done when:* Every S1 from the audit is closed or descoped in writing. A fresh account reaches a running interview, answers by text, completes it, and reads a report with strengths, weaknesses and improvements.

**shashank**

- [ ] `T-048` **Project analytics strip** *(day 1 of 2)*
      - *Done when:* Each project shows matched, new, viewed, shortlisted, contacted and assessment-completed counts. Shortlisting one candidate moves the shortlisted number by exactly one on reload.
      - **Needs:** R5, R10
- [ ] `T-105` **The analytics surface, built on the design-system stat pattern** *(day 2 of 2)*
      - *Done when:* Every tile states the question it answers. There is no chart present that a recruiter cannot act on. Empty, loading and error states exist for a recruiter with no activity yet.
      - *Start here:* docs/design-system.md - reuse the existing stat pattern in src/components/design/, do not add a chart library

**Manuvrtti**

- [ ] `T-133` **One connector UI for GitHub, LeetCode and CodeChef - declared links with trust labels** *(day 1 of 3)*
      - *Done when:* Each of the three can be connected with a handle or URL, validated for format, disconnected and reconnected. A malformed handle is refused with a readable message. Nothing is fetched from an external API in September.
      - *Start here:* prisma CandidateLink already carries GITHUB, LEETCODE, CODECHEF - store there; CandidateProfile.githubUsername already exists
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 5 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-037` **Expiry and renewal handling** *(day 2 of 2)*
      - *Done when:* A subscription past periodEnd stops satisfying assertEntitlement on the next call - not on a cron delay. The recruiter sees an expired banner and their data is still there, read-only where appropriate.
      - **Needs:** R7
      - *Start here:* Check periodEnd inside assertEntitlement itself, so nothing can be reached through a stale flag
- [ ] `T-171` **PII and contact leak sweep across every recruiter payload** *(day 2 of 3)*
      - *Done when:* For a candidate whose contact has not been unlocked, no email, phone or resume URL appears in any network response on the desk, the inspector, the analytics surface or /hire/evidence.
      - **Security:** Inspect the raw payload, not the rendered screen
- [ ] `T-172` **Rate limits on OTP request, job apply, outreach send and assessment submit** *(day 1 of 3)*
      - *Done when:* Each throttles with a readable message rather than a 500, and the limit resets as documented.

---

## Tuesday 22 September

**Shivansh**

- [ ] `T-118` **The search surface specifically: filters, active criteria, project context** *(day 2 of 3)*
      - *Done when:* Filters are grouped and labelled, active filters are visible and individually removable, the project name is prominent, candidate cards are scannable at a glance, and the shortlist action is obvious without a tooltip.
      - **Needs:** R3

**Zainab**

- [ ] `T-099` **The score emits SkillEvidence for the assessment's tagged skills** *(day 2 of 2)*
      - *Done when:* A completed assessment writes one SkillEvidence row per tagged skill through emitSkillEvidence. Re-evaluating creates no duplicate. The score then appears in the candidate's insights panel.
      - **Needs:** P1, R4
- [ ] `T-137` **Fix every S1 the audit found in entry, run and report** *(day 2 of 2)*
      - *Done when:* Every S1 from the audit is closed or descoped in writing. A fresh account reaches a running interview, answers by text, completes it, and reads a report with strengths, weaknesses and improvements.
- [ ] `T-138` **The report emits SkillEvidence and reaches the recruiter card** *(day 1 of 2)*
      - *Done when:* A completed interview writes exactly one SkillEvidence row through emitSkillEvidence. Re-generating the report creates no duplicate. The signal appears on the recruiter card where showInterviewResults allows.
      - **Needs:** P1
- [ ] `T-143` **Fix every S1 from both audits** *(day 1 of 2)*
      - *Done when:* Every S1 closed or descoped in writing. A fresh user can complete both journeys end to end.

**shashank**

- [ ] `T-048` **Project analytics strip** *(day 2 of 2)*
      - *Done when:* Each project shows matched, new, viewed, shortlisted, contacted and assessment-completed counts. Shortlisting one candidate moves the shortlisted number by exactly one on reload.
      - **Needs:** R5, R10
- [ ] `T-063` **Migrate existing RecruiterShortlistItem rows onto TalentListItem** *(day 1 of 2)*
      - *Done when:* Row count in RecruiterShortlistItem before equals row count created in TalentListItem after. Any discrepancy blocks the cutover. Rehearsed on a child branch first.
      - **Security:** Child branch rehearsal first

**Manuvrtti**

- [ ] `T-133` **One connector UI for GitHub, LeetCode and CodeChef - declared links with trust labels** *(day 2 of 3)*
      - *Done when:* Each of the three can be connected with a handle or URL, validated for format, disconnected and reconnected. A malformed handle is refused with a readable message. Nothing is fetched from an external API in September.
      - *Start here:* prisma CandidateLink already carries GITHUB, LEETCODE, CODECHEF - store there; CandidateProfile.githubUsername already exists
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 6 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-171` **PII and contact leak sweep across every recruiter payload** *(day 3 of 3)*
      - *Done when:* For a candidate whose contact has not been unlocked, no email, phone or resume URL appears in any network response on the desk, the inspector, the analytics surface or /hire/evidence.
      - **Security:** Inspect the raw payload, not the rendered screen
- [ ] `T-172` **Rate limits on OTP request, job apply, outreach send and assessment submit** *(day 2 of 3)*
      - *Done when:* Each throttles with a readable message rather than a 500, and the limit resets as documented.

---

## Wednesday 23 September

> **CHECKPOINT 2, this evening.** The WHOLE recruiter journey must be walkable on a preview, even if rough. **Final valve decision.** Anything not walkable today is descoped in writing — it does not get carried into the last two days.

**Shivansh**

- [ ] `T-118` **The search surface specifically: filters, active criteria, project context** *(day 3 of 3)*
      - *Done when:* Filters are grouped and labelled, active filters are visible and individually removable, the project name is prominent, candidate cards are scannable at a glance, and the shortlist action is obvious without a tooltip.
      - **Needs:** R3

**Zainab**

- [ ] `T-138` **The report emits SkillEvidence and reaches the recruiter card** *(day 2 of 2)*
      - *Done when:* A completed interview writes exactly one SkillEvidence row through emitSkillEvidence. Re-generating the report creates no duplicate. The signal appears on the recruiter card where showInterviewResults allows.
      - **Needs:** P1
- [ ] `T-143` **Fix every S1 from both audits** *(day 2 of 2)*
      - *Done when:* Every S1 closed or descoped in writing. A fresh user can complete both journeys end to end.
- [ ] `T-144` **Both journeys write evidence, and the recruiter can see it** *(day 1 of 2)*
      - *Done when:* A completed cohort activity and a published hackathon result each write a SkillEvidence row, update the profile, and produce a signal the recruiter side can shortlist on. 'The emitter fired' is not sufficient - the recruiter view is checked.
      - **Needs:** P1, R5

**shashank**

- [ ] `T-063` **Migrate existing RecruiterShortlistItem rows onto TalentListItem** *(day 2 of 2)*
      - *Done when:* Row count in RecruiterShortlistItem before equals row count created in TalentListItem after. Any discrepancy blocks the cutover. Rehearsed on a child branch first.
      - **Security:** Child branch rehearsal first

**Manuvrtti**

- [ ] `T-133` **One connector UI for GitHub, LeetCode and CodeChef - declared links with trust labels** *(day 3 of 3)*
      - *Done when:* Each of the three can be connected with a handle or URL, validated for format, disconnected and reconnected. A malformed handle is refused with a readable message. Nothing is fetched from an external API in September.
      - *Start here:* prisma CandidateLink already carries GITHUB, LEETCODE, CODECHEF - store there; CandidateProfile.githubUsername already exists
- [ ] `T-160` **Instrument every named event, pairing with each stream owner** *(day 7 of 7)*
      - *Done when:* Every event in the frozen taxonomy fires during a manual walkthrough and is queryable by userId and time. The recruiter analytics numbers in R10 read these rows.

**Sohail**

- [ ] `T-172` **Rate limits on OTP request, job apply, outreach send and assessment submit** *(day 3 of 3)*
      - *Done when:* Each throttles with a readable message rather than a 500, and the limit resets as documented.

---

# P4 FINAL

*Final feature completion*

## Thursday 24 September

**Shivansh**

- [ ] `T-026` **Empty, loading and error states across all five onboarding steps**
      - *Done when:* Each step has a designed loading state, a readable error on a failed save, and no step shows a spinner that never resolves. Verified at 390px.
- [ ] `T-089` **Write E2E E-R5 and E-C3** *(day 1 of 2)*
      - *Done when:* E-R5: recruiter posts a job, candidate applies, recruiter shortlists, emails, moves stage, candidate notified. E-C3: candidate browses, filters, applies, tracks. Both green in CI.
- [ ] `T-119` **Responsive pass: tablet and 390px mobile across every recruiter surface** *(day 1 of 2)*
      - *Done when:* No horizontal scroll, no clipped CTA, tap targets 44px or larger, and the left nav collapses to something usable rather than disappearing.
- [ ] `T-131` **States and 390px pass across the profile editor and public profile**
      - *Done when:* Every section has a designed empty state and a readable error. No spinner that never resolves. No horizontal scroll at 390px.
- [ ] `T-177` **Write E2E E-R1, E-C1 and E-C2** *(day 1 of 2)*
      - *Done when:* Three specs green in CI on the release branch: recruiter onboarding through to the workspace; candidate signup to discoverable; and the full profile lifecycle across a logout, an edit and a removal.

**Zainab**

- [ ] `T-072` **Write E2E E-R3: search, insights, shortlist, unlock, email, CONTACTED** *(day 1 of 2)*
      - *Done when:* One spec covering the whole chain, asserting the email was queued, the pipeline moved, the outreach row exists and the entitlement counter decremented.
- [ ] `T-100` **Recruiter result review, assessment history and the candidate's own result** *(day 1 of 2)*
      - *Done when:* The recruiter sees a per-question report matching the candidate's answers. The candidate sees their own score. Both sides list past assessments. showAssessmentScores gates what the recruiter sees on the candidate card.
      - **Security:** showAssessmentScores gates the recruiter card, independently of the recruiter's own report
- [ ] `T-139` **Failure paths degrade rather than dead-end**
      - *Done when:* A forced provider failure, a voice failure and a timeout each leave the candidate a usable path forward with a readable message. No failure loses a completed attempt.
- [ ] `T-144` **Both journeys write evidence, and the recruiter can see it** *(day 2 of 2)*
      - *Done when:* A completed cohort activity and a published hackathon result each write a SkillEvidence row, update the profile, and produce a signal the recruiter side can shortlist on. 'The emitter fired' is not sufficient - the recruiter view is checked.
      - **Needs:** P1, R5
- [ ] `T-178` **Write E2E E-R4, E-C4, E-C5, E-C6 and E-C7** *(day 1 of 2)*
      - *Done when:* Five specs green in CI: assessment build-to-review, the candidate attempt, mock interview to evidence, cohort to evidence, hackathon to evidence.

**shashank**

- [ ] `T-049` **Write E2E E-R2: create project, define criteria, search, leave, return, everything preserved** *(day 1 of 2)*
      - *Done when:* The spec creates a project, sets six criteria, runs a search, records three candidate states, signs out, signs in in a fresh browser context, reopens the project, and asserts every criterion and every state is unchanged and only genuinely new candidates carry NEW.
- [ ] `T-179` **Write E2E E-R6, E-R8 and E-C9** *(day 1 of 2)*
      - *Done when:* Three specs green in CI: a recruiter notification opening the right context; the four privacy cases failing server-side; and a non-technical candidate discovered and shortlisted.

**Manuvrtti**

- [ ] `T-134` **Recruiter rendering with an explicit trust badge on every external signal**
      - *Done when:* Every external link on a recruiter surface is labelled Self-reported. There is no number anywhere claiming to be verified, and no invented score. showGithub gates the GitHub link.
      - **Security:** A recruiter must never be able to mistake a declared link for a synced one
- [ ] `T-180` **Write E2E E-C8** *(day 1 of 2)*
      - *Done when:* One spec green in CI: all three providers connect, a malformed handle is refused, and every recruiter-facing signal reads Self-reported.

**Sohail**

- [ ] `T-173` **Write E2E E-R7 and E-R8, then get the whole suite green on the release branch** *(day 1 of 2)*
      - *Done when:* E-R7 asserts six gated actions refused with the client removed. E-R8 asserts four privacy cases fail server-side. All 17 journeys and every existing tsx suite green on the release branch.
- [ ] `T-174` **Stand up the UAT environment: migrations applied and seeded** *(day 1 of 2)*
      - *Done when:* The UAT Neon child branch has every September migration applied and db:seed:e2e runs clean against it.
      - **Security:** Child branch only

---

## Friday 25 September

> **FEATURE FREEZE — 20:00 IST.** Six criteria signed by Sohail. **No feature commit after tonight.** Fixes only, and only against UAT defects.

**Shivansh**

- [ ] `T-089` **Write E2E E-R5 and E-C3** *(day 2 of 2)*
      - *Done when:* E-R5: recruiter posts a job, candidate applies, recruiter shortlists, emails, moves stage, candidate notified. E-C3: candidate browses, filters, applies, tracks. Both green in CI.
- [ ] `T-119` **Responsive pass: tablet and 390px mobile across every recruiter surface** *(day 2 of 2)*
      - *Done when:* No horizontal scroll, no clipped CTA, tap targets 44px or larger, and the left nav collapses to something usable rather than disappearing.
- [ ] `T-120` **Performance targets on the four heaviest recruiter surfaces**
      - *Done when:* 20 timed samples each on candidate search, the Talent Hub, Home and analytics. p95 under 1.5s / 1.2s / 1.0s / 1.5s. No surface blocks on an AI call where a deterministic query would do.
      - **Needs:** R3 indexes
- [ ] `T-177` **Write E2E E-R1, E-C1 and E-C2** *(day 2 of 2)*
      - *Done when:* Three specs green in CI on the release branch: recruiter onboarding through to the workspace; candidate signup to discoverable; and the full profile lifecycle across a logout, an edit and a removal.

**Zainab**

- [ ] `T-072` **Write E2E E-R3: search, insights, shortlist, unlock, email, CONTACTED** *(day 2 of 2)*
      - *Done when:* One spec covering the whole chain, asserting the email was queued, the pipeline moved, the outreach row exists and the entitlement counter decremented.
- [ ] `T-100` **Recruiter result review, assessment history and the candidate's own result** *(day 2 of 2)*
      - *Done when:* The recruiter sees a per-question report matching the candidate's answers. The candidate sees their own score. Both sides list past assessments. showAssessmentScores gates what the recruiter sees on the candidate card.
      - **Security:** showAssessmentScores gates the recruiter card, independently of the recruiter's own report
- [ ] `T-178` **Write E2E E-R4, E-C4, E-C5, E-C6 and E-C7** *(day 2 of 2)*
      - *Done when:* Five specs green in CI: assessment build-to-review, the candidate attempt, mock interview to evidence, cohort to evidence, hackathon to evidence.

**shashank**

- [ ] `T-049` **Write E2E E-R2: create project, define criteria, search, leave, return, everything preserved** *(day 2 of 2)*
      - *Done when:* The spec creates a project, sets six criteria, runs a search, records three candidate states, signs out, signs in in a fresh browser context, reopens the project, and asserts every criterion and every state is unchanged and only genuinely new candidates carry NEW.
- [ ] `T-179` **Write E2E E-R6, E-R8 and E-C9** *(day 2 of 2)*
      - *Done when:* Three specs green in CI: a recruiter notification opening the right context; the four privacy cases failing server-side; and a non-technical candidate discovered and shortlisted.

**Manuvrtti**

- [ ] `T-180` **Write E2E E-C8** *(day 2 of 2)*
      - *Done when:* One spec green in CI: all three providers connect, a malformed handle is refused, and every recruiter-facing signal reads Self-reported.

**Sohail**

- [ ] `T-173` **Write E2E E-R7 and E-R8, then get the whole suite green on the release branch** *(day 2 of 2)*
      - *Done when:* E-R7 asserts six gated actions refused with the client removed. E-R8 asserts four privacy cases fail server-side. All 17 journeys and every existing tsx suite green on the release branch.
- [ ] `T-174` **Stand up the UAT environment: migrations applied and seeded** *(day 2 of 2)*
      - *Done when:* The UAT Neon child branch has every September migration applied and db:seed:e2e runs clean against it.
      - **Security:** Child branch only
- [ ] `T-175` **GATE: FEATURE FREEZE, Thu 25 Sep 20:00 IST**
      - *Done when:* Six criteria verified and signed: (1) build clean, zero TS errors, zero new lint errors. (2) 17 E2E journeys and every tsx suite green on the release branch. (3) migrations applied to the UAT branch and seeded. (4) no P0 knowingly incomplete without a written descope. (5) every incomplete P1 behind an OFF flag. (6) every workstream has a named production-smoke owner for 30 Sep.

---

# U1 UAT PASS

*Execute every script. FIND ONLY - no fixing.*

## Saturday 26 September

> **No fixing today.** The point of U1 is to learn the true defect count. Log everything, fix nothing.

**Shivansh**

- [ ] `T-182` **U1: execute the sourcing scripts (U-R3, U-R4, U-R5, U-R6)**
      - *Done when:* All four executed with fresh accounts, including a real return visit in a second browser. Findings only.

**Zainab**

- [ ] `T-181` **U1: execute the recruiter onboarding and plan scripts (U-R1, U-R2, U-R12)**
      - *Done when:* All three executed with a FRESH allow-listed recruiter account. Every defect logged and triaged. No fixing on U1.

**shashank**

- [ ] `T-184` **U1: execute the candidate scripts (U-C1 to U-C9)**
      - *Done when:* All nine executed with fresh accounts. Findings only.

**Manuvrtti**

- [ ] `T-183` **U1: execute the jobs, assessment, analytics and notification scripts (U-R7, U-R8, U-R9, U-R10)**
      - *Done when:* All four executed with fresh accounts on both sides. Findings only.

**Sohail**

- [ ] `T-185` **U1: execute the security, performance and polish scripts (U-R11, U-R12)**
      - *Done when:* Executed with the client bypassed where the script says so. Findings only.
- [ ] `T-186` **U1: triage every logged defect into S1 / S2 / S3 / S4 and assign it**
      - *Done when:* Every defect triaged and assigned the same evening. Nobody is assigned to retest their own fix.

---

# U2 S1 FIXES

*Fix every S1. Retested by the reporter, never the fixer.*

## Sunday 27 September

> **GATE — U2 exit.** Zero S1 open by end of day.

**Shivansh**

- [ ] `T-187` **U2: fix assigned S1 defects (Shivansh)**
      - *Done when:* Every assigned S1 fixed and handed back to its original reporter for retest. A fix the reporter cannot reproduce as fixed stays open.

**Zainab**

- [ ] `T-188` **U2: fix assigned S1 defects (Zainab)**
      - *Done when:* Every assigned S1 fixed and handed back to its original reporter for retest. A fix the reporter cannot reproduce as fixed stays open.

**shashank**

- [ ] `T-189` **U2: fix assigned S1 defects (shashank)**
      - *Done when:* Every assigned S1 fixed and handed back to its original reporter for retest. A fix the reporter cannot reproduce as fixed stays open.

**Manuvrtti**

- [ ] `T-190` **U2: fix assigned S1 defects (Manuvrtti)**
      - *Done when:* Every assigned S1 fixed and handed back to its original reporter for retest. A fix the reporter cannot reproduce as fixed stays open.

**Sohail**

- [ ] `T-191` **U2: fix assigned S1 defects (Sohail)**
      - *Done when:* Every assigned S1 fixed and handed back to its original reporter for retest. A fix the reporter cannot reproduce as fixed stays open.
- [ ] `T-192` **GATE: U2 exit - zero S1 defects open**
      - *Done when:* Zero S1 open, every fix retested by its reporter.

---

# U3 S2 & POLISH

*Fix every S2. Mobile, states, first-impression review.*

## Monday 28 September

> **GATE — U3 exit.** Zero S2 open, mobile and states passes complete, first-impression findings closed.

**Shivansh**

- [ ] `T-193` **U3: fix S2 defects and complete the polish pass (Shivansh)**
      - *Done when:* S2 defects closed. Every screen this owner touched passes at 390px and has loading, empty, error and success states.

**Zainab**

- [ ] `T-194` **U3: fix S2 defects and complete the polish pass (Zainab)**
      - *Done when:* S2 defects closed. Every screen this owner touched passes at 390px and has loading, empty, error and success states.

**shashank**

- [ ] `T-195` **U3: fix S2 defects and complete the polish pass (shashank)**
      - *Done when:* S2 defects closed. Every screen this owner touched passes at 390px and has loading, empty, error and success states.

**Manuvrtti**

- [ ] `T-196` **U3: fix S2 defects and complete the polish pass (Manuvrtti)**
      - *Done when:* S2 defects closed. Every screen this owner touched passes at 390px and has loading, empty, error and success states.

**Sohail**

- [ ] `T-197` **U3: fix S2 defects and complete the polish pass (Sohail)**
      - *Done when:* S2 defects closed. Every screen this owner touched passes at 390px and has loading, empty, error and success states.
- [ ] `T-198` **U3: recruiter first-impression review with someone who has not seen the product**
      - *Done when:* A person who has never used ABTalks is asked to reach candidate search, shortlist someone and email them, unaided. Every hesitation is logged as an S2 UI defect. This is the test that decides whether it feels like one workspace.
- [ ] `T-199` **GATE: U3 exit - zero S2 open, polish and mobile passes complete**
      - *Done when:* Zero S2 open. Every new surface has all four states and passes at 390px.

---

# U4 REGRESSION

*Re-run everything. Sign-off 18:00 IST.*

## Tuesday 29 September

> **GATE — UAT SIGN-OFF, 18:00 IST.** Five signatures. Zero S1, zero S2, all 21 scripts passed on the re-run.

**Shivansh**

- [ ] `T-201` **U4: re-run your U1 scripts clean (Shivansh: U-R3, U-R4, U-R5, U-R6)**
      - *Done when:* Every script this tester ran on U1 is re-run end to end and passes. A script that passed on U1 but not on U4 has NOT passed - it goes back to the defect log. Same tester as U1, same fresh-account discipline.

**Zainab**

- [ ] `T-200` **U4: re-run your U1 scripts clean (Zainab: U-R1, U-R2, U-R12)**
      - *Done when:* Every script this tester ran on U1 is re-run end to end and passes. A script that passed on U1 but not on U4 has NOT passed - it goes back to the defect log. Same tester as U1, same fresh-account discipline.

**shashank**

- [ ] `T-203` **U4: re-run your U1 scripts clean (shashank: U-C1 to U-C9)**
      - *Done when:* Every script this tester ran on U1 is re-run end to end and passes. A script that passed on U1 but not on U4 has NOT passed - it goes back to the defect log. Same tester as U1, same fresh-account discipline.

**Manuvrtti**

- [ ] `T-202` **U4: re-run your U1 scripts clean (Manuvrtti: U-R7, U-R8, U-R9, U-R10)**
      - *Done when:* Every script this tester ran on U1 is re-run end to end and passes. A script that passed on U1 but not on U4 has NOT passed - it goes back to the defect log. Same tester as U1, same fresh-account discipline.

**Sohail**

- [ ] `T-204` **U4: re-run your U1 scripts clean (Sohail: U-R11, U-R12)**
      - *Done when:* Every script this tester ran on U1 is re-run end to end and passes. A script that passed on U1 but not on U4 has NOT passed - it goes back to the defect log. Same tester as U1, same fresh-account discipline.
- [ ] `T-205` **U4: re-run all 17 E2E journeys and every existing tsx suite in CI**
      - *Done when:* All green on the release branch: test:hire-score, test:scout, test:visibility, test:078-dual-write, test:078-points-writes, test:078-progress, test:profile, test:resume, test:synergy-cap.
- [ ] `T-206` **U4: manual regression across every pre-existing journey**
      - *Done when:* Challenge submission, program mission, hackathon submission, certificate issue, marketplace redeem, workshop registration and points award all still work. Nothing September built broke something August shipped.
- [ ] `T-207` **U4: p95 performance measurement on the four heaviest surfaces**
      - *Done when:* 20 timed samples each on candidate search, Talent Hub, recruiter Home and analytics. Numbers recorded whether or not they pass.
- [ ] `T-208` **U4: log S3 and S4 defects to the October backlog with named owners**
      - *Done when:* Nothing is silently dropped. Every deferred defect has an owner and a one-line reason.
- [ ] `T-209` **GATE: UAT SIGN-OFF, Tue 29 Sep 18:00 IST - five signatures**
      - *Done when:* Zero S1 and zero S2. All 21 scripts passed on the U4 re-run. 17 E2E journeys green. Regression clean. Sentry quiet four hours. Five signatures collected.

---

# RELEASE DAY

*Deploy, smoke every journey step, sign.*

## Wednesday 30 September

> **RELEASE.** Sohail declares only when all 30 rows of the Recruiter Journey sheet read PROD VERIFIED.

**Shivansh**

- [ ] `T-027` **PRODUCTION SMOKE: fresh recruiter completes all five onboarding steps**
      - *Done when:* Owner registers a real allow-listed recruiter on production, completes company details, hiring need and plan selection, is activated by admin, and reaches Home. organizationId recorded in the release checklist.
- [ ] `T-090` **PRODUCTION SMOKE: full job hiring loop**
      - *Done when:* Owner posts a job on production, applies from a fresh candidate account, moves the applicant to SCREENING, confirms the candidate notification, and pushes the applicant into a talent project.
- [ ] `T-121` **PRODUCTION SMOKE: a first-time recruiter navigates unaided**
      - *Done when:* Owner asks someone who has never seen ABTalks to reach candidate search from the recruiter home on production, without being told where to click. If they cannot, that is an S2.
- [ ] `T-132` **PRODUCTION SMOKE: complete profile lifecycle on a fresh account**
      - *Done when:* Owner completes every section on production, logs out and back in, edits four sections, removes one item, opens the recruiter preview, and is then found by a real recruiter search showing exactly the allowed fields.

**Zainab**

- [ ] `T-073` **PRODUCTION SMOKE: unlock and email a real candidate**
      - *Done when:* Owner unlocks one real candidate on production and sends one real email, confirms it arrives in the inbox, and confirms the pipeline moved to CONTACTED.
- [ ] `T-101` **PRODUCTION SMOKE: build, publish, assign, attempt, evaluate, review**
      - *Done when:* Owner runs the whole loop live with a fresh recruiter and a fresh candidate, and confirms the score reached the report, the candidate result, the evidence row and the analytics number.
- [ ] `T-140` **PRODUCTION SMOKE: full mock interview journey plus one forced failure**
      - *Done when:* Owner completes a real interview on production, forces a provider failure, and reads the recruiter-visible signal.
- [ ] `T-145` **PRODUCTION SMOKE: fresh user completes both journeys**
      - *Done when:* Owner enrols a fresh account in a cohort and completes one activity, and registers a fresh participant for a hackathon and submits. Both ids recorded.
- [ ] `T-151` **PRODUCTION: run the backfill, then smoke a live emit**
      - *Done when:* Backfill completes on production with zero conflicts and a reconciled row count. Then one real activity is completed and writes exactly one new row.

**shashank**

- [ ] `T-050` **PRODUCTION SMOKE: project survives a real return visit**
      - *Done when:* Owner creates a project on production, records states, signs out, signs in from a different browser, and confirms criteria, matches and states are intact. Project id recorded.
- [ ] `T-057` **PRODUCTION SMOKE: insights on a real candidate trace to real rows**
      - *Done when:* Owner opens a real candidate on production, opens two evidence claims, and confirms both resolve to rows that exist. Candidate public id recorded.
- [ ] `T-064` **PRODUCTION SMOKE: shortlist and pipeline survive a real device change**
      - *Done when:* Owner shortlists three candidates from three different tracks on production, sets three different stages, signs out, signs in on another browser, and confirms all three.
- [ ] `T-106` **PRODUCTION SMOKE: real actions move the real numbers**
      - *Done when:* Owner records every number on production, performs a search, a view, a shortlist, an unlock and a stage change, and confirms each corresponding number moved and nothing else did.
- [ ] `T-112` **PRODUCTION SMOKE: non-technical candidate discovered and shortlisted**
      - *Done when:* Owner creates a real Marketing candidate and a real Marketing project on production, finds the candidate, reads their insights and shortlists them - with no coding signal anywhere in the journey.
- [ ] `T-165` **PRODUCTION SMOKE: one view per refresh window**
      - *Done when:* Owner opens a real candidate on production, refreshes five times, and confirms exactly one view row and one increment in analytics.

**Manuvrtti**

- [ ] `T-078` **PRODUCTION SMOKE: trigger all seven recruiter notifications**
      - *Done when:* Owner triggers each of the seven on production, confirms the bell item and its link, and confirms exactly three arrived by email.
- [ ] `T-135` **PRODUCTION SMOKE: connect all three and read the recruiter view**
      - *Done when:* Owner connects three real handles on production and confirms all three render to a recruiter as Self-reported.
- [ ] `T-156` **PRODUCTION SMOKE: deliverability across every notification type**
      - *Done when:* Owner triggers every candidate and recruiter type on production and confirms bell plus inbox, and that a disabled preference stays quiet.
- [ ] `T-161` **PRODUCTION SMOKE: crons ran and events landed**
      - *Done when:* Owner confirms every Vercel cron ran and that events exist for the day's smoke journeys. Sentry quiet.

**Sohail**

- [ ] `T-038` **PRODUCTION SMOKE: exhaust one limit on production with the client bypassed**
      - *Done when:* Owner calls a gated Server Action directly against production, past its limit, with the UI removed, and records the refusal. If it is not refused, the release does not proceed.
- [ ] `T-176` **PRODUCTION SMOKE: re-run the cross-org, PII, authorization and rate-limit sweeps live**
      - *Done when:* Every sweep re-run against the production deployment, not the UAT branch, and every refusal recorded.
- [ ] `T-210` **09:00 Take a Neon snapshot branch from production**
      - *Done when:* Snapshot branch id recorded in the release checklist before any write touches production.
      - **Security:** Snapshot before any write
- [ ] `T-211` **09:30 Run final migrations against production and verify each applied**
      - *Done when:* prisma migrate status reports every migration applied. The deployed commit hash is recorded.
- [ ] `T-212` **10:30 Deploy the release branch, not master**
      - *Done when:* Deployment green and the deployed commit matches the branch signed off at UAT.
- [ ] `T-213` **14:00 Set production flags, including ENABLE_RECRUITER_AUTH for the allow-list**
      - *Done when:* Flag state matches the decision record. Every incomplete P1 is OFF.
      - **Security:** An incomplete P1 left ON is an S1
- [ ] `T-214` **15:00 Two-hour Sentry observation window**
      - *Done when:* No new error class in two hours. A new S1 in this window blocks the declaration.
- [ ] `T-215` **16:30 Confirm every row on Recruiter Journey Coverage reads PROD VERIFIED**
      - *Done when:* Every capability on the coverage matrix is green. Anything short is flagged OFF with its owner named, not waved through.
- [ ] `T-216` **17:00 Sign the release checklist and declare the release**
      - *Done when:* Five signatures collected. Each means: I personally walked the journeys I own, on production, with fresh accounts.
- [ ] `T-217` **Post-release: reconcile project-context.md and CHANGELOG through 2026-09-30**
      - *Done when:* The reconciled-through date is updated and every pending CHANGELOG line is folded in and verified against code.

---
