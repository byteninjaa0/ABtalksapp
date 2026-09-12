/**
 * Remove every synthetic row created by `seed-load-pool.ts` (plan 136).
 *
 * Scoped strictly to the @loadpool.abtalks.dev suffix. Deleting the User cascades
 * to CandidateVisibility and ProgramMember, so the suffix is the only key needed.
 * Real users are never matched — and after this runs, the searchable count must
 * return to its pre-test value.
 */
import { config } from "dotenv";
import { prisma } from "../src/lib/db";

config({ path: ".env.local" });
config();

const DEV_NEON_HOST_ID = "ep-young-shadow-amawetjy";
const PRODUCTION_DB_HOST_IDS = ["ep-nameless-term-ams9a5e3", ".main."] as const;
const LOAD_POOL_SUFFIX = "@loadpool.abtalks.dev";
const COHORT_JOIN_CODE = "LOADPOOL";

function fail(m: string): never {
  console.error(m);
  process.exit(1);
}

function assertNotProduction() {
  const dbUrl = (process.env.DATABASE_URL ?? "").toLowerCase();
  if (process.env.NODE_ENV === "production") fail("❌ NODE_ENV is production.");
  for (const i of PRODUCTION_DB_HOST_IDS) {
    if (dbUrl.includes(i.toLowerCase())) fail(`❌ looks like production (${i}).`);
  }
  if (!dbUrl.includes(DEV_NEON_HOST_ID) && !dbUrl.includes("localhost")) {
    fail("❌ not the known dev DB. Refusing.");
  }
}

async function main() {
  assertNotProduction();
  const before = await prisma.user.count({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
  });
  console.log(`\nsynthetic users to remove: ${before}`);

  const del = await prisma.user.deleteMany({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
  });
  console.log(`  deleted ${del.count} users (cascades visibility + members)`);

  await prisma.programCohort.deleteMany({ where: { joinCode: COHORT_JOIN_CODE } });
  console.log(`  removed the load-pool cohort`);

  const searchable = await prisma.user.count({
    where: {
      deletedAt: null,
      visibility: { is: { searchableByRecruiters: true, withdrawnAt: null } },
    },
  });
  const leftover = await prisma.user.count({
    where: { email: { endsWith: LOAD_POOL_SUFFIX } },
  });
  console.log(`\n  leftover synthetic   = ${leftover} (must be 0)`);
  console.log(`  TOTAL searchable now = ${searchable}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
