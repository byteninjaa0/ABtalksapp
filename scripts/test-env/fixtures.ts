/**
 * Plan 195 — named, parametric scenarios.
 *
 * A fixture puts the database into one specific, named state so a test starts
 * from a known place. They are the "different parameters" half of this
 * environment: the bootstrap gives one reasonable world, and these reshape it.
 *
 * Rules every fixture here follows:
 *
 *   - It is IDEMPOTENT. Running it twice leaves the same state as running it
 *     once, so a test can re-apply its own precondition without reasoning
 *     about what came before.
 *   - It is NARROW. A fixture changes what its name says and nothing else, so
 *     two can be combined without one quietly undoing the other.
 *   - It does NOT re-seed. `npm run test:env:reset` is the way back to the
 *     baseline; a fixture that silently wiped would make combinations
 *     order-dependent.
 *
 * The parametric ones take `--key` / `--day` / `--dollars`; the rest take
 * nothing. `npm run test:env:fixture -- --list` prints the catalogue.
 */
import { PipelineStage, PlatformRole, RoleScopeType } from "@prisma/client";

import { prisma } from "../../src/lib/db";
import { TEST_IDENTITIES, findIdentity } from "../../src/lib/test-env";

export type FixtureParams = {
  key?: string;
  day?: number;
  dollars?: number;
};

export type Fixture = {
  name: string;
  /** One line for `--list`. */
  describe: string;
  /** Which parameters this fixture reads, for the usage line. */
  params?: string;
  apply: (params: FixtureParams) => Promise<string>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function userIdFor(key: string): Promise<{ id: string; name: string }> {
  const identity = findIdentity(key);
  if (!identity) {
    throw new Error(
      `Unknown identity "${key}". Known: ${TEST_IDENTITIES.map((i) => i.key).join(", ")}`,
    );
  }
  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (!user) {
    throw new Error(
      `${identity.email} does not exist — run \`npm run test:env:bootstrap\`.`,
    );
  }
  return { id: user.id, name: identity.name };
}

/** The challenge enrollment, selected by cohort rather than by id prefix. */
async function challengeEnrollment(userId: string) {
  const enrollment = await prisma.programEnrollment.findFirst({
    where: {
      userId,
      cohort: {
        slug: { startsWith: "legacy-" },
        NOT: { slug: { startsWith: "legacy-program-" } },
      },
    },
    orderBy: { startedAt: "asc" },
    select: { id: true, cohortId: true },
  });
  if (!enrollment) throw new Error("No challenge enrollment for that identity.");
  return enrollment;
}

async function organizationFor(key: string) {
  const { id: userId } = await userIdFor(key);
  const membership = await prisma.organizationMember.findFirst({
    where: { userId, status: "ACTIVE" },
    select: {
      organizationId: true,
      organization: { select: { name: true } },
    },
  });
  if (!membership) throw new Error(`${key} has no organization.`);
  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return {
    userId,
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    recruiterProfileId: profile?.id ?? null,
  };
}

/** Noon UTC, `day - 1` days ago — the seeds' own `utcNoon` convention. */
function anchorForDay(day: number): Date {
  const at = new Date();
  at.setUTCHours(12, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() - (day - 1));
  return at;
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const FIXTURES: Fixture[] = [
  // --- Challenge track ----------------------------------------------------
  {
    name: "candidate-day",
    describe: "Move a challenge candidate to a specific day (1–60)",
    params: "--key=<identity> --day=<1-60>",
    async apply({ key = "arjun", day = 30 }) {
      if (day < 1 || day > 60) throw new Error("--day must be 1–60.");
      const { id: userId, name } = await userIdFor(key);
      const enrollment = await challengeEnrollment(userId);
      const startedAt = anchorForDay(day);

      await prisma.$transaction(async (tx) => {
        await tx.programEnrollment.update({
          where: { id: enrollment.id },
          data: {
            // Both the anchor AND the counters. `getCurrentDayNumber` derives
            // the day from elapsed IST time since `startedAt`, so setting only
            // the counters produces a candidate whose dashboard and whose
            // progress row disagree — which reads as a product bug.
            startedAt,
            trackCurrentStreak: day,
            trackLongestStreak: Math.max(day, 1),
            status: day >= 60 ? "COMPLETED" : "ACTIVE",
            completedAt: day >= 60 ? new Date() : null,
          },
          select: { id: true },
        });
        await tx.enrollmentProgress.upsert({
          where: { enrollmentId: enrollment.id },
          create: {
            enrollmentId: enrollment.id,
            cohortId: enrollment.cohortId,
            completedActivities: day,
            totalActivities: 60,
            percentCompleteBp: Math.round((day / 60) * 10000),
            currentStreak: day,
            longestStreak: day,
            lastActivityAt: new Date(),
            unlockedThroughPosition: day,
          },
          update: {
            completedActivities: day,
            percentCompleteBp: Math.round((day / 60) * 10000),
            currentStreak: day,
            longestStreak: day,
            lastActivityAt: new Date(),
            unlockedThroughPosition: day,
          },
          select: { id: true },
        });
      });

      return `${name} is on day ${day} (${day >= 60 ? "COMPLETED" : "ACTIVE"}).`;
    },
  },
  {
    name: "candidate-broken-streak",
    describe: "A candidate mid-challenge whose streak has lapsed — relaxation-window state",
    params: "--key=<identity> --day=<1-60>",
    async apply({ key = "anika", day = 30 }) {
      const { id: userId, name } = await userIdFor(key);
      const enrollment = await challengeEnrollment(userId);

      // Last activity three days ago with a zero current streak: the shape a
      // backfill / relaxation decision is made against. `getElapsedDayNumber`
      // is the uncapped reading those decisions use, so the anchor still has
      // to be real — only the streak lapses.
      const lapsed = new Date();
      lapsed.setUTCDate(lapsed.getUTCDate() - 3);

      await prisma.$transaction(async (tx) => {
        await tx.programEnrollment.update({
          where: { id: enrollment.id },
          data: {
            startedAt: anchorForDay(day),
            trackCurrentStreak: 0,
            trackLongestStreak: Math.max(day - 5, 1),
            status: "ACTIVE",
          },
          select: { id: true },
        });
        await tx.enrollmentProgress.upsert({
          where: { enrollmentId: enrollment.id },
          create: {
            enrollmentId: enrollment.id,
            cohortId: enrollment.cohortId,
            completedActivities: Math.max(day - 3, 0),
            totalActivities: 60,
            currentStreak: 0,
            longestStreak: Math.max(day - 5, 1),
            lastActivityAt: lapsed,
            unlockedThroughPosition: Math.max(day - 3, 0),
          },
          update: {
            completedActivities: Math.max(day - 3, 0),
            currentStreak: 0,
            longestStreak: Math.max(day - 5, 1),
            lastActivityAt: lapsed,
          },
          select: { id: true },
        });
      });

      return `${name} is on day ${day} with a lapsed streak (last activity 3 days ago).`;
    },
  },

  // --- Recruiter / hire desk ---------------------------------------------
  {
    name: "recruiter-credits",
    describe: "Set a recruiter organization's credit balance, in dollars",
    params: "--key=<recruiter|recruiter2> --dollars=<n>",
    async apply({ key = "recruiter", dollars = 200 }) {
      const org = await organizationFor(key);
      await prisma.creditAccount.upsert({
        where: { organizationId: org.organizationId },
        // Minor units: 20000 is $200.00, which is the onboarding grant.
        create: { organizationId: org.organizationId, balance: dollars * 100 },
        update: { balance: dollars * 100 },
        select: { id: true },
      });
      return `${org.organizationName} now holds $${dollars}.00.`;
    },
  },
  {
    name: "recruiter-empty-desk",
    describe: "A recruiter with no credits and no shortlists — the paywall / empty states",
    params: "--key=<recruiter|recruiter2>",
    async apply({ key = "recruiter" }) {
      const org = await organizationFor(key);
      await prisma.$transaction(async (tx) => {
        await tx.creditAccount.upsert({
          where: { organizationId: org.organizationId },
          create: { organizationId: org.organizationId, balance: 0 },
          update: { balance: 0 },
          select: { id: true },
        });
        // Items cascade from the list, so deleting the lists is enough.
        await tx.talentList.deleteMany({
          where: { organizationId: org.organizationId },
        });
      });
      return `${org.organizationName}: $0.00 and no talent lists.`;
    },
  },
  {
    name: "recruiter-pipeline",
    describe: "A populated shortlist across pipeline stages, for the review panel",
    params: "--key=<recruiter|recruiter2>",
    async apply({ key = "recruiter" }) {
      const org = await organizationFor(key);

      // Real candidates from the cast, so unlocking and profile views lead
      // somewhere rather than to a tombstone label.
      const candidateKeys = ["meera", "karan", "anika", "dhruv", "vikram"];
      const stages: PipelineStage[] = [
        PipelineStage.SHORTLISTED,
        PipelineStage.CONTACTED,
        PipelineStage.SCREENING,
        PipelineStage.SHORTLISTED,
        PipelineStage.REJECTED,
      ];

      const list = await prisma.talentList.upsert({
        where: {
          organizationId_name: {
            organizationId: org.organizationId,
            name: "Test pipeline",
          },
        },
        create: {
          organizationId: org.organizationId,
          ownerRecruiterId: org.recruiterProfileId,
          name: "Test pipeline",
          description: "Fixture: candidates spread across pipeline stages.",
        },
        update: {},
        select: { id: true },
      });

      let added = 0;
      for (const [index, candidateKey] of candidateKeys.entries()) {
        const identity = findIdentity(candidateKey);
        if (!identity) continue;
        const candidate = await prisma.user.findUnique({
          where: { email: identity.email },
          select: { id: true },
        });
        if (!candidate) continue;

        await prisma.talentListItem.upsert({
          where: {
            talentListId_candidateUserId: {
              talentListId: list.id,
              candidateUserId: candidate.id,
            },
          },
          create: {
            talentListId: list.id,
            candidateUserId: candidate.id,
            candidateLabel: identity.name,
            stage: stages[index] ?? PipelineStage.SHORTLISTED,
            addedByUserId: org.userId,
          },
          update: { stage: stages[index] ?? PipelineStage.SHORTLISTED },
          select: { id: true },
        });
        added += 1;
      }

      return `${org.organizationName}: "Test pipeline" with ${added} candidates across stages.`;
    },
  },

  // --- AI Cohort program --------------------------------------------------
  {
    name: "program-day",
    describe: "Move the AI-cohort member's score/progress to a given day (1–31)",
    params: "--key=<identity> --day=<1-31>",
    async apply({ key = "program", day = 15 }) {
      if (day < 1 || day > 31) throw new Error("--day must be 1–31 for /program.");
      const { id: userId, name } = await userIdFor(key);
      const enrollment = await prisma.programEnrollment.findFirst({
        where: { userId, cohort: { slug: { startsWith: "legacy-program-" } } },
        select: { id: true },
      });
      if (!enrollment) throw new Error(`${key} has no /program enrollment.`);

      // Points scaled off the day rather than invented per field, so the total
      // stays the sum of its parts — the leaderboard orders on `totalScore`
      // and a total that disagrees with its components is a confusing fixture.
      const mission = day * 4;
      const concept = day * 3;
      const commit = day * 2;
      const project = day >= 7 ? 30 : 0;

      await prisma.programEnrollment.update({
        where: { id: enrollment.id },
        data: {
          startedAt: anchorForDay(day),
          missionPoints: mission,
          conceptPoints: concept,
          commitPoints: commit,
          projectPoints: project,
          totalScore: mission + concept + commit + project,
          cleanPassCount: Math.floor(day / 3),
          status: day >= 31 ? "COMPLETED" : "ACTIVE",
        },
        select: { id: true },
      });

      return `${name} is on /program day ${day}, score ${mission + concept + commit + project}.`;
    },
  },

  // --- Hackathon ----------------------------------------------------------
  {
    name: "hackathon-submitted",
    describe: "The hackathon participant's team has submitted",
    params: "--key=<identity>",
    async apply({ key = "hackathon" }) {
      const { id: userId, name } = await userIdFor(key);
      const participant = await prisma.hackathonParticipant.findFirst({
        where: { userId },
        select: { teamId: true, team: { select: { teamCode: true } } },
      });
      if (!participant) throw new Error(`${key} is not a hackathon participant.`);

      const problem = await prisma.hackathonProblem.findFirst({
        select: { id: true },
      });

      await prisma.hackathonSubmission.upsert({
        where: { teamId: participant.teamId },
        create: {
          teamId: participant.teamId,
          problemId: problem?.id ?? null,
          repoUrl: "https://github.com/abtalks-test/hackathon-entry",
          liveUrl: "https://example.test/hackathon-entry",
          aiLogUrl: "https://example.test/hackathon-ai-log",
        },
        update: {},
        select: { id: true },
      });

      return `${name}'s team ${participant.team.teamCode} has a submission.`;
    },
  },
  {
    name: "hackathon-open",
    describe: "Remove the submission, putting the team back to pre-submit",
    params: "--key=<identity>",
    async apply({ key = "hackathon" }) {
      const { id: userId, name } = await userIdFor(key);
      const participant = await prisma.hackathonParticipant.findFirst({
        where: { userId },
        select: { teamId: true },
      });
      if (!participant) throw new Error(`${key} is not a hackathon participant.`);
      const { count } = await prisma.hackathonSubmission.deleteMany({
        where: { teamId: participant.teamId },
      });
      return `${name}: ${count} submission(s) removed.`;
    },
  },

  // --- Admin --------------------------------------------------------------
  {
    name: "admin-grant",
    describe: "Grant platform admin to any identity",
    params: "--key=<identity>",
    async apply({ key = "admin" }) {
      const { id: userId, name } = await userIdFor(key);
      const live = await prisma.userRoleAssignment.findFirst({
        where: {
          userId,
          role: PlatformRole.ADMIN,
          scopeType: RoleScopeType.GLOBAL,
          revokedAt: null,
        },
        select: { id: true },
      });
      if (live) return `${name} is already a platform admin.`;
      await prisma.userRoleAssignment.create({
        data: {
          userId,
          role: PlatformRole.ADMIN,
          scopeType: RoleScopeType.GLOBAL,
        },
        select: { id: true },
      });
      return `${name} is now a platform admin.`;
    },
  },
  {
    name: "admin-revoke",
    describe: "Revoke platform admin — for testing what a demoted admin can still reach",
    params: "--key=<identity>",
    async apply({ key = "admin" }) {
      const { id: userId, name } = await userIdFor(key);
      // Stamps `revokedAt`, as the product does. Never edit `role` to revoke —
      // liveness is defined as `revokedAt IS NULL`.
      const { count } = await prisma.userRoleAssignment.updateMany({
        where: {
          userId,
          role: PlatformRole.ADMIN,
          scopeType: RoleScopeType.GLOBAL,
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokedReason: "test fixture" },
      });
      return `${name}: ${count} admin grant(s) revoked.`;
    },
  },

  // --- Cross-cutting ------------------------------------------------------
  {
    name: "clear-rate-limits",
    describe: "Drop every recorded rate-limit event (login, search, unlock, outreach)",
    async apply() {
      const { count } = await prisma.rateLimitEvent.deleteMany({});
      return `${count} rate-limit event(s) cleared.`;
    },
  },
  {
    name: "unregister",
    describe: "Strip an identity's CandidateProfile so it lands on /register",
    params: "--key=<identity>",
    async apply({ key = "fresh" }) {
      const { id: userId, name } = await userIdFor(key);
      const { count } = await prisma.candidateProfile.deleteMany({
        where: { userId },
      });
      return `${name}: ${count} candidate profile(s) removed — now lands on /register.`;
    },
  },
];

export function findFixture(name: string): Fixture | undefined {
  return FIXTURES.find((f) => f.name === name);
}
