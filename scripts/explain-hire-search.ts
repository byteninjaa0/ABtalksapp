/**
 * EXPLAIN (ANALYZE, BUFFERS) for the /hire search hot queries — T-235, plan 136.
 *
 * READ ONLY. Runs EXPLAIN on hand-written SQL equivalents of the three queries
 * the engine issues, so the planner's decisions are recorded as evidence rather
 * than inferred. These are the statements behind the row amplification measured
 * by `bench:hire`.
 *
 * Usage: npm run explain:hire
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

/**
 * Run each EXPLAIN three times and report all three execution times.
 *
 * The first run is cold — it shows `read=` buffers (disk) and an inflated
 * planning time. Comparing a cold plan against a warm one would manufacture a
 * difference that is cache state, not query shape. The warm runs are the
 * comparable numbers; the full plan printed is the last (warm) one.
 */
async function explain(label: string, note: string, sql: string) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(label);
  console.log(`${"=".repeat(78)}`);
  console.log(note);
  console.log("-".repeat(78));
  const times: string[] = [];
  let last: { "QUERY PLAN": string }[] = [];
  for (let i = 0; i < 3; i++) {
    last = await p.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS) ${sql}`);
    const ex = last.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Execution Time"));
    const pl = last.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Planning Time"));
    times.push(`run ${i + 1}: ${pl ?? "?"} | ${ex ?? "?"}`);
  }
  console.log("TIMINGS (run 1 is cold; compare warm runs only):");
  for (const t of times) console.log(`  ${t}`);
  console.log("-".repeat(78));
  console.log("WARM PLAN (last run):");
  for (const l of last) console.log(l["QUERY PLAN"]);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/ep-nameless-term-ams9a5e3|\.main\./.test(url)) {
    console.error("PRODUCTION — refusing."); process.exit(1);
  }
  console.log(`DB: ${url.split("@")[1]?.split("/")[0]}`);
  console.log(`pool (searchable): ${await p.user.count({ where: { deletedAt: null, visibility: { is: { searchableByRecruiters: true, withdrawnAt: null } } } })}`);

  // 1. THE AMPLIFIER — listChallengeCandidates (repositories/hire.ts:383-408).
  //    No take, no orderBy, no day predicate. Filters `challenge.domain` even
  //    though Enrollment.domain is denormalised AND indexed (schema:102).
  await explain(
    "1. CHALLENGE TRACK — unbounded Enrollment scan (the ~40x amplifier)",
    `listChallengeCandidates: WHERE challenge.domain IN (...) AND EXISTS(submissions)\n` +
      `AND the user gate. No LIMIT. This is the query that returns ~40k rows per search.`,
    `SELECT e."id", e."userId", e."daysCompleted"
       FROM "Enrollment" e
       JOIN "Challenge" c ON c."id" = e."challengeId"
       JOIN "User" u ON u."id" = e."userId"
       JOIN "CandidateVisibility" v ON v."userId" = u."id"
      WHERE c."domain" IN ('CLAUDE','SE','DS','AI')
        AND EXISTS (SELECT 1 FROM "Submission" s WHERE s."enrollmentId" = e."id")
        AND u."deletedAt" IS NULL
        AND v."searchableByRecruiters" = true
        AND v."withdrawnAt" IS NULL`,
  );

  // 1b. The same filter using the DENORMALISED, INDEXED column instead.
  //     Enrollment @@index([domain, daysCompleted, currentStreak]) (schema:102).
  await explain(
    "1b. SAME QUERY, filtering Enrollment.domain (already indexed) — the free fix",
    `A one-line change: filter the denormalised Enrollment.domain instead of joining\n` +
      `Challenge. Compare the plan above. NOT implemented in this PR — documented only.`,
    `SELECT e."id", e."userId", e."daysCompleted"
       FROM "Enrollment" e
       JOIN "User" u ON u."id" = e."userId"
       JOIN "CandidateVisibility" v ON v."userId" = u."id"
      WHERE e."domain" IN ('CLAUDE','SE','DS','AI')
        AND EXISTS (SELECT 1 FROM "Submission" s WHERE s."enrollmentId" = e."id")
        AND u."deletedAt" IS NULL
        AND v."searchableByRecruiters" = true
        AND v."withdrawnAt" IS NULL`,
  );

  // 2. THE GATE — searchableUserWhere() joined to ProgramMember. Merged into
  //    every candidate query, so the highest-leverage index candidate.
  await explain(
    "2. THE DISCOVERY GATE — ProgramMember x User x CandidateVisibility",
    `searchableUserWhere() is ANDed into every candidate query (11 sites).\n` +
      `Candidate index: CandidateVisibility(searchableByRecruiters, withdrawnAt, userId).`,
    `SELECT m."id", m."userId", m."totalScore"
       FROM "ProgramMember" m
       JOIN "User" u ON u."id" = m."userId"
       JOIN "CandidateVisibility" v ON v."userId" = u."id"
      WHERE m."status" IN ('ENROLLED','COMPLETED')
        AND u."deletedAt" IS NULL
        AND v."searchableByRecruiters" = true
        AND v."withdrawnAt" IS NULL`,
  );

  // 3. THE WASTED JOIN — RECRUITER_FIELD_POLICY.interviewResults is false, but
  //    PROGRAM_CANDIDATE_SELECT still selects the interview relation and the
  //    result is discarded in JS (repositories/hire.ts:145).
  const withInterview: { "QUERY PLAN": string }[] = await p.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS) SELECT m."id", i."id" AS interview_id
       FROM "ProgramMember" m
       LEFT JOIN "ProgramInterview" i ON i."memberId" = m."id"
      WHERE m."status" IN ('ENROLLED','COMPLETED')`,
  );
  const withoutInterview: { "QUERY PLAN": string }[] = await p.$queryRawUnsafe(
    `EXPLAIN (ANALYZE, BUFFERS) SELECT m."id"
       FROM "ProgramMember" m
      WHERE m."status" IN ('ENROLLED','COMPLETED')`,
  );
  const ms = (rows: { "QUERY PLAN": string }[]) => {
    const line = rows.map((r) => r["QUERY PLAN"]).find((l) => l.startsWith("Execution Time"));
    return line ? Number(line.replace(/[^0-9.]/g, "")) : NaN;
  };
  console.log(`\n${"=".repeat(78)}`);
  console.log("4. THE WASTED interview JOIN — quantified");
  console.log(`${"=".repeat(78)}`);
  console.log(`RECRUITER_FIELD_POLICY.interviewResults is false (repositories/talent.ts:64-71),`);
  console.log(`yet PROGRAM_CANDIDATE_SELECT still selects the interview relation and the value`);
  console.log(`is thrown away in JS at repositories/hire.ts:145. A wasted join per search.`);
  console.log(`NOT fixed in this PR — documented only.`);
  console.log("-".repeat(78));
  console.log(`  with    interview join: ${ms(withInterview).toFixed(3)} ms`);
  console.log(`  without interview join: ${ms(withoutInterview).toFixed(3)} ms`);
  const d = ms(withInterview) - ms(withoutInterview);
  console.log(`  wasted per search     : ${d.toFixed(3)} ms  (${((d / ms(withInterview)) * 100).toFixed(0)}% of this query)`);
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
