import type { JobAlertCriteria, MatchableJob } from "./types";

function toLowerTrim(s: string): string {
  return s.trim().toLowerCase();
}

function containsAny(jobSkills: string[], criteriaSkills: string[]): boolean {
  const set = new Set(jobSkills.map(toLowerTrim).filter(Boolean));
  for (const raw of criteriaSkills) {
    const s = toLowerTrim(raw);
    if (s && set.has(s)) return true;
  }
  return false;
}

/**
 * Pure rule-based matcher. Returns true iff the job satisfies every set
 * criterion. An unset criterion is a wildcard — an `enabled: true` alert with
 * empty skills and null everywhere else matches every published job. This is
 * intentional; the UI copy documents it.
 *
 * The function does not know about job status; the caller (fanout) already
 * gates on the first DRAFT→PUBLISHED transition, so a DRAFT never reaches
 * here.
 */
export function matches(
  job: MatchableJob,
  criteria: JobAlertCriteria,
): boolean {
  if (!criteria.enabled) return false;

  if (criteria.skills.length > 0) {
    if (!containsAny(job.skills, criteria.skills)) return false;
  }

  if (criteria.role) {
    const needle = toLowerTrim(criteria.role);
    if (needle && !toLowerTrim(job.title).includes(needle)) return false;
  }

  if (criteria.location) {
    const needle = toLowerTrim(criteria.location);
    if (!needle) {
      // whitespace-only criterion is a wildcard
    } else {
      const haystack = job.location ? toLowerTrim(job.location) : "";
      if (!haystack || !haystack.includes(needle)) return false;
    }
  }

  if (criteria.workMode && job.workMode !== criteria.workMode) return false;

  if (criteria.opportunityType && job.type !== criteria.opportunityType) {
    return false;
  }

  return true;
}
