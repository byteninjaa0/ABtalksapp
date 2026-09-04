/**
 * criteria — every kind × {satisfies, contradicts, absent}; fit curves.
 *   NODE_OPTIONS=--conditions=react-server tsx src/features/hire/criteria.test.ts
 */
import { emptyValue } from "@/features/hire/reduce-spec";
import { evaluateCriterion } from "@/features/hire/criteria";
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

function base(p: Partial<ScoreableMember> = {}): ScoreableMember {
  return {
    id: "m1",
    userId: "u1",
    fullName: "Pat",
    jobRole: "",
    company: "",
    yearsExperience: 0,
    yearsExperienceKnown: false,
    skills: [],
    missionPoints: 0,
    missionsPassed: 8,
    missionsAttempted: 10,
    cleanPassCount: 6,
    totalScore: 0,
    commitDayCount: 8,
    projectScores: [],
    interview: null,
    cohortPublished: true,
    status: "ENROLLED",
    availability: null,
    cohortDay: 14,
    ...p,
  };
}

function c(
  kind: Criterion["kind"],
  label: string,
  value: Parameters<typeof emptyValue>[0],
  extra?: Partial<Criterion>,
): Criterion {
  return {
    id: `${kind}:1`,
    kind,
    label,
    weight: "must",
    absolute: false,
    value: emptyValue(value),
    ...extra,
  };
}

console.log("criteria");

suite("skill MET / NOT_MET / UNCLEAR", () => {
  const crit = c("skill", "react", { token: "react" });
  assert(
    evaluateCriterion(crit, base({ skills: ["React.js"] })).verdict === "MET",
    "met",
  );
  assert(
    evaluateCriterion(crit, base({ skills: ["python", "sql"] })).verdict ===
      "NOT_MET",
    "not met when list is non-empty",
  );
  assert(
    evaluateCriterion(crit, base({ skills: [] })).verdict === "UNCLEAR",
    "unclear when none recorded",
  );
});

suite("blank role → UNCLEAR", () => {
  const v = evaluateCriterion(
    c("role", "Backend engineer", { title: "Backend engineer" }),
    base({ jobRole: "" }),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
});

suite("B.Tech Student vs management → UNCLEAR", () => {
  const v = evaluateCriterion(
    c("role", "manager", { title: "manager" }),
    base({ jobRole: "B.Tech Student" }),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
});

suite("Data Analyst vs Backend engineer → NOT_MET", () => {
  const v = evaluateCriterion(
    c("role", "Backend engineer", { title: "Backend engineer" }),
    base({ jobRole: "Data Analyst" }),
  );
  assert(v.verdict === "NOT_MET", v.verdict);
});

suite("yearsExperienceKnown: false vs 10+ → UNCLEAR", () => {
  const v = evaluateCriterion(
    c("experience", "10 years", { min: 10 }),
    base({ yearsExperience: 0, yearsExperienceKnown: false }),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
  assert(v.fit === null, "no fit");
});

suite("fit curves: 9.5 vs 10 ≈ 0.95; 1 vs 10 ≈ 0.1; both NOT_MET", () => {
  const crit = c("experience", "10 years", { min: 10 });
  const near = evaluateCriterion(
    crit,
    base({ yearsExperience: 9.5, yearsExperienceKnown: true }),
  );
  const far = evaluateCriterion(
    crit,
    base({ yearsExperience: 1, yearsExperienceKnown: true }),
  );
  assert(near.verdict === "NOT_MET", "near verdict");
  assert(far.verdict === "NOT_MET", "far verdict");
  assert(Math.abs((near.fit ?? 0) - 0.95) < 0.02, `near fit ${near.fit}`);
  assert(Math.abs((far.fit ?? 0) - 0.1) < 0.02, `far fit ${far.fit}`);
});

suite("junior 2 years vs a VP requirement → NOT_MET, not UNCLEAR", () => {
  const v = evaluateCriterion(
    c("seniority", "VP-level", { level: "VP" }),
    base({
      jobRole: "junior engineer",
      yearsExperience: 2,
      yearsExperienceKnown: true,
    }),
  );
  assert(v.verdict === "NOT_MET", v.verdict);
});

suite("null availability vs REMOTE → UNCLEAR", () => {
  const v = evaluateCriterion(
    c("availability", "remote", { workMode: "REMOTE" }),
    base({ availability: null }),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
});

suite("preferredWorkMode ONSITE vs REMOTE → NOT_MET", () => {
  const v = evaluateCriterion(
    c("availability", "remote", { workMode: "REMOTE" }),
    base({
      availability: {
        openToWork: true,
        expectedSalaryMin: null,
        expectedSalaryMax: null,
        salaryCurrency: "INR",
        noticePeriodDays: null,
        preferredWorkMode: "ONSITE",
        preferredCities: [],
        openToRelocate: false,
      },
    }),
  );
  assert(v.verdict === "NOT_MET", v.verdict);
});

suite("education absent is UNCLEAR", () => {
  const v = evaluateCriterion(
    c("education", "B.Tech", { level: "B.Tech" }),
    base(),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
});

suite("other is always UNCLEAR", () => {
  const v = evaluateCriterion(
    c("other", "plays cricket", { text: "plays cricket" }),
    base({ skills: ["python"] }),
  );
  assert(v.verdict === "UNCLEAR", v.verdict);
});

/** A full opted-in availability row. `openToWork` defaults to true. */
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

const inPune = c("location", "Pune", { city: "Pune" });

suite("location: a named preferred city is MET", () => {
  const v = evaluateCriterion(
    inPune,
    base({ availability: avail({ preferredCities: ["Pune"] }) }),
  );
  assert(v.verdict === "MET", v.verdict);
  assert(v.fit === 1, `fit ${v.fit}`);
});

suite("location: city synonyms resolve — Delhi/New Delhi/NCR", () => {
  const wantDelhi = c("location", "Delhi", { city: "Delhi" });
  for (const stated of ["Delhi", "New Delhi", "NCR"]) {
    const v = evaluateCriterion(
      wantDelhi,
      base({ availability: avail({ preferredCities: [stated] }) }),
    );
    assert(v.verdict === "MET", `${stated} → ${v.verdict}`);
  }
  // And the other direction: the recruiter says NCR, the candidate says Delhi.
  const v = evaluateCriterion(
    c("location", "NCR", { city: "NCR" }),
    base({ availability: avail({ preferredCities: ["New Delhi"] }) }),
  );
  assert(v.verdict === "MET", `recruiter NCR → ${v.verdict}`);
});

suite("location: city synonyms resolve — Bangalore/Bengaluru", () => {
  const v = evaluateCriterion(
    c("location", "Bangalore", { city: "Bangalore" }),
    base({ availability: avail({ preferredCities: ["Bengaluru"] }) }),
  );
  assert(v.verdict === "MET", v.verdict);
  const back = evaluateCriterion(
    c("location", "Bengaluru", { city: "Bengaluru" }),
    base({ availability: avail({ preferredCities: ["Bangalore"] }) }),
  );
  assert(back.verdict === "MET", back.verdict);
});

suite("location: willing to relocate is MET, but below a named city", () => {
  const relocator = evaluateCriterion(
    inPune,
    base({
      availability: avail({ preferredCities: ["Chennai"], openToRelocate: true }),
    }),
  );
  const named = evaluateCriterion(
    inPune,
    base({ availability: avail({ preferredCities: ["Pune"] }) }),
  );
  assert(relocator.verdict === "MET", relocator.verdict);
  assert(
    (relocator.fit ?? 0) < (named.fit ?? 0),
    "a relocator must not outrank someone who named the city",
  );
  assert(
    relocator.confidence < named.confidence,
    "and must carry lower confidence",
  );
});

suite("location: a known mismatch is NOT_MET", () => {
  const v = evaluateCriterion(
    inPune,
    base({
      availability: avail({
        preferredCities: ["Bengaluru"],
        openToRelocate: false,
      }),
    }),
  );
  assert(v.verdict === "NOT_MET", v.verdict);
});

suite("location: unknown stays UNCLEAR, never NOT_MET", () => {
  // No availability row at all.
  assert(
    evaluateCriterion(inPune, base({ availability: null })).verdict === "UNCLEAR",
    "no row",
  );
  // Opted in, but never said where.
  assert(
    evaluateCriterion(inPune, base({ availability: avail() })).verdict ===
      "UNCLEAR",
    "no cities stated",
  );
});

suite("openToWork:false cannot produce a location match", () => {
  // Every shape that would otherwise be a MET.
  const withdrawnNamed = base({
    availability: avail({ openToWork: false, preferredCities: ["Pune"] }),
  });
  const withdrawnRelocator = base({
    availability: avail({ openToWork: false, openToRelocate: true }),
  });
  for (const m of [withdrawnNamed, withdrawnRelocator]) {
    const v = evaluateCriterion(inPune, m);
    assert(v.verdict === "UNCLEAR", `withdrawn → ${v.verdict}`);
    assert(
      !JSON.stringify(v.evidence).includes("Pune"),
      "a withdrawn city must not appear in evidence",
    );
  }
});

suite("openToWork:false cannot produce a work-mode match", () => {
  const remote = c("availability", "remote", { workMode: "REMOTE" });
  const withdrawn = base({
    availability: avail({ openToWork: false, preferredWorkMode: "REMOTE" }),
  });
  assert(evaluateCriterion(remote, withdrawn).verdict === "UNCLEAR", "withdrawn");
  const active = base({
    availability: avail({ preferredWorkMode: "REMOTE" }),
  });
  assert(evaluateCriterion(remote, active).verdict === "MET", "active still matches");
});

suite("openToWork:false cannot satisfy a compensation ceiling", () => {
  const under = c("compensation", "under 20 LPA", { max: 2000000 });
  const withdrawn = base({
    availability: avail({ openToWork: false, expectedSalaryMin: 500000 }),
  });
  assert(evaluateCriterion(under, withdrawn).verdict === "UNCLEAR", "withdrawn");
});

suite("an explicit open-to-work requirement still reads the raw refusal", () => {
  // The one place `openToWork: false` is a contradiction rather than an
  // unknown: the recruiter asked for it directly.
  const wants = c("availability", "actively looking", { openToWork: true });
  const said = base({ availability: avail({ openToWork: false }) });
  assert(evaluateCriterion(wants, said).verdict === "NOT_MET", "not met");
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
