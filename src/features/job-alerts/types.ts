import type { JobType, JobWorkMode } from "@prisma/client";

/**
 * Candidate-authored alert criteria. All null / empty fields are wildcards —
 * `enabled: true` with everything else empty matches every published job.
 * `skills` uses case-insensitive intersect, `role` / `location` are
 * case-insensitive substring matches, `workMode` / `opportunityType` are
 * exact enum matches. Rule-based only; no scoring, no ranking.
 */
export type JobAlertCriteria = {
  enabled: boolean;
  skills: string[];
  role: string | null;
  location: string | null;
  workMode: JobWorkMode | null;
  opportunityType: JobType | null;
};

/** Row shape the service returns to callers. */
export type JobAlertRow = JobAlertCriteria & {
  id: string;
  candidateUserId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Minimal job shape the matcher and fanout consume. Deliberately narrower
 * than `JobRow` so tests can build fixtures without every field.
 */
export type MatchableJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobWorkMode | null;
  type: JobType;
  skills: string[];
};
