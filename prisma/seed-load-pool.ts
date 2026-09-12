/**
 * Synthetic candidate pool for the T-235 search load test (plan 136).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY SYNTHETIC, AND WHY THIS SHAPE
 *
 * The dev branch already holds ~12,810 real users, but only a few dozen pass the
 * recruiter search gate. Those historical users were DELIBERATELY never opened:
 * `docs/project-context.md:507` — "Explicitly NOT all ~12,800 historical
 * platform users" — and plan 133 D1 records that opening them is a legal
 * decision which "must not be made silently". So this seeder NEVER touches a
 * real user's `CandidateVisibility`. It creates its own, clearly-labelled rows
 * under @loadpool.abtalks.dev and nothing else.
 *
 * PROGRAM members, not PROFILE candidates, on purpose. `listProfileCandidates`
 * caps at `take: 600` in SQL, so a 10k PROFILE pool would silently truncate and
 * the load test would look fast for the wrong reason. The PROGRAM loader has no
 * `take` at all (`CHALLENGE_POOL_CAP` is never passed to `loadProgram()`), which
 * is exactly the unbounded read the test needs to stress.
 *
 * Chunked `createMany` throughout, following `prisma/scripts/migrate-2b-visibility.ts`
 * — per-row upserts in a loop would be ~5 round trips per candidate over the
 * Neon pooler, i.e. tens of thousands of sequential queries for a 10k pool.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npm run db:seed:load-pool -- 2000      # grow the pool to 2000 (idempotent)
 *   npm run db:cleanup:load-pool           # remove every synthetic row
 */
import { config } from "dotenv";
import { ProgramMemberStatus } from "@prisma/client";
import { prisma } from "../src/lib/db";

config({ path: ".env.local" });
config();

const DEV_NEON_HOST_ID = "ep-young-shadow-amawetjy";
const PRODUCTION_DB_HOST_IDS = ["ep-nameless-term-ams9a5e3", ".main."] as const;

export const LOAD_POOL_SUFFIX = "@loadpool.abtalks.dev";
const COHORT_JOIN_CODE = "LOADPOOL";
const COHORT_NAME = "AI Cohort — Load Pool (synthetic)";
const CHUNK = 200;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Allow-list guard, copied from `seed-program-test-users.ts:139-170`.
 *
 * Deliberately the allow-list form, not the deny-list used by
 * `seed-hire-fixtures.ts`: this seeder writes thousands of rows, so "does not
 * look like production" is not good enough — it must look like the known dev DB.
 */
function assertNotProduction() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const nodeEnv = process.env.NODE_ENV ?? "";

  if (process.env.SEED_ALLOW_PRODUCTION === "true") {
    console.warn("⚠️  SEED_ALLOW_PRODUCTION=true — bypassing production guard");
    return;
  }
  if (nodeEnv === "production") {
    fail("❌ NODE_ENV is production. Refusing to seed the load pool.");
  }
  const dbLower = dbUrl.toLowerCase();
  for (const indicator of PRODUCTION_DB_HOST_IDS) {
    if (dbLower.includes(indicator.toLowerCase())) {
      fail(`❌ DATABASE_URL looks like production (${indicator}). Refusing.`);
    }
  }
  if (!dbLower.includes(DEV_NEON_HOST_ID) && !dbLower.includes("localhost")) {
    const host = dbUrl.split("@")[1]?.split("/")[0] ?? "(unknown)";
    fail(
      "❌ DATABASE_URL doesn't look like the known dev DB.\n" +
        `   URL host: ${host}\n` +
        "   Set SEED_ALLOW_PRODUCTION=true to override (NOT RECOMMENDED)",
    );
  }
}

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Deterministic per-index attributes.
 *
 * Spread across skills, experience and score so the pre-cap sort key
 * (`totalScore`) and the post-load JS filters both have something to bite on.
 * Crucially the DISTRIBUTION IS SKEWED: the candidates carrying the rarest skill
 * sit at the BOTTOM of the score order, which is what makes the 600-cap
 * truncation measurable (plan 136 §8).
 */
const SKILL_POOL = [
  ["Python", "SQL"],
  ["Python", "FastAPI"],
  ["TypeScript", "React"],
  ["Java", "Spring"],
  ["Go", "Kubernetes"],
  ["Python", "SQL", "dbt"],
];
/** The needle: rare, and deliberately given the LOWEST scores. */
const RARE_SKILL = "Elixir";

/**
 * Missions PASSED per candidate.
 *
 * `missionPoints` is just an integer column — the eligibility floor counts
 * distinct days with a PASSING `ProgramMissionSubmission`
 * (`dossier.ts:226` -> `clearsEvidenceFloor`, MIN_EARNED_MISSIONS = 3). A pool
 * seeded without those rows is 100% below the floor and returns nothing, which
 * is exactly the trap the first run of this seeder fell into.
 *
 * The rare-skill needles get the MINIMUM passing count (3) so they sit at the
 * bottom of the evidence order while still being eligible — that is what makes
 * pre-filter cap truncation measurable rather than masked by the floor.
 */
function missionDays(i: number): number {
  return i % 250 === 0 ? 3 : 6 + (i % 10);
}

function attrs(i: number) {
  const isRare = i % 250 === 0; // ~0.4% of the pool
  const base = SKILL_POOL[i % SKILL_POOL.length]!;
  return {
    skills: isRare ? [...base, RARE_SKILL] : base,
    // Rare candidates score lowest, so any cap applied before filtering drops them.
    totalScore: isRare ? 10 + (i % 5) : 200 + (i % 400),
    missionPoints: isRare ? 12 : 60 + (i % 180),
    cleanPassCount: isRare ? 3 : 5 + (i % 14),
    yearsExperience: 1 + (i % 12),
  };
}

async function main() {
  assertNotProduction();

  const target = Number.parseInt(process.argv[2] ?? "", 10);
  if (!Number.isFinite(target) || target <= 0) {
    fail("Usage: npm run db:seed:load-pool -- <targetCount>");
  }

  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\nLoad pool → ${target} synthetic PROGRAM candidates`);
  console.log(`DB: ${host}\n`);

  // A published cohort, so `listPoolCohorts` accepts it without needing
  // HIRE_OPEN_COHORT_IDS to be set.
  const cohort = await prisma.programCohort.upsert({
    where: { joinCode: COHORT_JOIN_CODE },
    create: {
      name: COHORT_NAME,
      joinCode: COHORT_JOIN_CODE,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-03-01"),
      status: "COMPLETED",
      requiresJoinCode: true,
      resultsPublishedAt: new Date(),
      capacity: 100000,
    },
    update: { resultsPublishedAt: new Date(), status: "COMPLETED" },
    select: { id: true },
  });

  const existing = await prisma.user.count({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
  });
  console.log(`  existing synthetic users: ${existing}`);
  const t0 = Date.now();
  const toCreate = [];
  for (let i = existing; i < target; i++) {
    toCreate.push({ i, email: `lp${String(i).padStart(6, "0")}${LOAD_POOL_SUFFIX}` });
  }
  if (toCreate.length === 0) {
    console.log(`  already at ${existing}; creating no new users.`);
  }

  // Every step below is idempotent (`skipDuplicates`), so the mission-submission
  // backfill still runs when the users already exist. An early return here was
  // the bug that produced a pool with 547/567 below the evidence floor.

  // 1. Users
  for (const batch of chunked(toCreate, CHUNK)) {
    await prisma.user.createMany({
      data: batch.map((r) => ({
        email: r.email,
        name: `Load Pool ${r.i}`,
        password: "test",
        role: "STUDENT" as const,
        emailVerified: new Date(),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  users created`);

  const users = await prisma.user.findMany({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
    select: { id: true, email: true },
  });
  const indexOf = (email: string) =>
    Number.parseInt(email.slice(2, email.indexOf("@")), 10);

  // 2. CandidateVisibility — the discovery gate. Synthetic rows only.
  for (const batch of chunked(users, CHUNK)) {
    await prisma.candidateVisibility.createMany({
      data: batch.map((u) => ({
        userId: u.id,
        searchableByRecruiters: true,
        consentSource: "platform_default",
        consentedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  visibility created`);

  // 3. ProgramMember — the unbounded read under test.
  for (const batch of chunked(users, CHUNK)) {
    await prisma.programMember.createMany({
      data: batch.map((u) => {
        const i = indexOf(u.email!);
        const a = attrs(i);
        return {
          userId: u.id,
          cohortId: cohort.id,
          status: ProgramMemberStatus.COMPLETED,
          fullName: `Load Pool ${i}`,
          jobRole: "Software Engineer",
          company: "Load Pool Co",
          yearsExperience: a.yearsExperience,
          skills: a.skills,
          githubUsername: `lp${i}`,
          githubRepoUrl: `https://github.com/example/lp${i}`,
          missionPoints: a.missionPoints,
          cleanPassCount: a.cleanPassCount,
          totalScore: a.totalScore,
          projectPoints: 40 + (i % 60),
          commitPoints: 20 + (i % 40),
          enrolledAt: new Date("2026-01-02"),
          completedAt: new Date("2026-02-28"),
        };
      }),
      skipDuplicates: true,
    });
  }
  console.log(`  members created`);

  // 4. ProgramMissionSubmission — REQUIRED for eligibility. Without >= 3 distinct
  //    passing days a candidate is counted in `belowEvidenceFloor` and never
  //    returned, no matter what its skills or score columns say.
  const members = await prisma.programMember.findMany({
    where: { cohortId: cohort.id },
    select: { id: true, fullName: true },
  });
  const subs: {
    memberId: string;
    dayNumber: number;
    attemptNumber: number;
    payload: object;
    verdict: object;
    passed: boolean;
    pointsAwarded: number;
  }[] = [];
  for (const m of members) {
    const i = Number.parseInt(m.fullName.replace(/\D/g, ""), 10) || 0;
    for (let d = 1; d <= missionDays(i); d++) {
      subs.push({
        memberId: m.id,
        dayNumber: d,
        attemptNumber: 1,
        payload: { code: "load-pool" },
        verdict: [{ check: "seed", passed: true, detail: "synthetic" }] as unknown as object,
        passed: true,
        pointsAwarded: 10,
      });
    }
  }
  for (const batch of chunked(subs, CHUNK)) {
    await prisma.programMissionSubmission.createMany({ data: batch, skipDuplicates: true });
  }
  console.log(`  mission submissions created (${subs.length})`);

  console.log(`\n  seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await report(cohort.id);
}

async function report(cohortId: string) {
  const synthetic = await prisma.user.count({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
  });
  const members = await prisma.programMember.count({ where: { cohortId } });
  const searchable = await prisma.user.count({
    where: {
      deletedAt: null,
      visibility: { is: { searchableByRecruiters: true, withdrawnAt: null } },
    },
  });
  const rare = await prisma.programMember.count({
    where: { cohortId, skills: { has: RARE_SKILL } },
  });
  console.log(`\n  synthetic users      = ${synthetic}`);
  console.log(`  synthetic members    = ${members}`);
  console.log(`  rare-skill needles   = ${rare} (${RARE_SKILL})`);
  console.log(`  TOTAL searchable     = ${searchable}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
