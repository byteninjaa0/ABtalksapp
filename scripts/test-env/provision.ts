/**
 * Plan 195 — the identities no existing seed creates.
 *
 * `prisma/seed.ts` gives nine candidates and the admin user row, and
 * `prisma/scripts/seed-admin.ts` gives the admin its grant. What is missing is
 * everything on the other side of the platform: recruiters with organizations
 * and a funded desk, a program member, a hackathon participant, and the
 * deliberately-empty account.
 *
 * Every step is idempotent — this runs again on every bootstrap and on every
 * reset, and must never mint a second organization or double a credit balance.
 *
 * MUST NOT be imported before `guard.ts` has set the environment: it pulls in
 * `src/lib/db`, which binds its PrismaClient to `DATABASE_URL` at module load.
 */
import { PlatformRole, RoleScopeType } from "@prisma/client";

import { prisma } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";
import { ensureRecruiterWorkspace } from "../../src/features/hire/provision-recruiter";
import { TEST_IDENTITIES, type TestIdentity } from "../../src/lib/test-env";

/**
 * Create or update the `User` row for a test identity.
 *
 * The password is a real scrypt hash, which is the whole reason the test
 * console can sign in without touching `auth.ts`: `authorizePassword` verifies
 * against `isUsablePasswordHash`, and a plain-text value left by an older seed
 * reads as "no usable password" and is never compared as text.
 *
 * `emailVerified` is stamped because these addresses are ours and will never
 * receive mail — leaving it null pushes every one of them into the
 * prove-your-address paths.
 */
async function ensureUser(
  identity: TestIdentity,
  role: "STUDENT" | "RECRUITER" | "ADMIN",
): Promise<string> {
  const password = await hashPassword(identity.password);
  const user = await prisma.user.upsert({
    where: { email: identity.email },
    create: {
      email: identity.email,
      name: identity.name,
      password,
      role,
      emailVerified: new Date(),
    },
    // The password is rewritten on every run on purpose: it is the documented
    // way in, and an account whose password has drifted from `identities.ts` is
    // a dead identity that looks alive.
    update: { password, name: identity.name, role, emailVerified: new Date() },
    select: { id: true },
  });
  return user.id;
}

async function ensureCandidateProfile(userId: string, identity: TestIdentity) {
  const existing = await prisma.candidateProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.candidateProfile.create({
    data: {
      userId,
      fullName: identity.name,
      // Derived from the key so it is stable across resets and cannot collide
      // with the seeds' random codes.
      referralCode: `TEST${identity.key.toUpperCase().slice(0, 8)}`,
    },
    select: { id: true },
  });
}

/**
 * A recruiter the way the product makes one.
 *
 * Same recipe as `features/preview/preview-accounts.ts`: the RecruiterProfile
 * first, then `ensureRecruiterWorkspace`, which creates the Organization and —
 * inside its own transaction — the onboarding credit grant that funds the desk.
 * A desk with no balance misrepresents the product, and hand-writing a
 * CreditAccount here would be a second definition of "a funded recruiter".
 *
 * `company` differs per recruiter deliberately: two recruiters in two
 * organizations is the only way to test recruiter isolation, which is a real
 * invariant of this platform.
 */
async function ensureRecruiter(
  identity: TestIdentity,
  company: string,
): Promise<string> {
  const userId = await ensureUser(identity, "RECRUITER");

  const existing = await prisma.recruiterProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    const now = new Date();
    await prisma.recruiterProfile.create({
      data: {
        userId,
        fullName: identity.name,
        company,
        approved: true,
        approvedAt: now,
        setupStep: "COMPLETE",
        setupCompletedAt: now,
      },
      select: { id: true },
    });
  }

  const workspace = await ensureRecruiterWorkspace(userId);
  if (!workspace) {
    throw new Error(
      `Recruiter workspace could not be provisioned for ${identity.email}`,
    );
  }
  return workspace.organizationId;
}

/**
 * Enrol an identity in the AI-cohort program.
 *
 * Deliberately does NOT create the cohort. `prisma/seed-program-test-users.ts`
 * already owns that — it ensures one non-ARCHIVED cohort and promotes it out of
 * DRAFT — and a second creator would race it into two cohorts that each look
 * like "the" test batch. If that seed did not run, this reports skipped rather
 * than inventing one.
 */
async function ensureProgramMember(identity: TestIdentity): Promise<string> {
  const userId = await ensureUser(identity, "STUDENT");
  await ensureCandidateProfile(userId, identity);

  // Matched on the PROGRAM, not on the slug prefix. Several seeds create
  // `legacy-program-*` cohorts — `seed-hire-fixtures.ts` makes one for the
  // Scout fixtures — so a prefix match plus "newest" lands wherever the seed
  // order happens to leave it. `ai-cohort-program` is the real /program track
  // (the slug `src/repositories/learning.ts` resolves it by).
  const cohort =
    (await prisma.cohort.findFirst({
      where: {
        slug: { startsWith: "legacy-program-" },
        programVersion: { program: { slug: "ai-cohort-program" } },
        // A LIVE cohort. Several seeds leave COMPLETED ones behind — the Scout
        // fixtures' cohort is completed by design — and enrolling the program
        // identity into a finished cohort gives it a dashboard with nothing
        // to do, which is not the state anyone wants to test against.
        status: { in: ["ENROLLING", "ACTIVE"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    })) ??
    (await prisma.cohort.findFirst({
      where: { slug: { startsWith: "legacy-program-" }, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }));

  if (!cohort) {
    return "no program cohort found — run the program seeds, then reset";
  }

  const existing = await prisma.programEnrollment.findUnique({
    where: { userId_cohortId: { userId, cohortId: cohort.id } },
    select: { id: true },
  });

  if (!existing) {
    await prisma.programEnrollment.create({
      data: {
        userId,
        cohortId: cohort.id,
        status: "ACTIVE",
        enrolledAt: new Date(),
        missionPoints: 60,
        conceptPoints: 40,
        commitPoints: 20,
        projectPoints: 30,
        totalScore: 150,
        cleanPassCount: 4,
      },
      select: { id: true },
    });
  }
  return `enrolled in "${cohort.name}"`;
}

/**
 * A hackathon participant, as a solo team.
 *
 * `eventId` defaults to `"legacy"` on both models, which is the event the
 * dashboard reads, so no HackathonEvent row is required — that model holds only
 * the problem statement.
 */
async function ensureHackathonParticipant(
  identity: TestIdentity,
): Promise<string> {
  const userId = await ensureUser(identity, "STUDENT");
  await ensureCandidateProfile(userId, identity);

  const existing = await prisma.hackathonParticipant.findFirst({
    where: { userId },
    select: { id: true, teamId: true },
  });
  if (existing) return "already a participant";

  const teamCode = `TEST${identity.key.toUpperCase().slice(0, 6)}`;
  const team = await prisma.hackathonTeam.upsert({
    where: { eventId_teamCode: { eventId: "legacy", teamCode } },
    create: { entryType: "SOLO", teamName: `${identity.name} (solo)`, teamCode },
    update: {},
    select: { id: true },
  });

  await prisma.hackathonParticipant.create({
    data: {
      teamId: team.id,
      userId,
      slotIndex: 0,
      isLeader: true,
      fullName: identity.name,
      email: identity.email,
      phone: "9000000000",
      college: "Test Institute of Technology",
      graduationYear: new Date().getFullYear() + 1,
    },
    select: { id: true },
  });
  return `solo team ${teamCode}`;
}

/** The platform-admin grant, re-asserted in case `seed-admin.ts` was skipped. */
async function ensureAdminGrant(identity: TestIdentity): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true },
  });
  if (!user) return "admin user missing — prisma/seed.ts did not run";

  const live = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: user.id,
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
      revokedAt: null,
    },
    select: { id: true },
  });
  if (live) return "GLOBAL ADMIN grant live";

  await prisma.userRoleAssignment.create({
    data: {
      userId: user.id,
      role: PlatformRole.ADMIN,
      scopeType: RoleScopeType.GLOBAL,
    },
    select: { id: true },
  });
  return "GLOBAL ADMIN grant created";
}

/**
 * Bring every identity in `TEST_IDENTITIES` into existence, and return one
 * reporting line each.
 *
 * The nine challenge candidates are not touched: `prisma/seed.ts` owns them,
 * including their day counts and streaks, and rewriting them here would make
 * the cast disagree with the seed. They are only VERIFIED — a missing one is
 * reported, because a cast entry that does not exist is worse than one that is
 * wrong.
 */
export async function provision(): Promise<string[]> {
  const lines: string[] = [];

  for (const identity of TEST_IDENTITIES) {
    try {
      switch (identity.track) {
        case "recruiter": {
          const company =
            identity.key === "recruiter"
              ? "Test Hiring Co"
              : "Second Hiring Co";
          const organizationId = await ensureRecruiter(identity, company);
          lines.push(
            `✓ ${pad(identity.key)} ${identity.email}  →  ${company} (org ${organizationId.slice(0, 10)}…)`,
          );
          break;
        }
        case "admin": {
          const note = await ensureAdminGrant(identity);
          lines.push(`✓ ${pad(identity.key)} ${identity.email}  →  ${note}`);
          break;
        }
        case "program": {
          const note = await ensureProgramMember(identity);
          lines.push(`✓ ${pad(identity.key)} ${identity.email}  →  ${note}`);
          break;
        }
        case "hackathon": {
          const note = await ensureHackathonParticipant(identity);
          lines.push(`✓ ${pad(identity.key)} ${identity.email}  →  ${note}`);
          break;
        }
        case "unregistered": {
          // No CandidateProfile on purpose: this is the account that proves
          // /dashboard still forwards to /register.
          const userId = await ensureUser(identity, "STUDENT");
          const profile = await prisma.candidateProfile.findUnique({
            where: { userId },
            select: { id: true },
          });
          lines.push(
            `✓ ${pad(identity.key)} ${identity.email}  →  ${profile ? "HAS a profile (unexpected)" : "no profile, lands on /register"}`,
          );
          break;
        }
        case "challenge": {
          const userId = await idOf(identity.email);
          lines.push(
            userId
              ? `✓ ${pad(identity.key)} ${identity.email}  →  ${identity.note}`
              : `! ${pad(identity.key)} ${identity.email}  →  MISSING (prisma/seed.ts did not create it)`,
          );
          break;
        }
      }
    } catch (error) {
      lines.push(
        `✗ ${pad(identity.key)} ${identity.email}  →  ${String(error instanceof Error ? error.message : error).split("\n")[0]}`,
      );
    }
  }

  return lines;
}

function pad(key: string): string {
  return key.padEnd(11);
}

async function idOf(email: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  return row?.id ?? null;
}
