import type { JobSpec } from "@/lib/validations/hire";
import type {
  MatchTier,
  ScoreBreakdown,
  ScoreableMember,
  ScoredCandidate,
} from "@/features/hire/types";

/** Default dimension weights — sum to 100 before priority reweight. */
const BASE_WEIGHTS: Record<keyof Omit<ScoreBreakdown, "weights" | "total">, number> =
  {
    stack: 25,
    missions: 20,
    cleanPass: 15,
    projects: 15,
    consistency: 10,
    interview: 10,
    experience: 5,
  };

/** Map recruiter evidence-priority tokens → score dimensions. */
const PRIORITY_TO_DIM: Record<string, keyof typeof BASE_WEIGHTS> = {
  missions: "missions",
  code_correctness: "missions",
  clean_pass: "cleanPass",
  first_attempt: "cleanPass",
  projects: "projects",
  project_quality: "projects",
  consistency: "consistency",
  commit: "consistency",
  ship_speed: "consistency",
  interview: "interview",
  communication: "interview",
  stack: "stack",
  data: "stack",
  ai_prompting: "stack",
  sql: "stack",
};

function normToken(s: string): string {
  return s.trim().toLowerCase().replace(/[\s/_-]+/g, " ");
}

function stackTokensMatch(have: string[], need: string): boolean {
  const n = normToken(need);
  if (!n) return true;
  return have.some((h) => {
    const x = normToken(h);
    return x === n || x.includes(n) || n.includes(x);
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function reweight(
  priority: string[] | undefined,
): Record<keyof typeof BASE_WEIGHTS, number> {
  const w = { ...BASE_WEIGHTS };
  const boost = new Set<keyof typeof BASE_WEIGHTS>();
  for (const p of priority ?? []) {
    const key = PRIORITY_TO_DIM[normToken(p).replace(/ /g, "_")] ??
      PRIORITY_TO_DIM[normToken(p)];
    if (key) boost.add(key);
  }
  for (const dim of boost) {
    w[dim] = Math.round(w[dim] * 1.5);
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0) || 100;
  const scale = 100 / sum;
  for (const k of Object.keys(w) as (keyof typeof w)[]) {
    w[k] = Math.round(w[k] * scale * 10) / 10;
  }
  return w;
}

function stackScore(memberSkills: string[], spec: JobSpec): { score: number; missing: string[] } {
  const must = spec.mustHaveStack ?? [];
  const nice = spec.niceToHaveStack ?? [];
  const missing = must.filter((m) => !stackTokensMatch(memberSkills, m));
  if (must.length === 0 && nice.length === 0) {
    return { score: 0.5, missing: [] };
  }
  const mustHit = must.length === 0 ? 1 : (must.length - missing.length) / must.length;
  const niceHit =
    nice.length === 0
      ? 0.5
      : nice.filter((n) => stackTokensMatch(memberSkills, n)).length / nice.length;
  // Must-haves dominate; nice-to-have fills the rest.
  const score = must.length === 0 ? niceHit : mustHit * 0.75 + niceHit * 0.25;
  return { score: clamp01(score), missing };
}

function missionScore(missionPoints: number): number {
  // Typical mission day awards ~12 pts; 20 clean missions ≈ 240.
  return clamp01(missionPoints / 240);
}

function cleanPassScore(cleanPassCount: number, missionPoints: number): number {
  const attempted = Math.max(Math.floor(missionPoints / 12), cleanPassCount, 1);
  return clamp01(cleanPassCount / attempted);
}

function projectScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best = Math.max(...scores);
  return clamp01((mean * 0.6 + best * 0.4) / 100);
}

function consistencyScore(commitDays: number): number {
  // ~20 active commit days in a cohort is strong.
  return clamp01(commitDays / 20);
}

function interviewScore(
  interview: ScoreableMember["interview"],
): number {
  if (!interview) return 0;
  const parts = [interview.comm, interview.tech, interview.problem, interview.overall]
    .filter((n): n is number => typeof n === "number");
  if (parts.length === 0) return 0;
  const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
  return clamp01(mean / 100);
}

function experienceScore(
  years: number,
  min: number | null | undefined,
  max: number | null | undefined,
): number {
  if (min == null && max == null) return 0.7;
  const lo = min ?? 0;
  const hi = max ?? lo + 10;
  if (years >= lo && years <= hi) return 1;
  if (years < lo) return clamp01(1 - (lo - years) / Math.max(lo, 3));
  return clamp01(1 - (years - hi) / Math.max(hi, 3));
}

function tierFor(score: number, missingMust: string[]): MatchTier {
  if (missingMust.length > 0) {
    return score >= 40 ? "PARTIAL" : "NONE";
  }
  if (score >= 70) return "STRONG";
  if (score >= 40) return "PARTIAL";
  return "NONE";
}

/**
 * Hard filters + availability. Does not score — used before weighting.
 * Members failing hard filters get hardFiltered=true and score 0.
 */
export function evaluateHardFilters(
  member: ScoreableMember,
  spec: JobSpec,
): { ok: boolean; reasons: string[]; missingMust: string[] } {
  const reasons: string[] = [];

  if (!member.hasVisibilityConsent) {
    reasons.push("No recruiter-visibility consent");
  }
  if (!member.cohortPublished) {
    reasons.push("Cohort results not published");
  }
  if (member.status !== "ENROLLED" && member.status !== "COMPLETED") {
    reasons.push(`Status ${member.status} not eligible`);
  }

  const must = spec.mustHaveStack ?? [];
  const missingMust = must.filter((m) => !stackTokensMatch(member.skills, m));
  // Must-have stack is a soft-hard hybrid: missing must-haves do not hard-exclude
  // so PARTIAL near-misses can power the gap report. They block STRONG via tierFor.

  const avail = member.availability;
  if (avail) {
    if (!avail.openToWork) {
      reasons.push("Not open to work");
    } else {
      if (
        spec.salaryMax != null &&
        avail.expectedSalaryMin != null &&
        avail.expectedSalaryMin > spec.salaryMax
      ) {
        reasons.push("Expected salary above budget");
      }
      if (
        spec.noticePeriodDays != null &&
        avail.noticePeriodDays != null &&
        avail.noticePeriodDays > spec.noticePeriodDays
      ) {
        reasons.push("Notice period too long");
      }
      if (
        spec.workMode &&
        avail.preferredWorkMode &&
        avail.preferredWorkMode !== "FLEXIBLE" &&
        spec.workMode !== "FLEXIBLE" &&
        avail.preferredWorkMode !== spec.workMode
      ) {
        reasons.push("Work mode mismatch");
      }
      if (
        spec.locationCity &&
        !avail.openToRelocate &&
        avail.preferredCities.length > 0
      ) {
        const city = normToken(spec.locationCity);
        const hit = avail.preferredCities.some(
          (c) =>
            normToken(c) === city ||
            normToken(c).includes(city) ||
            city.includes(normToken(c)),
        );
        if (!hit) reasons.push("Location mismatch");
      }
    }
  }

  return { ok: reasons.length === 0, reasons, missingMust };
}

/**
 * Deterministic 0–100 score. No LLM. Pure function of member + spec.
 */
export function scoreCandidate(
  member: ScoreableMember,
  spec: JobSpec,
): ScoredCandidate {
  const { ok, reasons, missingMust } = evaluateHardFilters(member, spec);
  const availabilityUnknown = member.availability == null;

  const stack = stackScore(member.skills, spec);
  // Prefer hard-filter missing list when present; stackScore missing aligns.
  const missing = missingMust.length > 0 ? missingMust : stack.missing;

  const weights = reweight(spec.evidencePriority);
  const dims = {
    stack: stack.score,
    missions: missionScore(member.missionPoints),
    cleanPass: cleanPassScore(member.cleanPassCount, member.missionPoints),
    projects: projectScore(member.projectScores),
    consistency: consistencyScore(member.commitDayCount),
    interview: interviewScore(member.interview),
    experience: experienceScore(
      member.yearsExperience,
      spec.minExperience,
      spec.maxExperience,
    ),
  };

  let total = 0;
  for (const k of Object.keys(dims) as (keyof typeof dims)[]) {
    total += dims[k] * weights[k];
  }
  total = Math.round(Math.max(0, Math.min(100, total)));

  if (!ok) {
    return {
      programMemberId: member.id,
      userId: member.userId,
      fullName: member.fullName,
      jobRole: member.jobRole,
      company: member.company,
      score: 0,
      tier: "NONE",
      scoreBreakdown: {
        ...Object.fromEntries(
          Object.entries(dims).map(([k, v]) => [k, Math.round(v * 100)]),
        ),
        weights,
        total: 0,
      } as ScoreBreakdown,
      evidence: toEvidence(member),
      gaps: [...reasons, ...missing.map((m) => `Missing stack: ${m}`)],
      availabilityUnknown,
      hardFiltered: true,
      hardFilterReasons: reasons,
    };
  }

  const gaps: string[] = [];
  for (const m of missing) gaps.push(`Missing stack: ${m}`);
  if (dims.projects < 0.3) gaps.push("Limited graded project evidence");
  if (dims.interview < 0.3) gaps.push("No or low interview scores");
  if (dims.consistency < 0.3) gaps.push("Few verified commit days");
  if (availabilityUnknown) {
    gaps.push("Availability not shared — confirm salary/notice/location at outreach");
  }

  const tier = tierFor(total, missing);

  return {
    programMemberId: member.id,
    userId: member.userId,
    fullName: member.fullName,
    jobRole: member.jobRole,
    company: member.company,
    score: total,
    tier,
    scoreBreakdown: {
      stack: Math.round(dims.stack * 100),
      missions: Math.round(dims.missions * 100),
      cleanPass: Math.round(dims.cleanPass * 100),
      projects: Math.round(dims.projects * 100),
      consistency: Math.round(dims.consistency * 100),
      interview: Math.round(dims.interview * 100),
      experience: Math.round(dims.experience * 100),
      weights,
      total,
    },
    evidence: toEvidence(member),
    gaps,
    availabilityUnknown,
    hardFiltered: false,
    hardFilterReasons: [],
  };
}

function toEvidence(member: ScoreableMember) {
  return {
    skills: member.skills,
    yearsExperience: member.yearsExperience,
    missionPoints: member.missionPoints,
    cleanPassCount: member.cleanPassCount,
    commitDayCount: member.commitDayCount,
    projectScores: member.projectScores,
    interview: member.interview,
    totalScore: member.totalScore,
    jobRole: member.jobRole,
    company: member.company,
  };
}

/** Rank non-hard-filtered candidates; optionally include near-miss for gap analysis. */
export function rankCandidates(
  members: ScoreableMember[],
  spec: JobSpec,
  opts?: { includeHardFiltered?: boolean; limit?: number },
): ScoredCandidate[] {
  const scored = members.map((m) => scoreCandidate(m, spec));
  const list = opts?.includeHardFiltered
    ? scored
    : scored.filter((s) => !s.hardFiltered);
  list.sort((a, b) => b.score - a.score || a.fullName.localeCompare(b.fullName));
  const limit = opts?.limit ?? 25;
  return list.slice(0, limit);
}

// ─── Pure helpers exported for unit tests (no DB) ───────────────────────────

export const __test = {
  stackTokensMatch,
  reweight,
  stackScore,
  missionScore,
  cleanPassScore,
  projectScore,
  consistencyScore,
  interviewScore,
  experienceScore,
  tierFor,
  normToken,
};
