/**
 * Plan 195 — back to the baseline.
 *
 * Re-runs the bootstrap, which already begins by truncating every table. So
 * this is a thin alias rather than a second implementation: there is exactly
 * one definition of "the baseline environment", and it is `bootstrap.ts`.
 *
 * Kept as its own command because "reset" is what anyone reaches for after a
 * test has made a mess, and discovering that the thing to run is called
 * "bootstrap" is friction.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["tsx", "scripts/test-env/bootstrap.ts"],
  { env: { ...process.env }, stdio: "inherit" },
);

process.exit(result.status ?? 1);
