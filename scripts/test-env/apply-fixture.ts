/**
 * Plan 195 — apply a named scenario.
 *
 *   npm run test:env:fixture -- --list
 *   npm run test:env:fixture -- candidate-day --key=karan --day=45
 *   npm run test:env:fixture -- recruiter-empty-desk
 *   npm run test:env:fixture -- candidate-day --key=meera --day=60 recruiter-pipeline
 *
 * Several fixtures in one command are applied in the order given. Each is
 * narrow and idempotent (see `fixtures.ts`), so combining them is safe and the
 * order only matters when two touch the same identity.
 */
import { enterTestEnv } from "./guard";

enterTestEnv("Applying fixtures");

type Parsed = {
  names: string[];
  params: { key?: string; day?: number; dollars?: number };
  list: boolean;
};

function parseArgs(argv: string[]): Parsed {
  const names: string[] = [];
  const params: Parsed["params"] = {};
  let list = false;

  for (const arg of argv) {
    if (arg === "--list" || arg === "-l") {
      list = true;
      continue;
    }
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) {
      const [, name, raw] = match;
      if (name === "key") params.key = raw;
      else if (name === "day") params.day = Number.parseInt(raw, 10);
      else if (name === "dollars") params.dollars = Number.parseInt(raw, 10);
      else throw new Error(`Unknown option --${name}`);
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option ${arg}`);
    names.push(arg);
  }

  return { names, params, list };
}

async function main() {
  const { names, params, list } = parseArgs(process.argv.slice(2));

  // Imported after `enterTestEnv()`: it reaches `src/lib/db`, whose
  // PrismaClient binds to DATABASE_URL at module load.
  const { FIXTURES, findFixture } = await import("./fixtures");

  if (list || names.length === 0) {
    const width = Math.max(...FIXTURES.map((f) => f.name.length));
    console.log("Fixtures\n");
    for (const fixture of FIXTURES) {
      console.log(`   ${fixture.name.padEnd(width)}  ${fixture.describe}`);
      if (fixture.params) {
        console.log(`   ${" ".repeat(width)}  ${fixture.params}`);
      }
    }
    console.log(
      "\n   npm run test:env:fixture -- <name> [--key=…] [--day=…] [--dollars=…]",
    );
    console.log("   npm run test:env:reset        back to the baseline\n");
    return;
  }

  for (const name of names) {
    const fixture = findFixture(name);
    if (!fixture) {
      throw new Error(
        `Unknown fixture "${name}". Run with --list to see them all.`,
      );
    }
    const result = await fixture.apply(params);
    console.log(`   ✓ ${name} — ${result}`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      `\n✗ ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
