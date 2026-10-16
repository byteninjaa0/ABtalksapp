/**
 * Plan 195 — fill the test database with a platform worth testing.
 *
 * Two halves:
 *
 *   1. The existing seeds, run as subprocesses. They already know how to build
 *      a valid graph across 149 tables, and reimplementing that here would be
 *      a second definition of "a correct candidate" to keep in step. They are
 *      CALLED, never edited.
 *
 *   2. `provision.ts`, which adds the identities no seed creates: recruiters
 *      with their own organizations, a program member, a hackathon
 *      participant, the unregistered account, and the platform-admin grant.
 *
 * Why subprocesses rather than imports: every seed reaches `src/lib/db`, which
 * constructs its PrismaClient at module load from `process.env.DATABASE_URL`.
 * Importing one before the environment is set would bind it to whatever
 * `.env.local` says — a Neon host with real users. A child process started with
 * DATABASE_URL already in its environment cannot make that mistake, because the
 * `config({ path: ".env.local" })` at the top of those seeds does not override
 * a variable that is already set.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

import { enterTestEnv } from "./guard";

enterTestEnv("Bootstrapping the test environment");

/** Marks the one step that runs in-process rather than as a child seed. */
const BUILT_IN_CHALLENGE = "<built-in:challenge-spine>";
const BUILT_IN_PROGRAM = "<built-in:program-spine>";

type Step = {
  /** What is printed. */
  label: string;
  /** Path to the seed, relative to the repo root. */
  script: string;
  /**
   * `false` when the step is allowed to fail without failing the bootstrap —
   * content seeds that depend on JSON files which may not be present in every
   * checkout. A required step that fails stops everything, because the
   * identities built on top of it would be half-formed.
   */
  required: boolean;
  /** One line on what this contributes to the environment. */
  gives: string;
  /**
   * Set when the step is EXPECTED to end in an error on a clean database, and
   * that error is part of the design rather than a problem. Only the first pass
   * of the two-pass program seed qualifies; it is reported as expected so a
   * real regression elsewhere still stands out in the output.
   */
  expectFailure?: true;
};

/**
 * Order is load-bearing: content before the users that enrol in it.
 * `prisma/seed.ts` must come first — it creates the cohorts every challenge
 * enrollment points at, and `seedTestUsers` throws if they are missing.
 */
const STEPS: Step[] = [
  {
    // Content ONLY — `prisma/seed-content.ts` calls `seedContent()` and nothing
    // else. The full `prisma/seed.ts` would run `seedTestUsers()` straight
    // afterwards and throw `Missing cohort legacy-se`, because the canonical
    // learning spine those users enrol into does not exist yet. It is built
    // between these two steps; see `learning-content.ts` for why nothing in
    // the repo does that any more.
    label: "Challenge content",
    script: "prisma/seed-content.ts",
    required: true,
    gives: "Challenge, DailyTask, Quiz and QuizQuestion rows for all four domains",
  },
  {
    label: "Canonical learning spine",
    script: BUILT_IN_CHALLENGE,
    required: true,
    gives: "LearningProgram / ProgramVersion / Module / Activity + the legacy-<domain> cohorts",
  },
  {
    label: "Candidate cast",
    script: "prisma/seed-test-users.ts",
    required: true,
    gives: "the 9 seeded candidates with their day counts and streaks, + the admin user row",
  },
  {
    // AFTER prisma/seed.ts, which deletes every @abtalks.dev user and recreates
    // admin@abtalks.dev from scratch. Required, and not redundant with that
    // seed: seed.ts sets `User.role = ADMIN` but writes NO UserRoleAssignment,
    // and `hasPlatformAdmin` — the only authority for admin access since plan
    // 169 — trusts nothing else. Without this step /admin redirects to
    // /dashboard for an account that looks like an admin everywhere else.
    label: "Platform-admin grant",
    script: "prisma/scripts/seed-admin.ts",
    required: true,
    gives: "the GLOBAL PlatformRole.ADMIN UserRoleAssignment that /admin actually checks",
  },
  {
    label: "Colleges",
    script: "prisma/seed-colleges.ts",
    required: false,
    gives: "the college picker on /register",
  },
  {
    label: "Platform taxonomy",
    script: "prisma/seed-platform-taxonomy.ts",
    required: false,
    gives: "the skill/role taxonomy that candidate search ranks against",
  },
  {
    // Pass 1 of 2. This seed upserts ProgramDay rows and then, in the SAME run,
    // demands an Activity at `act_pd_<dayId>` for every one of them — a row
    // only the spine builder creates, and it has nothing to build from until
    // these days exist. So on a clean database pass 1 always ends at that
    // check, having written the days, which is what pass 2 needs. Tolerated,
    // not required: a checkout without the program content JSON just has no
    // /program track.
    label: "AI Cohort content (pass 1 — days)",
    script: "prisma/seed-program.ts",
    required: false,
    expectFailure: true,
    gives: "ProgramModule / ProgramDay rows for the 31-day track",
  },
  {
    label: "AI Cohort spine",
    script: BUILT_IN_PROGRAM,
    required: false,
    gives: "the act_pd_* Activity rows the program seed checks for",
  },
  {
    label: "AI Cohort content (pass 2 — missions)",
    script: "prisma/seed-program.ts",
    required: false,
    gives: "concept questions, videos and mission configs, now that activities exist",
  },
  {
    label: "Marketplace",
    script: "prisma/seed-marketplace.ts",
    required: false,
    gives: "redeemable items on /marketplace",
  },
  {
    label: "Hackathon problems",
    script: "prisma/seed-hackathon-problems.ts",
    required: false,
    gives: "problem statements for /hackathon",
  },
  {
    label: "Program test users",
    script: "prisma/seed-program-test-users.ts",
    required: false,
    gives: "extra /program members with varied scores",
  },
  {
    label: "Hire desk candidate fixtures",
    script: "prisma/seed-hire-fixtures.ts",
    required: false,
    gives: "scored candidates for the recruiter desk to actually find",
  },
];

async function run(step: Step): Promise<"ok" | "skipped" | "failed"> {
  if (step.script === BUILT_IN_CHALLENGE || step.script === BUILT_IN_PROGRAM) {
    // Imported here, not at the top of the file: it reaches `src/lib/db`, whose
    // PrismaClient binds to DATABASE_URL at module load, and the environment is
    // only correct after `enterTestEnv()` has run.
    const spine = await import("./learning-content");
    const started = Date.now();
    try {
      const detail =
        step.script === BUILT_IN_CHALLENGE
          ? await spine.buildLearningContent().then(
              (r) => `${r.cohorts} cohorts, ${r.activities} activities`,
            )
          : await spine.buildProgramSpine().then((n) =>
              n === 0 ? "no ProgramDay rows — nothing to build" : `${n} activities`,
            );
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`   ✓ ${step.label}  (${seconds}s) — ${detail}`);
      return "ok";
    } catch (error) {
      if (step.required) {
        console.error(`   ✗ ${step.label} — FAILED (required)\n       ${String(error)}`);
        throw error;
      }
      console.log(`   ! ${step.label} — failed, continuing\n       ${String(error)}`);
      return "failed";
    }
  }

  if (!existsSync(step.script)) {
    console.log(`   ─ ${step.label} — script not in this checkout, skipped`);
    return "skipped";
  }

  const started = Date.now();
  const result = spawnSync("npx", ["tsx", step.script], {
    // The whole point: the child inherits a DATABASE_URL that already points at
    // the test database, which the seeds' own dotenv call cannot override.
    env: { ...process.env },
    stdio: "pipe",
    encoding: "utf8",
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (result.status === 0) {
    console.log(`   ✓ ${step.label}  (${seconds}s)`);
    return "ok";
  }

  const detail = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim()
    .split("\n")
    .slice(-6)
    .map((l) => `       ${l}`)
    .join("\n");

  if (step.required) {
    console.error(`   ✗ ${step.label} — FAILED (required)\n${detail}`);
    throw new Error(`Required seed failed: ${step.script}`);
  }

  if (step.expectFailure) {
    console.log(
      `   ✓ ${step.label}  (${seconds}s) — stopped at the expected activity check; pass 2 completes it`,
    );
    return "ok";
  }

  console.log(`   ! ${step.label} — failed, continuing (optional)\n${detail}`);
  return "failed";
}

async function main() {
  // Step zero. The bootstrap is defined as "from any starting state, produce
  // this environment", and that is only true if it starts from an empty
  // database — see `wipe.ts` for the constraint that forces it.
  const { wipe } = await import("./wipe");
  const wiped = await wipe();
  console.log(`Wiped ${wiped} tables (schema kept)\n`);

  console.log("Seeds");
  const outcomes: (readonly [string, "ok" | "skipped" | "failed"])[] = [];
  for (const step of STEPS) {
    outcomes.push([step.label, await run(step)] as const);
  }

  // Imported only now: the environment is set, so the PrismaClient this pulls
  // in binds to the test database.
  const { provision } = await import("./provision");
  const summary = await provision();

  console.log("\nIdentities");
  for (const line of summary) console.log(`   ${line}`);

  const failed = outcomes.filter(([, o]) => o === "failed").length;
  const skipped = outcomes.filter(([, o]) => o === "skipped").length;

  console.log("\n─── Ready ───");
  console.log(
    `   seeds: ${outcomes.length - failed - skipped} ok, ${failed} failed, ${skipped} skipped`,
  );
  console.log("\n   Start it:   npm run test:env:dev");
  console.log("   Console:    http://localhost:3100/dev/test-console");
  console.log("   Fixtures:   npm run test:env:fixture -- --list\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nBootstrap failed:\n", error);
    process.exit(1);
  });
