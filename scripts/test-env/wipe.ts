/**
 * Plan 195 — empty the test database, keeping the schema.
 *
 * WHY A FULL WIPE AND NOT A TARGETED DELETE. `seedTestUsers` begins by deleting
 * every `@abtalks.dev` user, which is fine on the database it was written for
 * and fails here: the test recruiters own `CreditTransaction` rows whose
 * `recruiterUserId` FK refuses the delete. Working around that by giving the
 * recruiters a different email suffix would take them outside the suffix
 * `db:cleanup:test` uses, so they would then survive every cleanup and drift.
 *
 * Truncating instead makes the bootstrap genuinely idempotent — the same
 * command from any starting state gives the same environment — which is what a
 * test environment is for. `TRUNCATE ... CASCADE` also sidesteps FK ordering
 * entirely, so no table list has to be kept in dependency order as the schema
 * grows.
 *
 * `_prisma_migrations` is preserved. Truncating it would make Prisma believe
 * the database is unmigrated and try to apply 99 migrations over a live schema.
 */
import { prisma } from "../../src/lib/db";
import { isLoopbackDatabase } from "../../src/lib/test-env";

export async function wipe(): Promise<number> {
  // Checked again here rather than trusting the caller: this function
  // truncates every table it finds, and it is the last place that could
  // notice it is pointed somewhere real.
  if (!isLoopbackDatabase()) {
    throw new Error("wipe() refused: DATABASE_URL is not loopback.");
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return 0;

  // One statement, so CASCADE resolves across the whole set at once and no
  // intermediate state violates a constraint. Identifiers come from pg_tables,
  // not from input, and are quoted.
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);

  return tables.length;
}
