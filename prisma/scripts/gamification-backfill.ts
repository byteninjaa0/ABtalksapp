/**
 * Plan 151 historical backfill. Same derivers as the daily sweep, window = all,
 * isBackfill = true. Child branch first. Production requires
 * GAMIFICATION_BACKFILL_ALLOW_PRODUCTION=true AND SEED_ALLOW_PRODUCTION=true.
 *
 * Run: npm run db:backfill:gamification
 */

const PRODUCTION_HOST_MARKERS = [
  "ep-nameless-term-ams9a5e3",
  "ep-young-shadow",
];

function assertSafeHost(): void {
  const url = (
    process.env.GAMIFICATION_BACKFILL_DATABASE_URL ??
    process.env.DATABASE_URL ??
    ""
  ).toLowerCase();
  const allow =
    process.env.GAMIFICATION_BACKFILL_ALLOW_PRODUCTION === "true" &&
    process.env.SEED_ALLOW_PRODUCTION === "true";
  for (const marker of PRODUCTION_HOST_MARKERS) {
    if (url.includes(marker) && !allow) {
      throw new Error(
        `Refusing backfill: URL points at production (${marker}). Use a Neon child branch, or set GAMIFICATION_BACKFILL_ALLOW_PRODUCTION and SEED_ALLOW_PRODUCTION.`,
      );
    }
  }
}

async function main() {
  assertSafeHost();
  const { runGamificationSweep } = await import(
    "../../src/features/gamification/sweep/run"
  );
  const result = await runGamificationSweep({
    windowHours: 0,
    isBackfill: true,
  });
  console.log("Backfill summary", result);
}

main().catch((e) => {
  console.error("Gamification backfill failed:", e);
  process.exit(1);
});
