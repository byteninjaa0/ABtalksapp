import type { JobAlertCriteria, MatchableJob } from "./types";

/**
 * Fraction of the alert's SET criteria that must pass for the alert to
 * count as matching the job. 0.60 = "if at least 60% of what I asked for
 * is true, tell me". Lower for very loose matching; raise to 1.0 for
 * strict AND behavior (T-250 spec original).
 *
 * At the current 0.60:
 *   1 criterion   → 1 must pass (100%)
 *   2 criteria    → 2 must pass (100%)
 *   3 criteria    → 2 of 3 must pass (67%)
 *   4 criteria    → 3 of 4 must pass (75%)
 *   5 criteria    → 3 of 5 must pass (60%)
 */
export const MATCH_THRESHOLD = 0.6;

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
 * Fuzzy-friendly role check. Passes when the alert's role text or any of
 * its individual words (>=3 chars) appears as a substring in the job
 * title. So "Design Head" matches "Head of Design", "Design Lead", or
 * "Senior Design Head Engineer" — but not a completely unrelated title
 * like "Backend Python Developer".
 */
function roleMatches(alertRole: string, jobTitle: string): boolean {
  const needle = toLowerTrim(alertRole);
  if (!needle) return true;
  const hay = toLowerTrim(jobTitle);
  if (!hay) return false;
  if (hay.includes(needle)) return true;
  const words = needle.split(/\s+/).filter((w) => w.length >= 3);
  return words.some((w) => hay.includes(w));
}

function locationMatches(
  criteriaLocation: string,
  jobLocation: string | null,
): boolean {
  const needle = toLowerTrim(criteriaLocation);
  if (!needle) return true;
  const hay = jobLocation ? toLowerTrim(jobLocation) : "";
  return !!hay && hay.includes(needle);
}

/**
 * Rule-based matcher. Counts the SET criteria on the alert, checks each,
 * and returns true when the pass ratio meets {@link MATCH_THRESHOLD}. An
 * alert with no criteria set (skills empty, everything else null) is
 * documented as "match every published job".
 */
export function matches(
  job: MatchableJob,
  criteria: JobAlertCriteria,
): boolean {
  if (!criteria.enabled) return false;

  const results: boolean[] = [];

  if (criteria.skills.length > 0) {
    results.push(containsAny(job.skills, criteria.skills));
  }
  if (criteria.role) {
    results.push(roleMatches(criteria.role, job.title));
  }
  if (criteria.location) {
    results.push(locationMatches(criteria.location, job.location));
  }
  if (criteria.workMode) {
    results.push(job.workMode === criteria.workMode);
  }
  if (criteria.opportunityType) {
    results.push(job.type === criteria.opportunityType);
  }

  // No set criteria = wildcard.
  if (results.length === 0) return true;

  const passed = results.filter(Boolean).length;
  const ratio = passed / results.length;
  return ratio >= MATCH_THRESHOLD;
}
