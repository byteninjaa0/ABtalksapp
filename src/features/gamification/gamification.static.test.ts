/**
 * Plan 151 — architectural static scans.
 * Run: npm run test:gamification:static
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}

function suite(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nPlan 151 — gamification static\n");

suite("features/gamification never imports the points write path", () => {
  const files = walk(join(process.cwd(), "src/features/gamification"));
  for (const f of files) {
    if (f.includes(".test.")) continue;
    const src = readFileSync(f, "utf8");
    assert(!src.includes("applyPointsChange"), `${f} imports applyPointsChange`);
    assert(
      !src.includes('from "@/repositories/points"'),
      `${f} imports repositories/points`,
    );
    assert(!src.includes("synergyPoints"), `${f} touches synergyPoints`);
  }
});

suite("recordGamificationEvent call sites sit inside after( or the recorder", () => {
  const files = walk(join(process.cwd(), "src"));
  for (const f of files) {
    if (f.endsWith("record-event.ts")) continue;
    if (f.includes(".test.")) continue;
    const src = readFileSync(f, "utf8");
    if (!src.includes("recordGamificationEvent(")) continue;
    const idx = src.indexOf("recordGamificationEvent(");
    const window = src.slice(Math.max(0, idx - 200), idx);
    assert(
      window.includes("after("),
      `${f} calls recordGamificationEvent outside after()`,
    );
  }
});

suite("scheduleGamificationEvent wraps after(", () => {
  const src = source("src/features/gamification/record-event.ts");
  assert(src.includes("export function scheduleGamificationEvent"));
  const fn = src.slice(src.indexOf("export function scheduleGamificationEvent"));
  assert(fn.includes("after("), "schedule helper uses after(");
  assert(fn.includes("recordGamificationEvent("), "schedule helper records");
});

suite("features/hire never imports gamification XP/level", () => {
  const files = walk(join(process.cwd(), "src/features/hire"));
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert(
      !src.includes("@/features/gamification"),
      `${f} imports gamification`,
    );
  }
});

suite("event-types.ts stays free of server-only, prisma, and @/lib", () => {
  const src = source("src/features/gamification/event-types.ts");
  assert(!/^import\s+["']server-only["']/m.test(src), "no server-only");
  assert(!src.includes("@prisma/client"), "no prisma");
  assert(!/from\s+["']@\/lib\//.test(src), "no @/lib");
});

suite("no client-callable emit action exists", () => {
  const src = source("src/app/actions/gamification-actions.ts");
  assert(!src.includes("recordGamificationEvent"), "candidate action cannot emit");
  assert(!src.includes("scheduleGamificationEvent"), "candidate action cannot emit");
  const admin = source("src/app/actions/admin-gamification-actions.ts");
  assert(!admin.includes("recordGamificationEvent("), "admin cannot emit events");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
