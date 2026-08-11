/**
 * Pure scoring tests — run with:
 *   npx tsx src/features/hire/score-candidate.test.ts
 */
import {
  scoreCandidate,
  rankCandidates,
  __test,
} from "@/features/hire/score-candidate";
import type { ScoreableMember } from "@/features/hire/types";
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
    cleanPassCount: 12,
    totalScore: 400,
    commitDayCount: 18,
    projectScores: [82, 90],
    interview: { overall: 80, comm: 78, tech: 85, problem: 77 },
    hasVisibilityConsent: true,
    cohortPublished: true,
    status: "ENROLLED",
    availability: null,
    ...over,
  };
}

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

console.log(`\n${passed} passed`);
