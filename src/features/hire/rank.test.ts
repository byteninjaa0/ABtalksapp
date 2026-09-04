/**
 * rank — ordering invariants; never-empty; match ≠ confidence.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/rank.test.ts
 */
import { emptySearchSpec, emptyValue } from "@/features/hire/reduce-spec";
import { rankCandidates107 } from "@/features/hire/rank";
import type { Criterion } from "@/lib/validations/hire";
import type { ScoreableMember } from "@/features/hire/types";

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

function member(
  id: string,
  p: Partial<ScoreableMember> = {},
): ScoreableMember {
  return {
    id,
    userId: id,
    fullName: id,
    jobRole: "",
    company: "",
    yearsExperience: 0,
    yearsExperienceKnown: false,
    skills: ["python"],
    missionPoints: 40,
    missionsPassed: 8,
    missionsAttempted: 10,
    cleanPassCount: 6,
    totalScore: 40,
    commitDayCount: 8,
    projectScores: [],
    interview: null,
    cohortPublished: true,
    status: "ENROLLED",
    availability: null,
    cohortDay: 20,
    ...p,
  };
}

function experience(min: number, absolute: boolean): Criterion {
  return {
    id: "experience:years",
    kind: "experience",
    label: `${min}+ years`,
    weight: "must",
    absolute,
    value: emptyValue({ min }),
  };
}

console.log("rank");

suite("a 9.5-year near-miss outranks a fully-unknown candidate", () => {
  const spec = emptySearchSpec();
  spec.criteria = [experience(10, false)];
  const near = member("near", {
    yearsExperience: 9.5,
    yearsExperienceKnown: true,
  });
  const unknown = member("unknown", {
    yearsExperience: 0,
    yearsExperienceKnown: false,
  });
  const { primary } = rankCandidates107([unknown, near], spec);
  assert(primary[0]!.fullName === "near", primary.map((p) => p.fullName).join(","));
});

suite("a fully-unknown candidate sits near the pool median, not top or bottom", () => {
  const spec = emptySearchSpec();
  spec.criteria = [experience(10, false)];
  const pool = [
    member("high", { yearsExperience: 12, yearsExperienceKnown: true }),
    member("mid", { yearsExperience: 8, yearsExperienceKnown: true }),
    member("low", { yearsExperience: 1, yearsExperienceKnown: true }),
    member("unknown", { yearsExperience: 0, yearsExperienceKnown: false }),
  ];
  const { primary } = rankCandidates107(pool, spec);
  const idx = primary.findIndex((p) => p.fullName === "unknown");
  assert(idx > 0 && idx < primary.length - 1, `idx=${idx}`);
});

suite("match and confidence move independently", () => {
  const spec = emptySearchSpec();
  spec.criteria = [
    experience(10, false),
    {
      id: "skill:python",
      kind: "skill",
      label: "python",
      weight: "must",
      absolute: false,
      value: emptyValue({ token: "python" }),
    },
  ];
  const knownSkillUnknownYears = member("a", {
    skills: ["python"],
    yearsExperienceKnown: false,
  });
  const { primary } = rankCandidates107([knownSkillUnknownYears], spec);
  const card = primary[0]!;
  assert(card.confidence > 0 && card.confidence < 1, `conf=${card.confidence}`);
  assert(card.match !== card.confidence * 100, "not collapsed");
});

suite("the primary list is never empty while the pool is non-empty", () => {
  const spec = emptySearchSpec();
  spec.criteria = [experience(10, true)];
  const pool = [
    member("u1", { yearsExperienceKnown: false }),
    member("u2", { yearsExperienceKnown: false }),
  ];
  const { primary } = rankCandidates107(pool, spec);
  assert(primary.length > 0, "primary empty");
});

suite("a level-2 NOT_MET lands in excluded with a reason", () => {
  const spec = emptySearchSpec();
  spec.criteria = [experience(10, true)];
  const pool = [
    member("ok", { yearsExperience: 12, yearsExperienceKnown: true }),
    member("no", { yearsExperience: 1, yearsExperienceKnown: true }),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);
  assert(primary.some((p) => p.fullName === "ok"), "keeper in primary");
  assert(excluded.some((p) => p.fullName === "no"), "contradiction excluded");
  assert(Boolean(excluded[0]!.excludedReason), "reason named");
});

suite("a level-2 UNCLEAR never lands in excluded", () => {
  const spec = emptySearchSpec();
  spec.criteria = [experience(10, true)];
  const pool = [
    member("ok", { yearsExperience: 12, yearsExperienceKnown: true }),
    member("gap", { yearsExperience: 0, yearsExperienceKnown: false }),
  ];
  const { excluded } = rankCandidates107(pool, spec);
  assert(
    !excluded.some((p) => p.fullName === "gap"),
    "UNCLEAR was excluded",
  );
});

function avail(
  p: Partial<NonNullable<ScoreableMember["availability"]>> = {},
): ScoreableMember["availability"] {
  return {
    openToWork: true,
    expectedSalaryMin: null,
    expectedSalaryMax: null,
    salaryCurrency: "INR",
    noticePeriodDays: null,
    preferredWorkMode: null,
    preferredCities: [],
    openToRelocate: false,
    ...p,
  };
}

function inCity(city: string, absolute: boolean): Criterion {
  return {
    id: "location:city",
    kind: "location",
    label: city,
    weight: "must",
    absolute,
    value: emptyValue({ city }),
  };
}

suite("a strict city filter never returns a known mismatch as an exact match", () => {
  // The bug this pins: the old never-empty fallback moved every excluded
  // candidate into `primary` and then cleared `excluded`, so "Pune only"
  // returned Bengaluru-only candidates as matches with no near-miss list.
  const spec = emptySearchSpec();
  spec.criteria = [inCity("Pune", true)];
  const pool = [
    member("bengaluru", {
      availability: avail({ preferredCities: ["Bengaluru"] }),
    }),
    member("chennai", {
      availability: avail({ preferredCities: ["Chennai"] }),
    }),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);
  assert(primary.length === 0, `primary should be empty, got ${primary.length}`);
  assert(excluded.length === 2, `excluded should hold both, got ${excluded.length}`);
  assert(
    excluded.every((e) => Boolean(e.excludedReason)),
    "every excluded candidate carries a reason",
  );
});

suite("a strict city filter keeps unknowns in primary, not excluded", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inCity("Pune", true)];
  const pool = [
    member("no-availability", { availability: null }),
    member("no-city", { availability: avail() }),
    member("withdrawn", {
      availability: avail({ openToWork: false, preferredCities: ["Bengaluru"] }),
    }),
    member("mismatch", {
      availability: avail({ preferredCities: ["Bengaluru"] }),
    }),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);
  assert(
    excluded.length === 1 && excluded[0]!.fullName === "mismatch",
    "only the provable contradiction is excluded",
  );
  assert(primary.length === 3, `three unknowns stay primary, got ${primary.length}`);
  // A withdrawn row must not be readable as a contradiction either.
  assert(
    primary.some((p) => p.fullName === "withdrawn"),
    "openToWork:false is an unknown, never an exclusion",
  );
});

suite("a named city outranks a relocator, and neither is excluded", () => {
  // NOTE: this deliberately does NOT assert that a relocator outranks a
  // fully-unknown candidate. `sortKey` shrinks an unconfident match toward the
  // pool median, and on a pool where every KNOWN candidate scores high the
  // median is high, so an unknown can sort above a partial match. That is the
  // documented shrinkage behaving as specified (plan 107 §4f), and the constant
  // is reserved for benchmark calibration — not something to quietly retune
  // inside a privacy fix. Flagged for a product decision instead.
  const spec = emptySearchSpec();
  spec.criteria = [inCity("Pune", true)];
  const pool = [
    member("unknown", { availability: null }),
    member("relocator", {
      availability: avail({ preferredCities: ["Chennai"], openToRelocate: true }),
    }),
    member("named", { availability: avail({ preferredCities: ["Pune"] }) }),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);
  const order = primary.map((p) => p.fullName);
  assert(order[0] === "named", `named first, got ${order.join(" > ")}`);
  assert(excluded.length === 0, "no provable contradiction here");
  assert(primary.length === 3, "everyone stays");
});

suite("a non-absolute city criterion excludes nobody", () => {
  const spec = emptySearchSpec();
  spec.criteria = [inCity("Pune", false)];
  const pool = [
    member("bengaluru", {
      availability: avail({ preferredCities: ["Bengaluru"] }),
    }),
  ];
  const { primary, excluded } = rankCandidates107(pool, spec);
  assert(excluded.length === 0, "ranking criteria never exclude");
  assert(primary.length === 1, "and everyone stays");
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
