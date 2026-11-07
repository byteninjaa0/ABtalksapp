/**
 * Plan 172 — a skill the recruiter searched for must survive the card's cut.
 *
 * The bug this pins: the desk result card draws eight chips from a list that is
 * routinely fifteen or twenty long, in the order the candidate typed their
 * stack. A recruiter searching "snowflake" got cards whose chips never said
 * Snowflake — it was sitting at position nine behind "+7".
 *
 * Also pins the word-boundary rule, which one of the three copies of this logic
 * had already lost: "java" must not light up "JavaScript".
 *
 * Run: npm run test:skill-highlight
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  orderedSkills,
  skillHighlighted,
} from "@/features/hire/skill-highlight";
import {
  candidateSummaryLine,
  summaryInputFromMatch,
} from "@/features/hire/candidate-summary";

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

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** The real list from the reported candidate, in its stored order. */
const SUSHMITA = [
  "Python",
  "azure",
  "sql",
  "MySQL",
  "Power automate",
  "Power BI",
  "PowerBi",
  "AWS",
  "powerautomate",
  "Gcp",
  "PowerApps",
  "Snowflake",
  "Databricks",
  "data analytics",
  "Data Engineering",
  "DAX",
];

console.log("\nPlan 172 — searched skills survive the card's cut");

// =========================================================================
// 1. The reported bug
// =========================================================================

suite("a searched skill past the eighth chip still reaches the card", () => {
  const raw = SUSHMITA.slice(0, 8);
  assert(
    !raw.includes("Snowflake"),
    "precondition: Snowflake must be past the cut in stored order",
  );
  const shown = orderedSkills(SUSHMITA, ["snowflake"]).slice(0, 8);
  assert(shown.includes("Snowflake"), `Snowflake missing from ${shown.join(", ")}`);
  assert(shown[0] === "Snowflake", `Snowflake must lead, got ${shown[0]}`);
});

suite("every searched skill is hoisted, not just the first", () => {
  const shown = orderedSkills(SUSHMITA, ["snowflake", "dax"]).slice(0, 8);
  assert(shown.includes("Snowflake"), "Snowflake missing");
  assert(shown.includes("DAX"), "DAX missing");
});

suite("case and spacing in the recruiter's phrase do not matter", () => {
  assert(skillHighlighted("Power BI", ["  POWER BI "]), "Power BI should match");
  assert(skillHighlighted("Snowflake", ["snowflake"]), "Snowflake should match");
});

// =========================================================================
// 2. The word-boundary rule
// =========================================================================

suite('"java" does not light up "JavaScript"', () => {
  assert(skillHighlighted("Java", ["java"]), "Java is a hit");
  assert(!skillHighlighted("JavaScript", ["java"]), "JavaScript is not a java hit");
});

suite("a needle inside a longer phrase still matches on word boundaries", () => {
  assert(skillHighlighted("Power BI (DAX)", ["dax"]), "DAX inside parens is a hit");
  assert(!skillHighlighted("Databricks", ["data"]), "data must not match Databricks");
});

suite("an empty or blank needle matches nothing", () => {
  assert(!skillHighlighted("Python", []), "no needles, no hit");
  assert(!skillHighlighted("Python", ["   "]), "a blank needle is not a hit");
});

// =========================================================================
// 3. Ordering is stable — this never reshuffles an unsearched list
// =========================================================================

suite("no needles returns the list exactly as stored", () => {
  const out = orderedSkills(SUSHMITA, []);
  assert(out.join("|") === SUSHMITA.join("|"), "order changed with no needles");
});

suite("a needle nothing matches returns the list exactly as stored", () => {
  const out = orderedSkills(SUSHMITA, ["cobol"]);
  assert(out.join("|") === SUSHMITA.join("|"), "order changed on a miss");
});

suite("within each group the candidate's own order is preserved", () => {
  const out = orderedSkills(SUSHMITA, ["snowflake", "python"]);
  assert(out[0] === "Python", `hits keep stored order, got ${out[0]}`);
  assert(out[1] === "Snowflake", `hits keep stored order, got ${out[1]}`);
  assert(out[2] === "azure", `misses keep stored order, got ${out[2]}`);
});

suite("nothing is dropped and nothing is duplicated", () => {
  const out = orderedSkills(SUSHMITA, ["snowflake", "dax", "sql"]);
  assert(out.length === SUSHMITA.length, `length ${out.length}`);
  assert(new Set(out).size === out.length, "a skill appears twice");
  for (const s of SUSHMITA) assert(out.includes(s), `${s} was dropped`);
});

// =========================================================================
// 4. The AI summary names a skill the recruiter asked about
// =========================================================================

suite("the card summary names the searched skill, not the first three stored", () => {
  const base = {
    displayName: "Sushmita Roy",
    jobRole: "Data Analyst",
    evidence: { skills: SUSHMITA, yearsExperience: 4 },
  };
  const before = candidateSummaryLine(summaryInputFromMatch(base));
  assert(
    !/snowflake/i.test(before),
    "precondition: an unsearched summary does not reach Snowflake",
  );
  const after = candidateSummaryLine(
    summaryInputFromMatch({ ...base, highlightSkills: ["snowflake"] }),
  );
  assert(/snowflake/i.test(after), `summary missing Snowflake: ${after}`);
});

suite("with no search the summary wording is unchanged", () => {
  const input = {
    displayName: "Sushmita Roy",
    jobRole: "Data Analyst",
    evidence: { skills: SUSHMITA, yearsExperience: 4 },
  };
  const plain = candidateSummaryLine(summaryInputFromMatch(input));
  const empty = candidateSummaryLine(
    summaryInputFromMatch({ ...input, highlightSkills: [] }),
  );
  assert(plain === empty, `wording drifted:\n  ${plain}\n  ${empty}`);
});

// =========================================================================
// 5. The surfaces are actually wired to it
// =========================================================================

suite("the desk card orders before it slices", () => {
  const src = source("src/components/hire/desk-match-card.tsx");
  assert(src.includes("orderedSkills(e.skills"), "desk card does not order its skills");
  const order = src.indexOf("orderedSkills(e.skills");
  const slice = src.indexOf("skills.slice(0, CARD_SKILLS)");
  assert(slice > order, "the slice must come after the ordering");
});

suite("one implementation, not four — no surface keeps its own copy", () => {
  for (const rel of [
    "src/components/hire/match-card.tsx",
    "src/components/hire/hire-card-facts.tsx",
    "src/components/hire/candidate-inspector.tsx",
    "src/components/hire/desk-match-card.tsx",
  ]) {
    const src = source(rel);
    assert(
      src.includes('from "@/features/hire/skill-highlight"'),
      `${rel} does not import the shared helper`,
    );
    assert(
      !src.includes("function skillHighlighted"),
      `${rel} has grown its own copy of skillHighlighted`,
    );
  }
});

suite("the hit chip styles exist in both themes", () => {
  const css = source("src/app/hire/hire-scout.css");
  for (const cls of [".desk-chip--hit", ".hire-profile__chip--hit"]) {
    assert(css.includes(cls), `${cls} is missing from hire-scout.css`);
    assert(
      css.includes(`html.dark:not(:has(.theme-klymb-light)) ${cls}`),
      `${cls} has no dark-mode rule`,
    );
  }
});

// =========================================================================
// Summary
// =========================================================================

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
