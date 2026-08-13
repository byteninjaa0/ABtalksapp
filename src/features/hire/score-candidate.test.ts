/**
 * Pure scoring tests — run with:
 *   npx tsx src/features/hire/score-candidate.test.ts
 */
import {
  scoreCandidate,
  rankCandidates,
  __test,
} from "@/features/hire/score-candidate";
import type {
  EvidenceCoverage,
  ScoreableMember,
  ScoreDimension,
} from "@/features/hire/types";
import type { JobSpec } from "@/lib/validations/hire";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function baseMember(over: Partial<ScoreableMember> = {}): ScoreableMember {
  return {
    id: "m1",
    userId: "u1",
    fullName: "Ada Example",
    jobRole: "Engineer",
    company: "Acme",
    yearsExperience: 3,
    skills: ["Python", "SQL", "TypeScript"],
    missionPoints: 180,
    missionsPassed: 15,
    missionsAttempted: 17,
    cleanPassCount: 12,
    totalScore: 400,
    commitDayCount: 18,
    projectScores: [82, 90],
    interview: { overall: 80, comm: 78, tech: 85, problem: 77 },
    hasVisibilityConsent: true,
    cohortPublished: true,
    status: "ENROLLED",
    availability: null,
    cohortDay: 20,
    ...over,
  };
}

function coverage(over: Partial<Record<ScoreDimension, boolean>> = {}): EvidenceCoverage {
  return {
    dimensions: {
      stack: true,
      missions: true,
      cleanPass: true,
      projects: true,
      consistency: true,
      interview: true,
      experience: true,
      ...over,
    },
    note: "test",
  };
}

/** A cohort mid-flight: no graded projects, no completed interviews. */
const midCohort = coverage({ projects: false, interview: false });

const baseSpec: JobSpec = {
  title: "Backend engineer",
  mustHaveStack: ["Python", "SQL"],
  niceToHaveStack: ["Airflow"],
  evidencePriority: [],
  minExperience: 2,
  maxExperience: 5,
};

let passed = 0;
function ok(name: string) {
  passed += 1;
  console.log("  ✓", name);
}

console.log("score-candidate tests");

{
  const r = scoreCandidate(baseMember(), baseSpec);
  assert(!r.hardFiltered, "strong member should not hard-filter");
  assert(r.tier === "STRONG" || r.tier === "PARTIAL", `tier=${r.tier}`);
  assert(r.score >= 40, `score=${r.score}`);
  assert(r.availabilityUnknown === true, "no availability → unknown");
  ok("baseline scores and availabilityUnknown");
}

{
  const r = scoreCandidate(
    baseMember({ hasVisibilityConsent: false }),
    baseSpec,
  );
  assert(r.hardFiltered, "no consent → hard filter");
  assert(r.score === 0, "hard filter score 0");
  ok("consent hard filter");
}

{
  const r = scoreCandidate(
    baseMember({ skills: ["Java", "Go"] }),
    baseSpec,
  );
  assert(r.tier !== "STRONG", "missing must-have cannot be STRONG");
  assert(r.gaps.some((g) => /Python|SQL|stack/i.test(g)), "gap mentions stack");
  ok("missing must-have blocks STRONG");
}

{
  const a = scoreCandidate(
    baseMember({ commitDayCount: 25, projectScores: [50] }),
    { ...baseSpec, evidencePriority: ["consistency"] },
  );
  const b = scoreCandidate(
    baseMember({ commitDayCount: 25, projectScores: [50] }),
    { ...baseSpec, evidencePriority: ["projects"] },
  );
  // Same member; priority should change breakdown weights
  assert(
    a.scoreBreakdown.weights.consistency >= b.scoreBreakdown.weights.consistency,
    "consistency priority boosts weight",
  );
  ok("evidencePriority reweights");
}

{
  const blocked = scoreCandidate(
    baseMember({
      availability: {
        openToWork: false,
        expectedSalaryMin: null,
        expectedSalaryMax: null,
        salaryCurrency: "INR",
        noticePeriodDays: null,
        preferredWorkMode: null,
        preferredCities: [],
        openToRelocate: false,
      },
    }),
    baseSpec,
  );
  assert(blocked.hardFiltered, "openToWork false hard-filters");
  ok("openToWork false");
}

{
  const ranked = rankCandidates(
    [
      baseMember({ id: "strong", fullName: "Zed" }),
      baseMember({
        id: "weak",
        fullName: "Amy",
        missionPoints: 12,
        cleanPassCount: 0,
        projectScores: [],
        commitDayCount: 1,
        interview: null,
        skills: ["Python", "SQL"],
      }),
    ],
    baseSpec,
  );
  assert(ranked.length === 2, "both returned");
  assert(ranked[0]!.score >= ranked[1]!.score, "sorted desc by score");
  ok("rank order");
}

{
  assert(__test.stackTokensMatch(["TypeScript", "React"], "typescript"), "case");
  assert(__test.stackTokensMatch(["node.js"], "Node"), "fuzzy-ish include");
  ok("stack token match helpers");
}

// ─── coverage-aware scoring ────────────────────────────────────────────────

{
  // T1 — weights of an uncovered pool still add up, and none go negative.
  const w = __test.reweight([], midCohort);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 100) < 1.5, `weights sum ${sum}`);
  assert(w.projects === 0 && w.interview === 0, "uncovered dims drop to 0");
  assert(
    Object.values(w).every((v) => v >= 0),
    "no negative weight",
  );
  ok("T1 uncovered dimensions renormalise to 100");
}

{
  // T2 — the point of the whole change: a mid-cohort member is not punished
  // for milestones that have not happened.
  const m = baseMember({ projectScores: [], interview: null });
  const full = scoreCandidate(m, baseSpec, coverage());
  const partial = scoreCandidate(m, baseSpec, midCohort);
  assert(
    partial.score > full.score,
    `partial ${partial.score} should beat full ${full.score}`,
  );
  assert(partial.tier === "STRONG", `mid-cohort tier=${partial.tier}`);
  ok("T2 mid-cohort member outscores the same member judged on absent evidence");
}

{
  // T3 — regression guard: where the evidence *could* exist, its absence must
  // still cost. Otherwise T2 has quietly disabled the rubric.
  const withProjects = scoreCandidate(baseMember(), baseSpec, coverage());
  const without = scoreCandidate(
    baseMember({ projectScores: [], interview: null }),
    baseSpec,
    coverage(),
  );
  assert(
    without.score < withProjects.score,
    "missing evidence in a covered pool must still cost",
  );
  assert(
    without.gaps.some((g) => /project/i.test(g)),
    "covered pool reports the project gap",
  );
  ok("T3 covered pool still penalises missing evidence");
}

{
  // T4 — the same work reads differently on day 4 than on day 30.
  const early = __test.missionScore(3, 4);
  const late = __test.missionScore(3, 30);
  assert(early > 0.5, `day-4 score ${early}`);
  assert(late < 0.2, `day-30 score ${late}`);
  ok("T4 mission expectations scale with the cohort day");
}

{
  // T5 — priority still reorders after coverage has removed dimensions.
  const a = __test.reweight(["consistency"], midCohort);
  const b = __test.reweight(["stack"], midCohort);
  assert(a.consistency > b.consistency, "priority boost survives renormalisation");
  ok("T5 evidencePriority reweights under partial coverage");
}

{
  // T6 — coverage must not become a back door to STRONG.
  const r = scoreCandidate(
    baseMember({ skills: ["Java"] }),
    baseSpec,
    midCohort,
  );
  assert(r.tier !== "STRONG", `missing must-have tier=${r.tier}`);
  ok("T6 missing must-have never STRONG under any coverage");
}

{
  // T7 — an empty pool returns nothing rather than throwing.
  const ranked = rankCandidates([], baseSpec, { coverage: midCohort });
  assert(ranked.length === 0, "empty pool → empty list");
  ok("T7 empty pool");
}

{
  // T8 — the waived start days must not read as work. A member with three
  // waived days and nothing else scores as the beginner they are.
  const doneNothing = baseMember({
    missionsPassed: 0,
    missionsAttempted: 0,
    cleanPassCount: 0,
    commitDayCount: 3,
    missionPoints: 36,
    projectScores: [],
    interview: null,
    cohortDay: 14,
  });
  const r = scoreCandidate(doneNothing, baseSpec, midCohort);
  assert(r.tier !== "STRONG", `no-work tier=${r.tier}`);
  assert(r.scoreBreakdown.missions === 0, "no earned passes → 0 missions");
  assert(r.scoreBreakdown.projects === null, "uncovered dimension reports null");
  ok("T8 waived enrolment days are not evidence");
}

console.log(`\n${passed} passed`);
