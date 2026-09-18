/**
 * Plan 151 Phase 0 — write SkillEvidence for work that already happened.
 *
 * Same derivation as the daily sweep, widened to all history, so a re-run
 * writes nothing new. Run the ActivitySkill seed first or activity passes will
 * map to no skills.
 *
 * Usage:
 *   npx tsx prisma/scripts/backfill-skill-evidence.ts [--batch=500] [--passes=20] [--allow-production]
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const ALLOW_PRODUCTION = process.argv.includes("--allow-production");
const batch = Number(
  process.argv.find((a) => a.startsWith("--batch="))?.split("=")[1] ?? 500,
);
const passes = Number(
  process.argv.find((a) => a.startsWith("--passes="))?.split("=")[1] ?? 20,
);

async function main() {
  if (!ALLOW_PRODUCTION) {
    console.log("Refusing to run without --allow-production.");
    return;
  }
  // Imported lazily: the sweep is `server-only`, so it must load after dotenv.
  const { runSkillEvidenceSweep } = await import("../../src/features/skill/evidence-sweep");

  let total = 0;
  for (let pass = 1; pass <= passes; pass++) {
    const result = await runSkillEvidenceSweep({ allTime: true, batch });
    total += result.emitted;
    console.log(
      `pass ${pass}: ${result.activityEvaluations} evaluations · ${result.credentials} credentials · ${result.assessmentScores} scores · ${result.emitted} evidence rows`,
    );
    const sourceRows =
      result.activityEvaluations + result.credentials + result.assessmentScores;
    if (sourceRows < batch) break;
  }
  console.log(`done · ${total} evidence rows ensured`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
