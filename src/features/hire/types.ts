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

export type ScoreBreakdown = {
  stack: number;
  missions: number;
  cleanPass: number;
  projects: number;
  consistency: number;
  interview: number;
  experience: number;
  weights: Record<string, number>;
  total: number;
};

export type MatchTier = "STRONG" | "PARTIAL" | "NONE";

export type CandidateEvidence = {
  skills: string[];
  yearsExperience: number;
  missionPoints: number;
  cleanPassCount: number;
  commitDayCount: number;
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
};
