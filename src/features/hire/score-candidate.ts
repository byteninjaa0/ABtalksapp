import { encodeCandidateRef } from "@/features/hire/candidate-ref";
import {
  ROLE_FAMILY_LABEL,
  roleFamilyFor,
  type RoleFamily,
} from "@/features/hire/role-family";
import type { JobSpec } from "@/lib/validations/hire";
import type {
  EvidenceCoverage,
  MatchTier,
  ScoreBreakdown,
  ScoreDimension,
  ScoreableMember,
  ScoredCandidate,
} from "@/features/hire/types";

/** Default dimension weights — sum to 100 before priority and coverage. */
const BASE_WEIGHTS: Record<ScoreDimension, number> = {
  stack: 25,
  missions: 20,
  cleanPass: 15,
  projects: 15,
  consistency: 10,
  interview: 10,
  experience: 5,
};

/** Everything counts, for callers that have no pool to measure. */
const FULL_COVERAGE: EvidenceCoverage = {
  dimensions: {
    stack: true,
    missions: true,
    cleanPass: true,
    projects: true,
    consistency: true,
    interview: true,
    experience: true,
  },
  note: "Ranked on all 7 evidence dimensions.",
};

/**
 * Total curriculum days minus the three waived at enrolment — the most
 * missions anybody can actually earn.
 */
const MAX_EARNABLE_MISSIONS = 28;

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

/**
 * The shortest token allowed to match by containment.
 *
 * Bare substring matching made "react" match a candidate whose only skills were
 * "Python" and "C" — because `"react".includes("c")` is true. Single-letter
 * languages are real ("C", "R", "Go"), so they cannot be dropped from a skill
 * list; they simply must not be allowed to match *inside* a longer word.
 */
const MIN_CONTAINMENT_LENGTH = 3;

/** Is `needle` present in `haystack` as a whole word rather than a fragment? */
function containsWord(haystack: string, needle: string): boolean {
  if (needle.length < MIN_CONTAINMENT_LENGTH) return false;
  const i = haystack.indexOf(needle);
  if (i === -1) return false;
  // "js" inside "js" is a word; "java" inside "javascript" is not. Punctuation
  // and spaces bound a word — "react" matches "react.js" and "react native".
  const before = i === 0 ? "" : haystack[i - 1]!;
  const after = haystack[i + needle.length] ?? "";
  const isBoundary = (c: string) => c === "" || !/[a-z0-9]/.test(c);
  return isBoundary(before) && isBoundary(after);
}

function stackTokensMatch(have: string[], need: string): boolean {
  const n = normToken(need);
  if (!n) return true;
  return have.some((h) => {
    const x = normToken(h);
    return x === n || containsWord(x, n) || containsWord(n, x);
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Weights for this search: recruiter priorities applied, then dimensions the
 * pool cannot produce dropped and their share redistributed.
 *
 * The redistribution is the important half. Projects and interviews are worth
 * 25 of the 100 points and are cohort milestones — on a cohort that has not
 * reached them, every member scores zero on a quarter of the rubric and the
 * best person on the platform cannot clear the STRONG threshold. Scoring an
 * absent milestone as a failure does not rank anybody; it just compresses
 * everyone toward the bottom. So an uncovered dimension leaves the rubric
 * entirely, and the recruiter is told which ones did (see `EvidenceCoverage`).
 */
function reweight(
  priority: string[] | undefined,
  coverage: EvidenceCoverage = FULL_COVERAGE,
): Record<ScoreDimension, number> {
  const w = { ...BASE_WEIGHTS };
  const boost = new Set<ScoreDimension>();
  for (const p of priority ?? []) {
    const key = PRIORITY_TO_DIM[normToken(p).replace(/ /g, "_")] ??
      PRIORITY_TO_DIM[normToken(p)];
    if (key) boost.add(key);
  }
  for (const dim of boost) {
    w[dim] = Math.round(w[dim] * 1.5);
  }
  for (const k of Object.keys(w) as ScoreDimension[]) {
    if (!coverage.dimensions[k]) w[k] = 0;
  }
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  // Every dimension uncovered would mean nothing to rank on. Fall back to the
  // declared dimensions rather than dividing by zero.
  if (sum <= 0) {
    return { ...BASE_WEIGHTS, missions: 0, cleanPass: 0, projects: 0, consistency: 0, interview: 0, stack: 83.3, experience: 16.7 };
  }
  const scale = 100 / sum;
  for (const k of Object.keys(w) as ScoreDimension[]) {
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

/**
 * Missions earned, measured against the missions there has been time to earn.
 *
 * Was `missionPoints / 240`, which is two mistakes at once. `missionPoints`
 * includes the three days waived at enrolment, so it credits work nobody did;
 * and 240 assumes a finished cohort, so on day 14 a member who has passed
 * everything available scores 0.7 and one who has passed nothing scores 0.15 —
 * a gap far too small to rank on.
 */
function missionScore(
  missionsPassed: number,
  cohortDay: number,
  maxEarnable: number = MAX_EARNABLE_MISSIONS,
): number {
  const earnable = Math.max(3, Math.min(cohortDay, maxEarnable));
  return clamp01(missionsPassed / earnable);
}

/** Share of earned passes that passed on the first verification run. */
function cleanPassScore(cleanPassCount: number, missionsPassed: number): number {
  if (missionsPassed <= 0) return 0;
  return clamp01(cleanPassCount / missionsPassed);
}

function projectScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const best = Math.max(...scores);
  return clamp01((mean * 0.6 + best * 0.4) / 100);
}

/** Commit days against days elapsed — showing up daily is the signal, and on
 *  day 14 nobody can have 20 of them. */
function consistencyScore(
  commitDays: number,
  cohortDay: number,
  window = 30,
): number {
  return clamp01(commitDays / Math.max(5, Math.min(cohortDay, window)));
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

function tierFor(
  score: number,
  missingMust: string[],
  missionsPassed = 1,
): MatchTier {
  if (missingMust.length > 0) {
    return score >= 40 ? "PARTIAL" : "NONE";
  }
  // STRONG is a claim about proven work, so it cannot be reached without any.
  //
  // Dropping the uncovered dimensions leaves declared skills carrying most of
  // the weight, and a member who has passed nothing was scoring 69 on a typed
  // skill list alone. The score is a fair reading of the evidence available;
  // the tier is what a recruiter acts on, and it must not promise a track
  // record that does not exist.
  if (score >= 70) return missionsPassed > 0 ? "STRONG" : "PARTIAL";
  if (score >= 40) return "PARTIAL";
  return "NONE";
}

/**
 * Role buckets that do not CONTRADICT a stated role — they are the absence of
 * one.
 *
 * `jobRole` is free text the member typed, and most of the platform never typed
 * anything: `roleFamilyFor` returns OTHER, and a student on a student platform
 * says STUDENT. Treating either as a conflict is what emptied the board — asked
 * for a "senior manager" every single candidate came back "Role mismatch:
 * requires Management", because nobody had declared a management title, not
 * because anybody had declared a different one.
 */
const UNSPECIFIC_ROLE = new Set<RoleFamily>(["OTHER", "STUDENT"]);

/**
 * Hard filters + availability. Does not score — used before weighting.
 * Members failing hard filters get hardFiltered=true and score 0.
 *
 * The rule the whole function obeys: **a hard filter fires only on a fact we
 * KNOW and that contradicts the requirement.** Missing data is not a
 * contradiction. Role, years of experience, degree level and availability are
 * blank on most of this pool, and hard-filtering on a blank field produced the
 * failure this exists to stop — a real search returning zero cards over data
 * nobody ever filled in. Anything unknown becomes a `softReasons` entry, which
 * the card shows as a gap and the recruiter can judge for themselves.
 */
export function evaluateHardFilters(
  member: ScoreableMember,
  spec: JobSpec,
): {
  ok: boolean;
  reasons: string[];
  /** Unknowns, not contradictions. Shown on the card; never exclude. */
  softReasons: string[];
  missingMust: string[];
} {
  const reasons: string[] = [];
  const softReasons: string[] = [];

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

  // The role used to be presentation-only: "backend engineer" and "data
  // analyst" searched the same people unless the recruiter separately named
  // skills. Scout already captures a title as a structured field; use the
  // shared role taxonomy to make that stated requirement a real gate. An
  // unrecognised title is not guessed at — no taxonomy match means it stays a
  // label until we can support it precisely.
  const requestedRole = roleFamilyFor(spec.title);
  if (requestedRole !== "OTHER") {
    const candidateRole = roleFamilyFor(member.jobRole);
    if (UNSPECIFIC_ROLE.has(candidateRole)) {
      // Nothing to contradict. Say so on the card and let the evidence rank.
      softReasons.push(
        `${ROLE_FAMILY_LABEL[requestedRole]} role not declared on the profile`,
      );
    } else if (candidateRole !== requestedRole) {
      reasons.push(
        `Role mismatch: requires ${ROLE_FAMILY_LABEL[requestedRole]}`,
      );
    }
  }

  // Experience was previously a ranking hint. That let someone outside an
  // explicitly requested range appear as a lower-scoring card, which is not an
  // exact match. An explicitly stated minimum or maximum is a filter — but only
  // against a figure the candidate actually gave us. `yearsFor` returns 0 for
  // "never told us", so an unqualified minimum excluded everybody who had left
  // the field blank, which on this pool is nearly everybody.
  const experience = strictExperienceBand(spec);
  const yearsStated =
    member.yearsExperienceKnown !== false && member.yearsExperience > 0;
  if (experience.min != null && member.yearsExperience < experience.min) {
    if (yearsStated) {
      reasons.push(`Experience below required ${experience.min}+ years`);
    } else {
      softReasons.push(
        `Years of experience not stated — ${experience.min}+ years unverified`,
      );
    }
  }
  if (
    experience.max != null &&
    yearsStated &&
    member.yearsExperience > experience.max
  ) {
    reasons.push(`Experience above required ${experience.max} years`);
  }

  // Education level is null on every challenge and hackathon dossier by design
  // — we never collected it. Enforcing it as a filter did not select for
  // graduates, it deleted the pool.
  if (spec.requiresDegree && !member.dossier?.education.value.level?.trim()) {
    softReasons.push("Degree not verified on the profile");
  }

  const avail = member.availability;
  const extra = (spec.extra ?? {}) as Record<string, unknown>;
  const salaryCap =
    spec.salaryMax != null &&
    !(spec.salaryMin === 0 && spec.salaryMax === 0);
  const needsAvailability =
    extra.openToWork === true ||
    salaryCap ||
    (spec.noticePeriodDays != null && spec.noticePeriodDays < 180) ||
    (spec.workMode != null && spec.workMode !== "FLEXIBLE") ||
    Boolean(spec.locationCity?.trim() && spec.locationCity !== "Any");

  // Unknown availability is not a refusal. Most candidates have never opened
  // the availability form, so requiring it turned "remote" — one word from the
  // recruiter — into a filter that removed the entire pool. The card carries
  // the gap and the recruiter confirms at outreach, which is what they do
  // anyway.
  if (!avail && needsAvailability) {
    softReasons.push("Availability not shared for a stated requirement");
  }
  if (avail) {
    if (extra.openToWork === true && !avail.openToWork) {
      reasons.push("Not open to work");
    }
    if (
      salaryCap &&
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
      spec.workMode !== "FLEXIBLE" &&
      avail.preferredWorkMode &&
      avail.preferredWorkMode !== "FLEXIBLE" &&
      avail.preferredWorkMode !== spec.workMode
    ) {
      reasons.push("Work mode mismatch");
    }
    if (
      spec.locationCity &&
      spec.locationCity !== "Any" &&
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

  return { ok: reasons.length === 0, reasons, softReasons, missingMust };
}

/**
 * Deterministic 0–100 score. No LLM. Pure function of member + spec.
 */

/**
 * Years a seniority label implies, used only when the recruiter gave no band.
 *
 * `seniority` was asked, stored, shown in the requirement panel — and read by
 * nothing. An "Intern" requirement scored identically to a "Lead" one. It is a
 * soft signal rather than a filter: the label is the recruiter's shorthand, and
 * the evidence still decides the ranking.
 */
const SENIORITY_BAND: Record<string, { min: number; max: number }> = {
  INTERN: { min: 0, max: 1 },
  JUNIOR: { min: 0, max: 2 },
  MID: { min: 2, max: 5 },
  SENIOR: { min: 5, max: 12 },
  LEAD: { min: 8, max: 25 },
};

/**
 * A stated experience requirement as a hard range.
 *
 * `0–50` is Scout's "evidence only" sentinel, so it deliberately means no
 * experience filter. With a single stated minimum, retain only the minimum —
 * the old scoring helper invents a ten-year upper bound to shape a score, which
 * would be wrong to enforce as a recruiter requirement.
 */
function strictExperienceBand(spec: JobSpec): {
  min: number | null;
  max: number | null;
} {
  if (
    spec.minExperience != null &&
    spec.maxExperience != null &&
    spec.minExperience === 0 &&
    spec.maxExperience >= 50
  ) {
    return { min: null, max: null };
  }
  if (spec.minExperience != null || spec.maxExperience != null) {
    return {
      min: spec.minExperience ?? null,
      max: spec.maxExperience ?? null,
    };
  }
  // Seniority is the recruiter's shorthand, not a number they committed to.
  // Turning "senior" into a silent 5-year floor excluded people the recruiter
  // never ruled out — it still shapes the RANKING through
  // `effectiveExperienceBand`, which is where a shorthand belongs.
  return { min: null, max: null };
}

/**
 * The experience band to score against.
 *
 * An explicit band always wins. "Evidence only" stores 0–50, which is the
 * recruiter saying they do not want an experience filter — so seniority must
 * not quietly reimpose one.
 */
function effectiveExperienceBand(spec: {
  seniority?: string | null;
  minExperience?: number | null;
  maxExperience?: number | null;
}): { min: number | null | undefined; max: number | null | undefined } {
  const explicit =
    spec.minExperience != null &&
    spec.maxExperience != null &&
    !(spec.minExperience === 0 && spec.maxExperience >= 50);
  if (explicit || !spec.seniority) {
    return { min: spec.minExperience, max: spec.maxExperience };
  }
  const band = SENIORITY_BAND[spec.seniority];
  return band ? { min: band.min, max: band.max } : { min: null, max: null };
}

export function scoreCandidate(
  member: ScoreableMember,
  spec: JobSpec,
  searchCoverage: EvidenceCoverage = FULL_COVERAGE,
): ScoredCandidate {
  // A candidate carrying its own coverage is scored against what its track can
  // produce, not against what the widest pool in the search happened to have.
  const coverage = member.coverage ?? searchCoverage;
  const source = member.source ?? "PROGRAM";
  const candidateRef = member.candidateRef ?? encodeCandidateRef(source, member.id);
  const programMemberId = source === "PROGRAM" ? member.id : null;

  const { ok, reasons, softReasons, missingMust } = evaluateHardFilters(
    member,
    spec,
  );
  const availabilityUnknown = member.availability == null;

  const stack = stackScore(member.skills, spec);
  // Prefer hard-filter missing list when present; stackScore missing aligns.
  const missing = missingMust.length > 0 ? missingMust : stack.missing;

  const weights = reweight(spec.evidencePriority, coverage);
  const cohortDay = member.cohortDay > 0 ? member.cohortDay : 1;
  const dims: Record<ScoreDimension, number> = {
    stack: stack.score,
    missions: missionScore(
      member.missionsPassed,
      cohortDay,
      member.maxEarnableMissions,
    ),
    cleanPass: cleanPassScore(member.cleanPassCount, member.missionsPassed),
    projects: projectScore(member.projectScores),
    consistency: consistencyScore(
      member.commitDayCount,
      cohortDay,
      member.consistencyWindow,
    ),
    interview: interviewScore(member.interview),
    experience: (() => {
      const band = effectiveExperienceBand(spec);
      return experienceScore(member.yearsExperience, band.min, band.max);
    })(),
  };

  const dimensionsUsed = (Object.keys(dims) as ScoreDimension[]).filter(
    (k) => coverage.dimensions[k] && weights[k] > 0,
  );

  let total = 0;
  for (const k of dimensionsUsed) {
    total += dims[k] * weights[k];
  }
  total = Math.round(Math.max(0, Math.min(100, total)));

  // An uncovered dimension reports null, not 0 — the audit trail has to
  // distinguish "this cohort could not produce the evidence" from "the
  // evidence exists and it was bad".
  const breakdown = (t: number): ScoreBreakdown => ({
    stack: coverage.dimensions.stack ? Math.round(dims.stack * 100) : null,
    missions: coverage.dimensions.missions ? Math.round(dims.missions * 100) : null,
    cleanPass: coverage.dimensions.cleanPass ? Math.round(dims.cleanPass * 100) : null,
    projects: coverage.dimensions.projects ? Math.round(dims.projects * 100) : null,
    consistency: coverage.dimensions.consistency
      ? Math.round(dims.consistency * 100)
      : null,
    interview: coverage.dimensions.interview ? Math.round(dims.interview * 100) : null,
    experience: coverage.dimensions.experience
      ? Math.round(dims.experience * 100)
      : null,
    weights,
    total: t,
    dimensionsUsed,
  });

  if (!ok) {
    return {
      programMemberId,
      source,
      candidateRef,
      userId: member.userId,
      fullName: member.fullName,
      jobRole: member.jobRole,
      company: member.company,
      score: 0,
      tier: "NONE",
      scoreBreakdown: breakdown(0),
      evidence: toEvidence(member),
      gaps: [
        ...reasons,
        ...softReasons,
        ...missing.map((m) => `Missing stack: ${m}`),
      ],
      availabilityUnknown,
      hardFiltered: true,
      hardFilterReasons: reasons,
      dossier: member.dossier,
    };
  }

  const gaps: string[] = [];
  // The unknowns first: they are what the recruiter asked for and we could not
  // confirm, so they belong at the top of the card rather than buried under
  // generic evidence notes.
  for (const s of softReasons) gaps.push(s);
  for (const m of missing) gaps.push(`Missing stack: ${m}`);
  // Shown, but never quietly. A candidate three missions in is a real person
  // with a real profile and almost no track record, and the card has to say so.
  if (member.missionsPassed < 3) {
    gaps.push(
      member.missionsPassed === 0
        ? "Just started — no verified missions completed yet"
        : `Early in the cohort — only ${member.missionsPassed} verified mission(s) so far`,
    );
  }
  // Only report a gap the cohort could actually have filled. "No graded
  // projects" against a cohort whose project days have not arrived reads as a
  // fault of the candidate, and it is not one.
  if (coverage.dimensions.projects && dims.projects < 0.3) {
    gaps.push("Limited graded project evidence");
  }
  if (coverage.dimensions.interview && dims.interview < 0.3) {
    gaps.push("No or low interview scores");
  }
  if (coverage.dimensions.consistency && dims.consistency < 0.3) {
    gaps.push("Few verified commit days");
  }
  if (availabilityUnknown && !softReasons.some((s) => s.startsWith("Availability"))) {
    gaps.push("Availability not shared — confirm salary/notice/location at outreach");
  }

  const tier = tierFor(total, missing, member.missionsPassed);

  return {
    programMemberId,
    source,
    candidateRef,
    userId: member.userId,
    fullName: member.fullName,
    jobRole: member.jobRole,
    company: member.company,
    score: total,
    tier,
    scoreBreakdown: breakdown(total),
    evidence: toEvidence(member),
    gaps,
    availabilityUnknown,
    hardFiltered: false,
    hardFilterReasons: [],
    dossier: member.dossier,
  };
}

function toEvidence(member: ScoreableMember) {
  return {
    skills: member.skills,
    yearsExperience: member.yearsExperience,
    missionPoints: member.missionPoints,
    missionsPassed: member.missionsPassed,
    missionsAttempted: member.missionsAttempted,
    missionsWaived: member.dossier?.evidence.missionsWaived.value ?? 0,
    cleanPassCount: member.cleanPassCount,
    commitDayCount: member.commitDayCount,
    workingLanguages: member.dossier?.evidence.workingLanguages.value ?? [],
    cohortDay: member.cohortDay,
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
  opts?: {
    includeHardFiltered?: boolean;
    limit?: number;
    coverage?: EvidenceCoverage;
  },
): ScoredCandidate[] {
  const scored = members.map((m) => scoreCandidate(m, spec, opts?.coverage));
  const list = opts?.includeHardFiltered
    ? scored
    : scored.filter((s) => !s.hardFiltered);
  // Name is the tiebreak where there is one. Candidates outside the program
  // carry no name by design, so their ties fall back to the handle — arbitrary,
  // but stable, which is what a tiebreak is for.
  list.sort(
    (a, b) =>
      b.score - a.score ||
      (a.fullName || a.candidateRef).localeCompare(
        b.fullName || b.candidateRef,
      ),
  );
  const limit = opts?.limit ?? 25;
  return list.slice(0, limit);
}

/**
 * Who actually appears as a result card.
 *
 * Ranked people who fail a stated must-have are near-misses for the gap
 * report, not results. Padding an empty must-have search with a business
 * executive is how the sample-card path never fired.
 */
export function pickSearchMatches(
  ranked: ScoredCandidate[],
  spec: JobSpec,
  opts?: { hardCap?: number | null; limit?: number; minResults?: number },
): ScoredCandidate[] {
  const must = spec.mustHaveStack ?? [];
  const minResults = opts?.minResults ?? 5;
  const hardCap = opts?.hardCap ?? null;
  const limit = hardCap ?? opts?.limit ?? 25;

  const shown = ranked.filter((r) => {
    if (r.hardFiltered) return false;
    if (must.length === 0) return true;
    const skills = r.evidence.skills ?? [];
    return must.every((t) => stackTokensMatch(skills, t));
  });
  const primary = shown.filter((r) => r.tier !== "NONE");
  if (primary.length === 0) {
    // Everyone here already carries every must-have — `shown` was filtered on
    // exactly that. A tier of NONE means thin evidence, not a wrong person, and
    // returning nothing hid candidates who genuinely met the stated stack.
    return shown.slice(0, limit);
  }
  const padded =
    hardCap || primary.length >= minResults
      ? primary
      : [...primary, ...shown.filter((r) => r.tier === "NONE")];
  return padded.slice(0, limit);
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
  BASE_WEIGHTS,
  FULL_COVERAGE,
};
