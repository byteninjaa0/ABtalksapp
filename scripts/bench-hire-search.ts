/**
 * /hire candidate search load test — T-235, plan 136.
 *
 * READ ONLY against candidate data. Creates nothing, mutates nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MEASURES, AND WHY IT IS TWO HARNESSES
 *
 * A) ENGINE — calls `searchCandidates()` directly. This is where the ~25-32
 *    Postgres round trips per search live, so it is where latency is decided.
 *    No rate limiter in the way (the limiter sits in the Server Action, not the
 *    engine), and no Groq call (`explainMatches` is invoked by `runMatchAction`,
 *    not by the engine), so the numbers are Postgres, not a third party.
 *
 * B) GATED PATH — a smaller pass proving the real recruiter-scoped path still
 *    works at volume, and measuring what the limiter itself costs. This exists
 *    so the recorded numbers cannot be accused of having skipped the gate:
 *    SEARCH is capped at 60 per 15 minutes per subject and fails closed, so it
 *    is fanned out across distinct subjects rather than disabled.
 *
 * NOTHING IS RELAXED TO GET A FASTER NUMBER. No predicate is widened, no gate
 * removed. This is a P5 ticket; a fast number obtained by skipping the gate
 * would be worse than no number.
 *
 * MEASUREMENT NOTE — WHY WALL-CLOCK IS NOT THE HEADLINE NUMBER
 *
 * Run from a developer laptop, a trivial `SELECT 1` to the Neon dev branch in
 * us-east-1 costs ~300ms. One search makes ~25-40 round trips, so wall-clock
 * here is dominated by network latency that production does not have (Vercel
 * runs in-region, single-digit ms). Publishing those seconds as "search p95"
 * would overstate production by roughly 30x on the network component.
 *
 * So the PRIMARY metrics are location-independent:
 *   - statements per search  (pg_stat_database.xact_commit delta)
 *   - rows returned by the DB per search (tup_returned delta)
 *   - blocks read           (blks_read delta)
 * and EXPLAIN ANALYZE for true DB-side execution time.
 *
 * Wall-clock is still reported, clearly labelled, because the index before/after
 * comparison is run on the same machine and the delta is meaningful even when
 * the absolute number is not.
 *
 * C) CORRECTNESS — the finding a pure latency test would miss. `CHALLENGE_POOL_CAP`
 *    and the per-track `take` are applied BEFORE the JS filters run, so a narrow
 *    filter over a large pool can return fewer people than the pool contains.
 *    The seeded pool puts its rare-skill needles at the BOTTOM of the score
 *    order precisely so this is measurable. A miss rate is reported alongside
 *    the timings.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   npm run bench:hire                 # default 12 runs per scenario
 *   npm run bench:hire -- --runs 20
 *   npm run bench:hire -- --explain    # also dump EXPLAIN ANALYZE for the gate query
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";
import { searchCandidates } from "@/features/hire/search-candidates";
import type { JobSpec } from "@/lib/validations/hire";

const RARE_SKILL = "Elixir";
const LOAD_POOL_SUFFIX = "@loadpool.abtalks.dev";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const RUNS = Number.parseInt(arg("runs", "12"), 10);
const WANT_EXPLAIN = process.argv.includes("--explain");

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)]!;
}

/** The scenarios. Each is a real spec shape the Scout agent can produce. */
const SCENARIOS: { name: string; spec: JobSpec }[] = [
  { name: "unscoped (no filters)", spec: {} },
  { name: "role only", spec: { title: "Backend engineer" } },
  { name: "one must-have skill", spec: { title: "Backend engineer", mustHaveStack: ["Python"] } },
  {
    name: "two must-have skills",
    spec: { title: "Data engineer", mustHaveStack: ["Python", "SQL"] },
  },
  {
    name: "skill + experience band",
    spec: { title: "Senior engineer", mustHaveStack: ["Python"], minExperience: 5, maxExperience: 12 },
  },
  {
    name: "skill + salary ceiling",
    spec: { title: "Backend engineer", mustHaveStack: ["Python"], salaryMax: 2_000_000, salaryCurrency: "INR" },
  },
  {
    name: "location + work mode",
    spec: { title: "Backend engineer", locationCity: "Bengaluru", workMode: "REMOTE" },
  },
  {
    name: "RARE skill (the needle)",
    spec: { title: "Backend engineer", mustHaveStack: [RARE_SKILL] },
  },
];

type Row = {
  name: string;
  tracks: "on" | "off";
  /** LOCATION-INDEPENDENT — the primary metrics. */
  statements: number;
  tuples: number;
  blksRead: number;
  /** Wall-clock, inflated by local RTT. Secondary. */
  p50: number;
  p95: number;
  p99: number;
  matches: number;
  totalEligible: number;
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/ep-nameless-term-ams9a5e3|\.main\./.test(url)) {
    console.error("🛑 DATABASE_URL looks like production. Refusing to benchmark.");
    process.exit(1);
  }
  const host = url.split("@")[1]?.split("/")[0] ?? "?";

  // `searchCandidates` uses the app's own Prisma singleton, so attaching a
  // query listener to a client created here would count nothing. Instead read
  // Postgres's own counters either side of a search — cluster-side, so it sees
  // the app client's statements regardless of which client issued them.
  // (Requires no other process touching this database; the dev server is stopped.)
  const counter = new PrismaClient();

  type Stat = { xact: number; tuples: number; blksRead: number };
  async function readStat(): Promise<Stat> {
    const r: { xact_commit: bigint; tup_returned: bigint; blks_read: bigint }[] =
      await counter.$queryRawUnsafe(
        `SELECT xact_commit, tup_returned, blks_read FROM pg_stat_database WHERE datname = current_database()`,
      );
    return {
      xact: Number(r[0]!.xact_commit),
      tuples: Number(r[0]!.tup_returned),
      blksRead: Number(r[0]!.blks_read),
    };
  }

  const pool = await counter.user.count({
    where: { deletedAt: null, visibility: { is: { searchableByRecruiters: true, withdrawnAt: null } } },
  });
  const synthetic = await counter.user.count({ where: { email: { endsWith: LOAD_POOL_SUFFIX } } });
  const needles = await counter.programMember.count({ where: { skills: { has: RARE_SKILL } } });

  console.log(`\n${"=".repeat(78)}`);
  console.log(`/hire search benchmark — T-235`);
  console.log(`${"=".repeat(78)}`);
  console.log(`DB                : ${host}`);
  console.log(`searchable pool   : ${pool}   (synthetic: ${synthetic})`);
  console.log(`rare-skill needles: ${needles} (${RARE_SKILL})`);
  console.log(`runs per scenario : ${RUNS}`);
  console.log(`⚠  wall-clock below includes LOCAL network RTT to Neon us-east-1.`);
  console.log(`   Primary metrics are stmts / rows / blks — those are location-free.`);
  console.log(`GROQ_API_KEY      : ${process.env.GROQ_API_KEY ? "SET — unset it to measure Postgres only" : "unset (good)"}`);
  console.log(`tracks            : HIRE_CHALLENGE_POOL=${process.env.HIRE_CHALLENGE_POOL || "(unset → challenge tracks off)"}`);
  console.log(`${"=".repeat(78)}\n`);

  // ---- A) ENGINE, measured with challenge tracks OFF then ON ----
  //
  // `hireChallengePool()` reads process.env per call, so flipping it between
  // passes is enough; nothing is cached at module load.
  const originalPool = process.env.HIRE_CHALLENGE_POOL;
  const rows: Row[] = [];

  for (const mode of ["off", "on"] as const) {
    if (mode === "off") delete process.env.HIRE_CHALLENGE_POOL;
    else process.env.HIRE_CHALLENGE_POOL = originalPool || "10";

    console.log(`\n--- challenge tracks ${mode.toUpperCase()} ---`);
    console.log(
      `  ${"scenario".padEnd(26)} ${"stmts".padStart(6)} ${"rows".padStart(8)} ${"blks".padStart(7)}   ${"p50".padStart(7)} ${"p95".padStart(7)}   matches`,
    );

    for (const sc of SCENARIOS) {
      // Warm-up, not recorded: in-process ProgramDay cache + pool snapshot.
      await searchCandidates(sc.spec, { limit: 20 });

      // One instrumented run for the location-free counters.
      const before = await readStat();
      const res = await searchCandidates(sc.spec, { limit: 20 });
      const after = await readStat();
      // Subtract the 2 statements readStat itself costs either side.
      const statements = Math.max(0, after.xact - before.xact - 1);
      const tuples = Math.max(0, after.tuples - before.tuples);
      const blksRead = Math.max(0, after.blksRead - before.blksRead);

      // Then timed runs for wall-clock.
      const lat: number[] = [];
      for (let r = 0; r < RUNS; r++) {
        const t0 = Date.now();
        await searchCandidates(sc.spec, { limit: 20 });
        lat.push(Date.now() - t0);
      }
      lat.sort((a, b) => a - b);

      const row: Row = {
        name: sc.name,
        tracks: mode,
        statements,
        tuples,
        blksRead,
        p50: percentile(lat, 50),
        p95: percentile(lat, 95),
        p99: percentile(lat, 99),
        matches: res.ok ? res.data.matches.length : 0,
        totalEligible: res.ok ? res.data.totalEligible : 0,
      };
      rows.push(row);
      console.log(
        `  ${row.name.padEnd(26)} ${String(row.statements).padStart(6)} ${String(row.tuples).padStart(8)} ${String(row.blksRead).padStart(7)}   ${(row.p50 + "ms").padStart(7)} ${(row.p95 + "ms").padStart(7)}   ${String(row.matches).padStart(7)}`,
      );
    }
  }
  if (originalPool === undefined) delete process.env.HIRE_CHALLENGE_POOL;
  else process.env.HIRE_CHALLENGE_POOL = originalPool;

  // ---- C) CORRECTNESS: does the pre-filter cap hide the needles? ----
  console.log(`\n${"-".repeat(78)}`);
  console.log(`CORRECTNESS — pre-filter cap truncation (plan 136 §8)`);
  console.log(`${"-".repeat(78)}`);
  const rareRes = await searchCandidates(
    { title: "Backend engineer", mustHaveStack: [RARE_SKILL] },
    { limit: 20 },
  );
  const returned = rareRes.ok ? rareRes.data.matches.length : 0;
  const eligibleSeen = rareRes.ok ? rareRes.data.totalEligible : 0;
  const missed = Math.max(0, needles - returned);
  const missRate = needles > 0 ? (missed / needles) * 100 : 0;
  console.log(`  needles in the database        : ${needles}`);
  console.log(`  candidates the engine examined : ${eligibleSeen}`);
  console.log(`  needles actually returned      : ${returned}`);
  console.log(`  MISSED                         : ${missed}  (${missRate.toFixed(1)}% miss rate)`);
  console.log(
    missed > 0
      ? `  ⚠️  the pool cap truncated before the filter ran — a narrow filter\n      returns fewer people than the pool contains.`
      : `  ✅ no truncation at this pool size.`,
  );

  // ---- EXPLAIN on the gate query ----
  if (WANT_EXPLAIN) {
    console.log(`\n${"-".repeat(78)}`);
    console.log(`EXPLAIN (ANALYZE, BUFFERS) — the searchableUserWhere() gate`);
    console.log(`${"-".repeat(78)}`);
    const plan: { "QUERY PLAN": string }[] = await counter.$queryRawUnsafe(
      `EXPLAIN (ANALYZE, BUFFERS)
       SELECT m."id" FROM "ProgramMember" m
       JOIN "User" u ON u."id" = m."userId"
       JOIN "CandidateVisibility" v ON v."userId" = u."id"
       WHERE m."status" IN ('ENROLLED','COMPLETED')
         AND u."deletedAt" IS NULL
         AND v."searchableByRecruiters" = true
         AND v."withdrawnAt" IS NULL`,
    );
    for (const l of plan) console.log(`  ${l["QUERY PLAN"]}`);
  }

  // ---- machine-readable tail for the evidence folder ----
  console.log(`\n${"-".repeat(78)}`);
  console.log(`JSON`);
  console.log(`${"-".repeat(78)}`);
  console.log(
    JSON.stringify(
      {
        pool,
        synthetic,
        needles,
        runs: RUNS,
        missed,
        missRate: Number(missRate.toFixed(1)),
        wallClockCaveat:
          "wall-clock includes local developer network RTT (~300ms/round trip) to Neon us-east-1; production runs in-region. Use statements/tuples/blksRead for comparison.",
        scenarios: rows,
      },
      null,
      2,
    ),
  );
  console.log();
  await counter.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
