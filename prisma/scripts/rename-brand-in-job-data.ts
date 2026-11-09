/**
 * One-off: replace the former brand name in STORED job data.
 *
 *   npx tsx prisma/scripts/rename-brand-in-job-data.ts                      # dry run
 *   npx tsx prisma/scripts/rename-brand-in-job-data.ts --content            # dry run, job data + seeded display content
 *   npx tsx prisma/scripts/rename-brand-in-job-data.ts --scan               # dry run + count the brand in every text column
 *   npx tsx prisma/scripts/rename-brand-in-job-data.ts --apply --expect-host=<substring> [--content]
 *
 * WHY THIS EXISTS
 * `Job.company` is free text, written once when a job is created. The admin job
 * form takes whatever an admin types, and the recruiter flow copies
 * `RecruiterProfile.company` onto the job at posting time. No code hard-codes the
 * old brand, so jobs the platform posted for itself still read "ABTalks" in the
 * database even though every source file now says Klymb AI. Re-seeding does not
 * touch them. This script is the repair.
 *
 * SAFETY
 *  - Dry run by default, inside a READ ONLY transaction: even a bug here cannot
 *    write in that mode.
 *  - `--apply` REQUIRES `--expect-host=<substring>` and aborts unless the live
 *    DATABASE_URL host contains it. This repository has more than one
 *    production-volume Neon host, and a shell-provided DATABASE_URL overrides
 *    `.env.local`, so naming the intended host is the only guard that works.
 *  - Allowlisted columns only (below). Emails, handles and URLs are never
 *    rewritten: the pattern skips a match that is part of an address, a path, a
 *    hostname or a hashtag.
 *  - Every change runs in ONE transaction, so it applies completely or not at all.
 *  - It is idempotent: a second run finds nothing to change.
 *  - Not automatically reversible. Before changing anything it prints each
 *    distinct company value with its replacement; keep that output.
 *
 * `--scan` is READ ONLY and prints COUNTS only (never values) of rows still
 * containing the brand in every other text column. It reads every text column in
 * the public schema, so run it off-peak on a large database. JSON columns are not
 * scanned.
 *
 * This file necessarily spells out the old brand name. Delete it once the data is
 * clean.
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REPLACEMENT = "Klymb AI";

/**
 * PostgreSQL ARE, matched with `~*` / `regexp_replace(..., 'gi')`.
 * Matches "ABTalks", "AB Talks" and "ABTalksOnAI" as a standalone brand word and
 * NOT when it is part of an address (`@abtalks.dev`), a path or hostname
 * (`/abtalks`, `abtalks.in`, `abtalks-resumes`) or a hashtag (`#ABTalks`).
 */
const BRAND = String.raw`(?<![@#/.[:alnum:]_-])AB ?Talks(?:OnAI)?(?![[:alnum:]_])(?!\.[[:alpha:]]|-)`;

/**
 * Merch copy that says the product carries "the ABTalks logo". The product photos
 * still show that logo, so rewriting the phrase to "the Klymb AI logo" would state
 * something untrue; it is removed instead (matching prisma/content/marketplace.json).
 */
const LOGO_CLAIM = String.raw`\s+(?:featuring|embroidered with) the (?:iconic|official) AB ?Talks logo`;

type Target = {
  table: string;
  column: string;
  /** Company names are not personal data, so the old → new pairs are printed. */
  showValues: boolean;
  /** Remove a "featuring the … logo" claim before renaming (see LOGO_CLAIM). */
  stripLogoClaim?: boolean;
};

/** SQL for the rewritten value; pairs with `rewriteParams` ($1 brand, $2 name, $3 claim). */
function rewritten(t: Target): string {
  const col = q(t.column);
  const base = t.stripLogoClaim ? `regexp_replace(${col}, $3, '', 'gi')` : col;
  return `regexp_replace(${base}, $1, $2, 'gi')`;
}

function rewriteParams(t: Target): string[] {
  return t.stripLogoClaim ? [BRAND, REPLACEMENT, LOGO_CLAIM] : [BRAND, REPLACEMENT];
}

/** The default write surface: job data only. */
const JOB_TARGETS: readonly Target[] = [
  { table: "Job", column: "company", showValues: true },
  { table: "Job", column: "title", showValues: false },
  { table: "Job", column: "description", showValues: false },
  { table: "RecruiterProfile", column: "company", showValues: true },
];

/**
 * Opt-in with `--content`. Display text that the seed scripts wrote into the
 * database: editing `prisma/content/*` changes nothing users see until the rows
 * themselves change. Found by `--scan` on a seeded database. Only user-facing
 * prose columns; JSON columns (e.g. prompt templates inside a Json field) are not
 * reachable by this script.
 */
const CONTENT_TARGETS: readonly Target[] = [
  { table: "DailyTask", column: "linkedinTemplate", showValues: false },
  { table: "DailyTask", column: "problemStatement", showValues: false },
  { table: "DailyTask", column: "solutionApproach", showValues: false },
  { table: "HackathonProblem", column: "title", showValues: true },
  { table: "HackathonProblem", column: "statement", showValues: false },
  { table: "MarketplaceItem", column: "title", showValues: true },
  { table: "MarketplaceItem", column: "description", showValues: true, stripLogoClaim: true },
];

/** Host only — never the credentials. */
function targetHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host;
  } catch {
    return "(DATABASE_URL unparseable)";
  }
}

function flag(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

/** Quote an identifier taken from the constants above (never from input). */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function columnExists(tx: Tx, t: Target): Promise<boolean> {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    t.table,
    t.column,
  );
  return (rows[0]?.n ?? 0) > 0;
}

async function countMatches(tx: Tx, t: Target): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM ${q(t.table)} WHERE ${q(t.column)} ~* $1`,
    BRAND,
  );
  return rows[0]?.n ?? 0;
}

async function showValues(tx: Tx, t: Target): Promise<void> {
  const rows = await tx.$queryRawUnsafe<{ before: string; after: string; n: number }[]>(
    `SELECT ${q(t.column)} AS before,
            ${rewritten(t)} AS after,
            COUNT(*)::int AS n
       FROM ${q(t.table)}
      WHERE ${q(t.column)} ~* $1
      GROUP BY 1, 2
      ORDER BY n DESC
      LIMIT 50`,
    ...rewriteParams(t),
  );
  for (const r of rows) {
    console.log(`      ${String(r.n).padStart(5)} × "${r.before}"  →  "${r.after}"`);
  }
}

async function scanAllTextColumns(tx: Tx, targets: readonly Target[]): Promise<void> {
  const cols = await tx.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('text', 'character varying')
        AND table_name NOT LIKE '\\_prisma%'
      ORDER BY table_name, column_name`,
  );
  const touched = new Set(targets.map((t) => `${t.table}.${t.column}`));
  console.log(`\n  SCAN — ${cols.length} text columns (counts only, nothing is changed)`);
  let found = 0;
  for (const c of cols) {
    const rows = await tx.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM ${q(c.table_name)} WHERE ${q(c.column_name)} ~* $1`,
      BRAND,
    );
    const n = rows[0]?.n ?? 0;
    if (n === 0) continue;
    found += 1;
    const key = `${c.table_name}.${c.column_name}`;
    console.log(
      `    ${String(n).padStart(6)}  ${key}${touched.has(key) ? "   (handled by this script)" : "   (NOT touched)"}`,
    );
  }
  if (found === 0) console.log("    no remaining matches");
}

async function main() {
  config({ path: ".env.local" });
  config();

  const apply = process.argv.includes("--apply");
  const scan = process.argv.includes("--scan");
  const content = process.argv.includes("--content");
  const TARGETS: readonly Target[] = content ? [...JOB_TARGETS, ...CONTENT_TARGETS] : JOB_TARGETS;
  const expectHost = flag("expect-host");
  const host = targetHost();

  console.log(`\n  TARGET DATABASE: ${host}`);

  if (apply) {
    if (!expectHost) {
      console.error(
        "\n  REFUSING TO WRITE: --apply requires --expect-host=<substring>.\n" +
          `  The live DATABASE_URL points at ${host}.\n` +
          "  Re-run naming the database you intend, e.g.\n" +
          "    npx tsx prisma/scripts/rename-brand-in-job-data.ts --apply --expect-host=nameless\n",
      );
      await prisma.$disconnect();
      process.exit(1);
    }
    if (!host.includes(expectHost)) {
      console.error(
        `\n  REFUSING TO WRITE: expected a host containing "${expectHost}",\n` +
          `  but DATABASE_URL points at ${host}. Nothing was written.\n`,
      );
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  console.log(`\n  Replacing the former brand with "${REPLACEMENT}" in ${content ? "job data and seeded display content" : "job data"}`);

  const summary = await prisma.$transaction(
    async (tx) => {
      // The pooler rejects startup options, but a per-transaction statement works.
      if (!apply) await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");

      const lines: string[] = [];
      for (const t of TARGETS) {
        const key = `${t.table}.${t.column}`;
        if (!(await columnExists(tx, t))) {
          console.log(`\n    ${key}: column not found — skipped`);
          continue;
        }
        const n = await countMatches(tx, t);
        console.log(`\n    ${key}: ${n} row(s) contain the old brand`);
        if (n === 0) continue;
        if (t.showValues) await showValues(tx, t);

        if (apply) {
          const changed = await tx.$executeRawUnsafe(
            `UPDATE ${q(t.table)}
                SET ${q(t.column)} = ${rewritten(t)}
              WHERE ${q(t.column)} ~* $1`,
            ...rewriteParams(t),
          );
          lines.push(`${key}: ${changed} row(s) updated`);
        } else {
          lines.push(`${key}: ${n} row(s) would be updated`);
        }
      }

      if (scan) await scanAllTextColumns(tx, TARGETS);
      return lines;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  console.log("\n  RESULT");
  for (const l of summary) console.log(`    ${l}`);
  if (summary.length === 0) console.log("    nothing to change");

  if (!apply) {
    console.log(
      "\n  DRY RUN — nothing written. Re-run with `--apply --expect-host=<substring>` to write.\n",
    );
  } else {
    console.log("\n  Applied in a single transaction. Re-run without --apply to confirm 0 remain.\n");
  }
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error("\n  FAILED — the transaction rolled back, nothing was written.\n", err);
  await prisma.$disconnect();
  process.exit(1);
});
