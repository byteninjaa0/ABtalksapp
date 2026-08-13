import type { CompensationBand } from "@/features/hire/compensation";
import type { Fact } from "@/features/hire/dossier-provenance";
import type { RoleFamily } from "@/features/hire/role-family";
import type { JobSpec } from "@/lib/validations/hire";

export type { JobSpec };

export type EvidencePriorityKey =
  | "missions"
  | "clean_pass"
  | "projects"
  | "consistency"
  | "interview"
  | "stack"
  | "data"
  | "ai_prompting"
  | "communication"
  | "ship_speed";

/** The seven weighted dimensions. Keys match ScoreBreakdown and BASE_WEIGHTS. */
export type ScoreDimension =
  | "stack"
  | "missions"
  | "cleanPass"
  | "projects"
  | "consistency"
  | "interview"
  | "experience";

/**
 * Which dimensions the open pool can actually produce evidence for.
 *
 * A cohort on day 4 has no graded projects and no completed interviews — not
 * because its members are weak, but because those days have not happened. A
 * dimension marked uncovered is dropped from the weighting entirely and its
 * share redistributed, so nobody is scored against evidence they were never
 * given the chance to create. See `reweight` in score-candidate.ts.
 */
export type EvidenceCoverage = {
  dimensions: Record<ScoreDimension, boolean>;
  /** Recruiter-facing sentence explaining what is missing and why. */
  note: string;
};

/** A dimension the pool cannot produce scores `null`, never `0` — the audit
 *  trail must distinguish "no evidence possible" from "evidence, and it was
 *  bad". */
export type ScoreBreakdown = {
  stack: number | null;
  missions: number | null;
  cleanPass: number | null;
  projects: number | null;
  consistency: number | null;
  interview: number | null;
  experience: number | null;
  weights: Record<string, number>;
  total: number;
  /** Which dimensions carried weight for this score, for the card's note. */
  dimensionsUsed: ScoreDimension[];
};

export type MatchTier = "STRONG" | "PARTIAL" | "NONE";

/**
 * Everything ABTalks knows about one candidate, with a provenance on every
 * field — the single object that scoring, the agent's retrieval tools, the
 * match card and admin all read from.
 *
 * Deliberately absent: full name, email, phone, employer, resume URL, profile
 * links and the interview transcript. Contact data is released only through an
 * accepted `TalentEngagementRequest` (see features/hire/contact-access.ts), so
 * it must not be assembled here where four different surfaces would then have
 * to remember to strip it.
 */
export type CandidateDossier = {
  publicId: string;
  source: "PROGRAM" | "CHALLENGE_60";
  programMemberId: string | null;
  userId: string | null;

  roleFamily: Fact<RoleFamily>;
  rawRoleLabel: Fact<string>;
  yearsExperience: Fact<number>;
  education: Fact<{
    level: string | null;
    university: string | null;
    gradYear: number | null;
  }>;
  declaredSkills: Fact<string[]>;
  /** Booleans, never URLs — "has a GitHub" is a signal, the address is contact
   *  data. */
  links: Fact<{ linkedin: boolean; github: boolean; resume: boolean }>;

  evidence: {
    /** Missions passed by doing them. Excludes the days waived at enrolment. */
    missionsPassed: Fact<number>;
    missionsAttempted: Fact<number>;
    /** Waived days, reported separately so the count is never mistaken for
     *  work. */
    missionsWaived: Fact<number>;
    cleanPassCount: Fact<number>;
    cleanPassPct: Fact<number>;
    commitDays: Fact<number>;
    activeDaysSpan: Fact<number>;
    lastActiveAt: Fact<string | null>;
    projectScores: Fact<number[]>;
    interview: Fact<{
      overall: number | null;
      comm: number | null;
      tech: number | null;
      problem: number | null;
    } | null>;
    /** Languages of the mission days they actually passed. */
    workingLanguages: Fact<string[]>;
    missionTypesPassed: Fact<string[]>;
    cohortProgress: Fact<{ day: number; ofDays: number }>;
  };

  compensation: {
    /** What the candidate told us, when they told us. Beats any estimate. */
    declared: { min: number; max: number; currency: string } | null;
    estimate: CompensationBand | null;
  };

  availability: AvailabilitySnapshot;
};

export type CandidateEvidence = {
  skills: string[];
  yearsExperience: number;
  missionPoints: number;
  /** Earned passes. `missionPoints` includes the waived start days; this does
   *  not. Quote this one to recruiters. */
  missionsPassed: number;
  missionsAttempted: number;
  missionsWaived: number;
  cleanPassCount: number;
  commitDayCount: number;
  /** Languages of the mission days they passed — verifiable, unlike the
   *  self-declared skill list. */
  workingLanguages: string[];
  /** Which day the member's cohort is on, so every figure above can be read
   *  against how much time there has been to earn it. */
  cohortDay: number;
  projectScores: number[];
  interview: {
    overall: number | null;
    comm: number | null;
    tech: number | null;
    problem: number | null;
  } | null;
  totalScore: number;
  jobRole: string;
  company: string;
};

export type AvailabilitySnapshot = {
  openToWork: boolean;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  salaryCurrency: string;
  noticePeriodDays: number | null;
  preferredWorkMode: string | null;
  preferredCities: string[];
  openToRelocate: boolean;
} | null;

export type ScoreableMember = {
  id: string;
  userId: string;
  fullName: string;
  jobRole: string;
  company: string;
  yearsExperience: number;
  skills: string[];
  missionPoints: number;
  cleanPassCount: number;
  totalScore: number;
  commitDayCount: number;
  projectScores: number[];
  interview: CandidateEvidence["interview"];
  hasVisibilityConsent: boolean;
  cohortPublished: boolean;
  status: "ENROLLED" | "COMPLETED" | string;
  availability: AvailabilitySnapshot;
  /**
   * Missions passed by doing them, and attempts made.
   *
   * `missionPoints` cannot answer this. Days 1–3 are waived at enrolment
   * (`{reason: "cohort_start_day", waived: true}`) and still award points, so a
   * member who has done nothing carries 36 points and a clean-pass count of 3.
   * Ranking on that figure puts people who never opened a mission above people
   * who passed twenty.
   */
  missionsPassed: number;
  missionsAttempted: number;
  /**
   * Which calendar day the member's cohort is on. Mission and commit
   * expectations scale to it, so a day-4 cohort is not judged against a
   * finished one.
   */
  cohortDay: number;
  /** The assembled dossier, when the caller built one. Scoring does not need
   *  it; the card, the agent's tools and admin all do. */
  dossier?: CandidateDossier;
};

export type ScoredCandidate = {
  programMemberId: string;
  userId: string;
  fullName: string;
  jobRole: string;
  company: string;
  score: number;
  tier: MatchTier;
  scoreBreakdown: ScoreBreakdown;
  evidence: CandidateEvidence;
  gaps: string[];
  availabilityUnknown: boolean;
  hardFiltered: boolean;
  hardFilterReasons: string[];
  /** Present when the caller assembled one. Carries no identity by
   *  construction — see CandidateDossier. */
  dossier?: CandidateDossier;
};
