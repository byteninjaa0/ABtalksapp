/**
 * EXPECTED (canonical oracle) vs ACTUAL (the real recruiter-search pipeline),
 * candidate by candidate, with every disagreement classified.
 *
 * Two halves:
 *
 *  - `evaluateSpec` runs the service's own selection over a loaded pool —
 *    `selectSearchResults`, the one function `searchCandidates` calls — and
 *    keeps the full ranking alongside the page. The probe asserts its page
 *    equals `searchCandidates`' page, so this cannot silently drift from
 *    production.
 *
 *  - `CaseAccumulator` consumes canonical candidates one at a time (the audit
 *    streams them in batches, so memory is bounded by the pool plus a capped
 *    sample of IDs, never by the candidate table) and classifies:
 *
 *      FP not eligible by the gate      → VISIBILITY_ERROR (critical)
 *      FP / FN that a field drift explains → SEARCH_INDEX_STALE
 *      FN never loaded, track at its cap → PAGINATION_ERROR (pool cap)
 *      FN never loaded otherwise        → SEARCH_INDEX_MISSING
 *      disagreement only under safe normalization → NORMALIZATION_ERROR
 *      anything else                    → SEARCH_FILTER_ERROR
 *
 *    A candidate whose own data is suspect but who is handled correctly is a
 *    PASS with a DATA_QUALITY_ERROR note — never a search failure.
 *
 * PURE.
 */
import type { JobSpec } from "@/lib/validations/hire";
import {
  __test as scoreInternals,
  selectSearchResults,
} from "@/features/hire/score-candidate";
import { readPoolExtra } from "@/features/hire/pool-brief";
import type {
  EvidenceCoverage,
  ScoreableMember,
  ScoredCandidate,
} from "@/features/hire/types";
import {
  eligibility,
  type CanonicalCandidate,
  type PoolCohort,
  type SearchEnv,
  type TrackSlug,
} from "@/features/search-qa/canonical";
import {
  DECIDABLE_FILTERS,
  describeFilters,
  filterById,
  specFor,
  type AppliedFilter,
  type Diagnosis,
  type OracleDecision,
} from "@/features/search-qa/filter-registry";
import { cachedDataQualityIssues, issuesRelevantTo } from "@/features/search-qa/data-quality";
import {
  IdSample,
  type QaCategory,
  type QaFinding,
  type Severity,
} from "@/features/search-qa/types";
import { knownIssue, type KnownIssueId } from "@/features/search-qa/known-issues";

/* ── the pool, as loaded by the service ──────────────────────────────────── */

export type TrackLoadInfo = {
  slug: string;
  count: number;
  cap: number | null;
  /** The loader returned exactly its cap, so rows beyond it were never read. */
  truncated: boolean;
  userIds: string[];
};

export type PoolSnapshot = {
  key: string;
  members: ScoreableMember[];
  coverage: EvidenceCoverage;
  loads: TrackLoadInfo[];
  /** userIds present more than once AFTER the service's own dedupe. */
  duplicateUserIds: string[];
};

export type PipelineConstants = {
  minResults: number;
  defaultLimit: number;
};

export type SpecEvaluation = {
  spec: JobSpec;
  ranked: ScoredCandidate[];
  byUser: Map<string, ScoredCandidate>;
  memberByUser: Map<string, ScoreableMember>;
  /** Passes every hard filter and every required skill, at any rank. */
  admitted: Set<string>;
  /** What `searchCandidates` returns: the page, in order. */
  page: ScoredCandidate[];
  /** Admitted but tier NONE — shown only as padding. A ranking outcome, not a filter one. */
  belowThreshold: Set<string>;
};

export function mustHaveSatisfied(spec: JobSpec, skills: string[]): boolean {
  return (spec.mustHaveStack ?? []).every((t) =>
    scoreInternals.stackTokensMatch(skills, t),
  );
}

export function evaluateSpec(
  pool: PoolSnapshot,
  spec: JobSpec,
  k: PipelineConstants,
  opts: { limit?: number } = {},
): SpecEvaluation {
  const extra = readPoolExtra(spec);
  const hardCap = extra.resultLimit;
  const limit = hardCap ?? opts.limit ?? k.defaultLimit;
  const { ranked, matches: page } = selectSearchResults(pool.members, spec, {
    coverage: pool.coverage,
    hardCap,
    limit,
    minResults: k.minResults,
  });

  const byUser = new Map<string, ScoredCandidate>();
  const admitted = new Set<string>();
  const belowThreshold = new Set<string>();
  for (const r of ranked) {
    const key = r.userId || r.candidateRef;
    byUser.set(key, r);
    if (!r.hardFiltered && mustHaveSatisfied(spec, r.evidence.skills ?? [])) {
      admitted.add(key);
      if (r.tier === "NONE") belowThreshold.add(key);
    }
  }
  const memberByUser = new Map(
    pool.members.map((m) => [m.userId || m.candidateRef || m.id, m]),
  );

  return {
    spec,
    ranked,
    byUser,
    memberByUser,
    admitted,
    page,
    belowThreshold,
  };
}

/* ── cases ───────────────────────────────────────────────────────────────── */

export type CaseKind = "SINGLE" | "PAIR" | "TRIPLE" | "COMPLEX" | "RANDOM" | "MULTI_VALUE" | "BOUNDARY";

export type SpecCase = {
  id: string;
  kind: CaseKind;
  filters: AppliedFilter[];
  /** Track slugs the case restricts to; empty = every enabled track. */
  tracks: string[];
  minEvidenceDays: number;
  /** Rank-only fields added to prove they do not change who is admitted. */
  rankOnly?: AppliedFilter[];
  criticality: "CORE" | "SECONDARY";
};

export function caseSpec(c: SpecCase): JobSpec {
  const pool: AppliedFilter[] = [];
  if (c.tracks.length) pool.push({ id: "tracks", value: c.tracks });
  if (c.minEvidenceDays > 0) pool.push({ id: "minEvidenceDays", value: c.minEvidenceDays });
  return specFor([...pool, ...c.filters, ...(c.rankOnly ?? [])]);
}

export function poolKey(c: Pick<SpecCase, "tracks" | "minEvidenceDays">): string {
  return `${[...c.tracks].sort().join(",") || "*"}|${c.minEvidenceDays}`;
}

export function caseLabel(c: SpecCase): string {
  const parts = [describeFilters(c.filters)];
  if (c.tracks.length) parts.push(`tracks [${c.tracks.join(", ")}]`);
  if (c.minEvidenceDays > 0) parts.push(`≥${c.minEvidenceDays} days`);
  if (c.rankOnly?.length) parts.push(describeFilters(c.rankOnly));
  return parts.join(" + ");
}

export type CaseResult = {
  id: string;
  kind: CaseKind;
  label: string;
  criticality: "CORE" | "SECONDARY";
  filterIds: string[];
  expected: number;
  actual: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  ambiguous: number;
  /** |E ∩ A| / |E ∪ A|; 1 when both are empty. */
  accuracy: number;
  /** Failures not explained by a pinned known issue or a product decision. */
  status: "PASS" | "FAIL" | "XFAIL" | "WARN";
  findings: QaFinding[];
  falsePositiveIds: string[];
  falseNegativeIds: string[];
  /** FP + FN explained by the candidate's own data, not by search. */
  explainedByData: number;
  /** Admitted candidates the page can never show (no pagination). */
  beyondPage: number;
};

type Bucket = {
  category: QaCategory;
  severity: Severity;
  searchVerdict: "PASS" | "FAIL";
  cause: string;
  message: string;
  knownIssue?: KnownIssueId;
  productDecision?: boolean;
  sample: IdSample;
};

function severityFor(d: Diagnosis): Severity {
  const pinned = d.knownIssue ? knownIssue(d.knownIssue) : null;
  if (pinned) return pinned.severity;
  if (d.category === "VISIBILITY_ERROR") return "CRITICAL";
  if (d.category === "NORMALIZATION_ERROR" || d.searchVerdict === "PASS") return "WARNING";
  return "ERROR";
}

export class CaseAccumulator {
  private tp = 0;
  private fpIds = new IdSample();
  private fnIds = new IdSample();
  private ambiguousIds = new IdSample();
  private expectedCount = 0;
  private seen = new Set<string>();
  private buckets = new Map<string, Bucket>();
  private unknownAvailability = new IdSample();
  private dataQualityOnReturned = new IdSample();

  constructor(
    readonly spec: SpecCase,
    private readonly evaluation: SpecEvaluation,
    private readonly pool: PoolSnapshot,
    private readonly env: SearchEnv,
    private readonly cohorts: ReadonlyMap<string, PoolCohort>,
  ) {}

  private bucket(d: Diagnosis, side: "FP" | "FN", userId: string): void {
    const key = `${d.category}|${d.cause}|${side}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        category: d.category,
        severity: severityFor(d),
        searchVerdict: d.searchVerdict ?? "FAIL",
        cause: d.cause,
        message: `${side === "FP" ? "Unexpected result" : "Missing result"}: ${d.message}`,
        knownIssue: d.knownIssue,
        productDecision: d.productDecision,
        sample: new IdSample(),
      };
      this.buckets.set(key, b);
    }
    b.sample.add(userId);
  }

  observe(c: CanonicalCandidate): void {
    if (this.seen.has(c.userId)) return;
    this.seen.add(c.userId);

    const e = eligibility(c, this.env, this.cohorts, {
      tracks: this.spec.tracks,
      minEvidenceDays: this.spec.minEvidenceDays,
    });
    const actual = this.evaluation.admitted.has(c.userId);

    let expected = e.eligible;
    let amb: string | null = null;
    const oracleByFilter = new Map<string, OracleDecision>();
    if (expected) {
      for (const f of this.spec.filters) {
        const def = filterById(f.id);
        if (!def?.oracle) continue;
        const o = def.oracle(c, f.value);
        oracleByFilter.set(f.id, o);
        if (o.ambiguous) amb = o.ambiguous;
        else if (!o.pass) expected = false;
        if (f.id === "openToWork" && o.unstated) this.unknownAvailability.add(c.userId);
      }
    }
    if (amb && expected !== false) {
      this.ambiguousIds.add(c.userId);
      return;
    }
    if (!e.eligible && !actual) return;

    if (expected) this.expectedCount += 1;
    if (expected && actual) {
      this.tp += 1;
      const dq = issuesRelevantTo(cachedDataQualityIssues(c), this.spec.filters.map((f) => f.id));
      if (dq.length > 0) this.dataQualityOnReturned.add(c.userId);
      return;
    }
    if (expected === actual) return;

    const side: "FP" | "FN" = actual ? "FP" : "FN";
    if (side === "FP") this.fpIds.add(c.userId);
    else this.fnIds.add(c.userId);
    this.bucket(this.diagnose(c, e, side, oracleByFilter), side, c.userId);
  }

  private diagnose(
    c: CanonicalCandidate,
    e: ReturnType<typeof eligibility>,
    side: "FP" | "FN",
    oracleByFilter: Map<string, OracleDecision>,
  ): Diagnosis {
    if (side === "FP" && e.gate.length > 0) {
      return {
        category: "VISIBILITY_ERROR",
        cause: `NEVER_APPEAR_${e.gate[0]}`,
        message: `candidate must never appear (${e.gate.join(", ")}) but was returned`,
      };
    }
    if (side === "FP" && e.tracks.length === 0) {
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "TRACK_RULE",
        message: `returned from a track the canonical rules do not admit for [${this.spec.tracks.join(", ") || "all tracks"}]`,
      };
    }

    const member = this.evaluation.memberByUser.get(c.userId);
    const scored = this.evaluation.byUser.get(c.userId);
    if (side === "FN" && (!member || !scored)) {
      return absenceDiagnosis(e.tracks, this.pool);
    }
    if (!member || !scored) {
      return { category: "UNKNOWN", cause: "NO_DOCUMENT", message: "returned without a loaded document" };
    }

    for (const f of this.spec.filters) {
      const def = filterById(f.id);
      if (!def?.oracle || !def.service || !def.diagnose) continue;
      const o = oracleByFilter.get(f.id) ?? def.oracle(c, f.value);
      const s = def.service(scored, f.value);
      if (o.pass !== s.pass) return def.diagnose(c, member, f.value, o, s);
    }
    return {
      category: "UNKNOWN",
      cause: "UNEXPLAINED",
      message: `oracle and service agree on every filter yet disagree on the result (hard: ${scored.hardFilterReasons.join("; ") || "none"})`,
    };
  }

  /**
   * Close the case. `lookup` must hold the canonical row of every admitted
   * candidate the stream did not visit (the audit fetches them by id); anyone
   * still unseen has no canonical user at all.
   */
  finish(lookup: ReadonlyMap<string, CanonicalCandidate>): CaseResult {
    for (const userId of this.evaluation.admitted) {
      if (this.seen.has(userId)) continue;
      const c = lookup.get(userId);
      if (c) {
        this.observe(c);
        continue;
      }
      this.seen.add(userId);
      this.fpIds.add(userId);
      this.bucket(
        { category: "UNKNOWN", cause: "NO_CANONICAL_USER", message: "returned candidate has no canonical user row" },
        "FP",
        userId,
      );
    }

    const findings: QaFinding[] = [];
    const label = caseLabel(this.spec);
    for (const b of this.buckets.values()) {
      findings.push({
        category: b.category,
        severity: b.severity,
        searchVerdict: b.searchVerdict,
        check: `case:${this.spec.id}`,
        affected: b.sample.count,
        userIds: b.sample.ids,
        message: `${label} · ${b.message}`,
        knownIssue: b.knownIssue,
        productDecision: b.productDecision,
        detail: { cause: b.cause },
      });
    }
    if (this.unknownAvailability.count > 0) {
      findings.push({
        category: "SEARCH_FILTER_ERROR",
        severity: "WARNING",
        searchVerdict: "PASS",
        check: `case:${this.spec.id}`,
        affected: this.unknownAvailability.count,
        userIds: this.unknownAvailability.ids,
        message: `${label} · "open to work only" included ${this.unknownAvailability.count} candidate(s) who never stated availability`,
        productDecision: true,
        detail: { cause: "OPEN_TO_WORK_UNKNOWN_INCLUDED" },
      });
    }
    if (this.dataQualityOnReturned.count > 0) {
      findings.push({
        category: "DATA_QUALITY_ERROR",
        severity: "INFO",
        searchVerdict: "PASS",
        check: `case:${this.spec.id}`,
        affected: this.dataQualityOnReturned.count,
        userIds: this.dataQualityOnReturned.ids,
        message: `${label} · correctly returned, but the filtered field itself looks wrong on these profiles`,
        detail: { cause: "SUSPECT_VALUE_ON_RETURNED_CANDIDATE" },
      });
    }
    if (this.ambiguousIds.count > 0) {
      findings.push({
        category: "NORMALIZATION_ERROR",
        severity: "INFO",
        searchVerdict: "PASS",
        check: `case:${this.spec.id}`,
        affected: this.ambiguousIds.count,
        userIds: this.ambiguousIds.ids,
        message: `${label} · semantics undecidable for these candidates (excluded from scoring)`,
        productDecision: true,
        detail: { cause: "AMBIGUOUS_SEMANTICS" },
      });
    }


    const fp = this.fpIds.count;
    const fn = this.fnIds.count;
    const actualCount = this.evaluation.admitted.size;
    const union = this.tp + fp + fn;
    const blocking = findings.filter(
      (f) => f.searchVerdict === "FAIL" && !f.productDecision && f.severity !== "INFO",
    );
    const status: CaseResult["status"] =
      blocking.length === 0
        ? findings.some((f) => f.productDecision || f.severity === "WARNING")
          ? "WARN"
          : "PASS"
        : blocking.every((f) => f.knownIssue)
          ? "XFAIL"
          : "FAIL";

    return {
      id: this.spec.id,
      kind: this.spec.kind,
      label,
      criticality: this.spec.criticality,
      filterIds: this.spec.filters.map((f) => f.id),
      expected: this.expectedCount,
      actual: actualCount,
      truePositives: this.tp,
      falsePositives: fp,
      falseNegatives: fn,
      ambiguous: this.ambiguousIds.count,
      accuracy: union === 0 ? 1 : Math.round((this.tp / union) * 1000) / 1000,
      status,
      findings,
      falsePositiveIds: this.fpIds.ids,
      falseNegativeIds: this.fnIds.ids,
      explainedByData: [...this.buckets.values()].filter((b) => b.searchVerdict === "PASS").reduce((n, b) => n + b.sample.count, 0),
      beyondPage: Math.max(0, actualCount - this.evaluation.page.length),
    };
  }
}

function absenceDiagnosis(expectedTracks: TrackSlug[], pool: PoolSnapshot): Diagnosis {
  const loads = expectedTracks
    .map((t) => pool.loads.find((l) => l.slug === t))
    .filter((l): l is TrackLoadInfo => Boolean(l));
  if (loads.length > 0 && loads.every((l) => l.truncated)) {
    return {
      category: "PAGINATION_ERROR",
      cause: "POOL_CAP",
      message: `eligible via ${expectedTracks.join(", ")} but every such track was loaded to its cap (${loads.map((l) => `${l.slug} ${l.count}/${l.cap}`).join(", ")}). Rows past the cap are never searched`,
    };
  }
  return {
    category: "SEARCH_INDEX_MISSING",
    cause: "NOT_LOADED",
    message: `eligible via ${expectedTracks.join(", ") || "no track"} but the track loaders never returned them`,
  };
}

/** Run a case against an in-memory canonical population (offline suite, admin lite mode). */
export function runCase(
  spec: SpecCase,
  pool: PoolSnapshot,
  population: readonly CanonicalCandidate[],
  env: SearchEnv,
  cohorts: ReadonlyMap<string, PoolCohort>,
  k: PipelineConstants,
): { result: CaseResult; evaluation: SpecEvaluation } {
  const evaluation = evaluateSpec(pool, caseSpec(spec), k);
  const acc = new CaseAccumulator(spec, evaluation, pool, env, cohorts);
  for (const c of population) acc.observe(c);
  const lookup = new Map(population.map((c) => [c.userId, c]));
  return { result: acc.finish(lookup), evaluation };
}

/**
 * Rank-only fields must never change who is admitted. Returns the userIds whose
 * admission flipped when they were added.
 */
export function rankOnlyChangesAdmission(
  pool: PoolSnapshot,
  base: SpecCase,
  k: PipelineConstants,
): string[] {
  if (!base.rankOnly?.length) return [];
  const without = evaluateSpec(pool, caseSpec({ ...base, rankOnly: [] }), k).admitted;
  const withRank = evaluateSpec(pool, caseSpec(base), k).admitted;
  const flipped: string[] = [];
  for (const id of new Set([...without, ...withRank])) {
    if (without.has(id) !== withRank.has(id)) flipped.push(id);
  }
  return flipped;
}

export { DECIDABLE_FILTERS };
