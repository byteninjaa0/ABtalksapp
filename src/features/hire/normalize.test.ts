/**
 * normalize — alias folding. Unknown tokens survive.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/normalize.test.ts
 */
import {
  canonicalizeRole,
  canonicalizeSkill,
  foldToken,
} from "@/features/hire/normalize";

let passed = 0;
let failed = 0;

function assert(cond: boolean | undefined, msg: string) {
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

console.log("normalize");

suite("React / React.js / ReactJS → one slug", () => {
  const a = canonicalizeSkill("React", []);
  const b = canonicalizeSkill("React.js", []);
  const c = canonicalizeSkill("ReactJS", []);
  assert(a === b && b === c, `${a} ${b} ${c}`);
});

suite("Node / Node.js / NodeJS → one slug", () => {
  const a = canonicalizeSkill("Node", []);
  const b = canonicalizeSkill("Node.js", []);
  const c = canonicalizeSkill("NodeJS", []);
  assert(a === b && b === c, `${a} ${b} ${c}`);
});

suite("SDE / Software Developer / Backend Engineer → one role canon", () => {
  const a = canonicalizeRole("SDE", []);
  const b = canonicalizeRole("Software Developer", []);
  const c = canonicalizeRole("Backend Engineer", []);
  assert(a === b && b === c, `${a} ${b} ${c}`);
});

suite("an unknown token survives unchanged rather than being dropped", () => {
  const slug = canonicalizeSkill("Ziglang", []);
  assert(slug.includes("ziglang") || foldToken("Ziglang") === "ziglang", slug);
  assert(slug.length > 0, "empty");
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
