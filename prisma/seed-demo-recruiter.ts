/**
 * Dev-only demo fixture for T-229 and T-230 browser validation.
 *
 * Sets up an approved recruiter with a completed T-226 workspace and the
 * T-228 $200 starting balance using the real `provisionRecruiterIdentity`
 * application helper. Also ensures `strong@hire.abtalks.dev` has
 * `CandidateVisibility` (searchable by recruiters) and a phone number on
 * `CandidateProfile` so the real $10 unlock and contact reveal can be demoed.
 *
 * Idempotent: safe to run multiple times without duplicating grants or records.
 *
 * Usage:
 *   npx tsx prisma/seed-demo-recruiter.ts
 */
import { createRequire } from "node:module";
import Module from "node:module";
import { config } from "dotenv";
import { Role } from "@prisma/client";
import { prisma } from "../src/lib/db";

function neutralizeServerOnly(): void {
  const require = createRequire(import.meta.url);
  try {
    const serverOnlyPath = require.resolve("server-only");
    require.cache[serverOnlyPath] = {
      id: serverOnlyPath,
      filename: serverOnlyPath,
      loaded: true,
      exports: {},
    } as NodeModule;
  } catch {
    // keep fallback
  }

  const mod = Module as unknown as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = mod._load;
  mod._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "server-only") return {};
    return originalLoad.call(this, request, parent, isMain);
  };
}

neutralizeServerOnly();

config({ path: ".env.local" });
config();

const PRODUCTION_DB_HOST_IDS = ["ep-nameless-term-ams9a5e3", ".main."] as const;
const RECRUITER_EMAIL = "recruiter@hire.abtalks.dev";
const CANDIDATE_EMAIL = "strong@hire.abtalks.dev";

/**
 * Every candidate `seed-hire-fixtures.ts` creates.
 *
 * All three need `CandidateVisibility`, not just the T-229 one: the /hire pool
 * gate is `searchableByRecruiters` (repositories/talent.ts `searchableUserWhere`
 * / `filterSearchableUserIds`), so a fixture without a row is invisible to
 * search AND unassignable in the T-244 assign panel. Seeding only `strong@`
 * left TC-R-018 ("assign to three candidates") impossible to demonstrate.
 *
 * There is no UI for this — `searchableByRecruiters` is written with
 * `consentSource: "platform_default"`, never from the profile form.
 */
const POOL_EMAILS = [
  CANDIDATE_EMAIL,
  "narrow@hire.abtalks.dev",
  "consistent@hire.abtalks.dev",
] as const;
const COMPANY_NAME = "Scout Test Co";

function assertNotProductionDb() {
  const url = process.env.DATABASE_URL ?? "";
  for (const id of PRODUCTION_DB_HOST_IDS) {
    if (url.includes(id)) {
      throw new Error(
        `Refusing to seed: DATABASE_URL looks like production (${id}). Use a Neon branch.`,
      );
    }
  }
}

async function main() {
  assertNotProductionDb();

  console.log("\n─── Setting up T-229/T-230 Demo Recruiter & Candidate ───\n");

  // 1. Recruiter User (with password for dev login)
  const recruiterUser = await prisma.user.upsert({
    where: { email: RECRUITER_EMAIL },
    create: {
      email: RECRUITER_EMAIL,
      name: "Hire Recruiter",
      password: "test",
      role: Role.RECRUITER,
      emailVerified: new Date(),
    },
    update: {
      password: "test",
      role: Role.RECRUITER,
      emailVerified: new Date(),
    },
    select: { id: true, email: true },
  });
  console.log(`  ✓ Recruiter user: ${recruiterUser.email} (id: ${recruiterUser.id})`);

  // 2. RecruiterProfile: approved=true AND setupCompletedAt set (T-226)
  const profile = await prisma.recruiterProfile.upsert({
    where: { userId: recruiterUser.id },
    create: {
      userId: recruiterUser.id,
      fullName: "Hire Recruiter",
      company: COMPANY_NAME,
      approved: true,
      approvedAt: new Date(),
      setupCompletedAt: new Date(),
    },
    update: {
      approved: true,
      approvedAt: new Date(),
      setupCompletedAt: new Date(),
      company: COMPANY_NAME,
    },
    select: { id: true, company: true, approved: true, setupCompletedAt: true },
  });
  console.log(
    `  ✓ Recruiter profile: approved=${profile.approved}, setupCompletedAt=${profile.setupCompletedAt?.toISOString()}`,
  );

  // 3. Workspace Provisioning + T-228 Onboarding Credit ($200)
  // Calls the canonical application helper in an interactive transaction.
  const { provisionRecruiterIdentity } = await import(
    "../src/features/hire/provision-recruiter"
  );
  const { getCreditBalance } = await import("../src/repositories/credits");

  const { organizationId } = await prisma.$transaction(
    async (tx) => {
      return provisionRecruiterIdentity(tx, {
        userId: recruiterUser.id,
        company: profile.company,
      });
    },
    { maxWait: 20000, timeout: 20000 },
  );

  const balanceMinor = await getCreditBalance(organizationId);
  console.log(
    `  ✓ Workspace provisioned (orgId: ${organizationId}) with credit balance: $${(balanceMinor / 100).toFixed(2)}`,
  );

  // 4. Candidate: Ensure CandidateVisibility exists (searchableByRecruiters: true)
  const candidateUser = await prisma.user.findUnique({
    where: { email: CANDIDATE_EMAIL },
    select: { id: true },
  });

  if (!candidateUser) {
    throw new Error(
      `Candidate ${CANDIDATE_EMAIL} not found. Please run 'npx tsx prisma/seed-hire-fixtures.ts' first.`,
    );
  }

  for (const email of POOL_EMAILS) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      throw new Error(
        `Candidate ${email} not found. Please run 'npx tsx prisma/seed-hire-fixtures.ts' first.`,
      );
    }
    await prisma.candidateVisibility.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        searchableByRecruiters: true,
        consentSource: "platform_default",
        showResume: true,
        showInterviewResults: true,
        showAssessmentScores: true,
        showLinkedin: true,
        showGithub: true,
        showCurrentEmployer: true,
      },
      update: {
        searchableByRecruiters: true,
        withdrawnAt: null,
      },
    });
    console.log(`  ✓ Candidate visibility: searchableByRecruiters=true for ${email}`);
  }

  // 5. Candidate: Ensure CandidateProfile has phone for T-229 contact reveal
  await prisma.candidateProfile.upsert({
    where: { userId: candidateUser.id },
    create: {
      userId: candidateUser.id,
      fullName: "Scout Strong",
      referralCode: "STRONG01",
      phone: "+1 (555) 019-2834",
    },
    update: {
      phone: "+1 (555) 019-2834",
    },
    select: {
      id: true,
      userId: true,
      phone: true,
    },
  });
  console.log(`  ✓ Candidate profile: phone=+1 (555) 019-2834 for ${CANDIDATE_EMAIL}`);

  console.log("\nDone! Demo recruiter is ready for testing at /login and /hire.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
