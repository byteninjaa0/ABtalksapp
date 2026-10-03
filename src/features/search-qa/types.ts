/**
 * The vocabulary every recruiter-search check reports in.
 *
 * The one rule this file exists to enforce: a finding says WHO is at fault. A
 * candidate who typed the wrong skill and is correctly returned for it is a
 * data problem and recruiter search PASSES. A candidate whose search document
 * says React while the canonical profile says Python is an index problem and
 * recruiter search FAILS. Collapsing those two is how a QA report stops being
 * trusted, so `searchVerdict` is required on every finding rather than
 * inferred from the category later.
 *
 * DELIBERATELY PURE: no Prisma, no `server-only`. The offline suite and the
 * admin page both import it.
 */

export const QA_CATEGORIES = [
  "SEARCH_FILTER_ERROR",
  "SEARCH_INDEX_MISSING",
  "SEARCH_INDEX_STALE",
  "SEARCH_INDEX_DUPLICATE",
  "DATA_QUALITY_ERROR",
  "NORMALIZATION_ERROR",
  "RANKING_ERROR",
  "VISIBILITY_ERROR",
  "PAGINATION_ERROR",
  "SORT_ERROR",
  "PERMISSION_ERROR",
  "UNKNOWN",
] as const;

export type QaCategory = (typeof QA_CATEGORIES)[number];

export type Severity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

export type SearchVerdict = "PASS" | "FAIL";

/** How many IDs a single finding carries. The count is always the true total. */
export const MAX_IDS_PER_FINDING = 25;

export type QaFinding = {
  category: QaCategory;
  severity: Severity;
  /** Does this finding mean recruiter search is wrong? Data findings never do. */
  searchVerdict: SearchVerdict;
  /** Stable id of the check that produced it, e.g. `filter:workMode=REMOTE`. */
  check: string;
  /** True number of affected candidates, never capped. */
  affected: number;
  /** Up to MAX_IDS_PER_FINDING user ids, for debugging. */
  userIds: string[];
  message: string;
  /** `PRODUCT DECISION REQUIRED` findings are reported, never counted as failures. */
  productDecision?: boolean;
  /** Known-issue id when this finding is a pinned, already-reported bug. */
  knownIssue?: string;
  detail?: Record<string, unknown>;
};

/** A capped id collector that still counts everything it is offered. */
export class IdSample {
  readonly ids: string[] = [];
  count = 0;
  constructor(private readonly cap = MAX_IDS_PER_FINDING) {}
  add(id: string): void {
    this.count += 1;
    if (this.ids.length < this.cap) this.ids.push(id);
  }
}

export type CheckStatus = "PASS" | "FAIL" | "WARN" | "XFAIL" | "SKIPPED";

export type Readiness = "READY" | "READY_WITH_WARNINGS" | "NOT_READY";

/**
 * Readiness from findings, with the reasons that decided it.
 *
 * NOT_READY on any failing search finding at ERROR or above — including pinned
 * known issues. A known issue is known, not fixed: pinning it keeps CI from
 * blocking unrelated work, it does not make recruiter search correct.
 */
export function readinessOf(findings: QaFinding[]): {
  readiness: Readiness;
  reasons: string[];
} {
  const blocking = findings.filter(
    (f) =>
      f.searchVerdict === "FAIL" &&
      !f.productDecision &&
      (f.severity === "CRITICAL" || f.severity === "ERROR"),
  );
  if (blocking.length > 0) {
    return {
      readiness: "NOT_READY",
      reasons: summariseReasons(blocking),
    };
  }
  const warnings = findings.filter(
    (f) =>
      (f.searchVerdict === "FAIL" && f.severity === "WARNING") ||
      f.productDecision ||
      (f.category === "DATA_QUALITY_ERROR" && f.severity !== "INFO"),
  );
  if (warnings.length > 0) {
    return { readiness: "READY_WITH_WARNINGS", reasons: summariseReasons(warnings) };
  }
  return { readiness: "READY", reasons: [] };
}

function summariseReasons(findings: QaFinding[]): string[] {
  const byKey = new Map<string, { n: number; affected: number; sample: string }>();
  for (const f of findings) {
    const key = `${f.category}${f.productDecision ? " (product decision)" : ""}`;
    const cur = byKey.get(key) ?? { n: 0, affected: 0, sample: f.message };
    cur.n += 1;
    cur.affected += f.affected;
    byKey.set(key, cur);
  }
  return [...byKey.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .map(
      ([key, v]) =>
        `${v.n} ${key} finding${v.n === 1 ? "" : "s"} (${v.affected} candidate-level hits), e.g. ${v.sample}`,
    );
}

export function percentile(sortedMs: number[], p: number): number | null {
  if (sortedMs.length === 0) return null;
  const idx = Math.min(
    sortedMs.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedMs.length) - 1),
  );
  return Math.round(sortedMs[idx]! * 10) / 10;
}
