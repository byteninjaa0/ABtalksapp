/**
 * Plan 195 — the one thing standing between a test script and live data.
 *
 * Every entry point under `scripts/test-env/` calls `enterTestEnv()` BEFORE
 * constructing a Prisma client, because these scripts truncate tables and
 * rewrite user rows.
 *
 * The check is "is the host loopback", not "is the host in a deny-list". A
 * deny-list is the wrong shape here: this machine has reached several live Neon
 * hosts from different checkouts, the set changes, and a host nobody remembered
 * to add would pass. An allow-list of loopback addresses cannot fail that way —
 * a Neon URL can never look like `127.0.0.1`.
 *
 * There is deliberately NO override flag. A script that wants to write to a
 * remote database is not a test-environment script.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  LOOPBACK_HOSTS,
  databaseHost,
  isLoopbackDatabase,
} from "../../src/lib/test-env";

export const TEST_ENV_FILE = ".env.test";

/**
 * Load `.env.test` into `process.env`.
 *
 * `override: true` is required, and is the opposite of what the rest of the
 * project does. The other seeds load `.env.local` first, which sets
 * `DATABASE_URL` to a Neon host; dotenv will not replace an already-set
 * variable, so without `override` a test script would silently inherit the live
 * URL. Overriding is what makes the guard below pass, not what makes it
 * necessary — the guard runs either way.
 */
export function loadTestEnv(): void {
  const path = resolve(process.cwd(), TEST_ENV_FILE);
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${TEST_ENV_FILE}. Run \`npm run test:env:setup\` first.`,
    );
  }
  config({ path, override: true });
}

/** Throw unless `DATABASE_URL` points at this machine. Returns the host. */
export function assertTestDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Run this through its npm script, which loads .env.test.",
    );
  }

  if (!isLoopbackDatabase()) {
    throw new Error(
      [
        "",
        "  REFUSING TO RUN — this is not the test database.",
        "",
        `  DATABASE_URL host: ${databaseHost() ?? "(unparseable)"}`,
        `  Expected one of:   ${[...LOOPBACK_HOSTS].join(", ")}`,
        "",
        "  Test-environment scripts only ever write to the local Postgres",
        "  database. A remote host means .env.test was not loaded, or that",
        "  DATABASE_URL is set in the shell and is winning over it.",
        "",
      ].join("\n"),
    );
  }

  // Asked here too, so a mismatch surfaces before a seed is half-applied.
  if (process.env.NODE_ENV === "production") {
    throw new Error("NODE_ENV=production — refusing to run a test-env script.");
  }

  return databaseHost() as string;
}

/** Load `.env.test`, verify it, and say out loud which database is about to be written. */
export function enterTestEnv(label: string): string {
  loadTestEnv();
  const host = assertTestDatabase();
  const db = process.env.DATABASE_URL?.split("/").pop() ?? "?";
  console.log(`\n── ${label} ──`);
  console.log(`   database: ${db} @ ${host}\n`);
  return host;
}
