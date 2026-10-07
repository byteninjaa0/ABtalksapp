import "server-only";

import type { ScoreableMember } from "@/features/hire/types";
import { encodeCandidateRef } from "@/features/hire/candidate-ref";
import {
  resolveEligibleCandidates,
  resolveInspectorCandidate,
} from "@/features/hire/pool-policy";
import {
  countPopulation,
  fetchCanonicalCandidates,
  iterateCanonicalCandidates,
  listCohortsForAudit,
  normalizationInputs,
  orphanCollegeReferences,
  persistedResultHealth,
  programMembersWithoutProfile,
  sampleNeverAppearUsers,
  sampleUsableProfilesWithoutVisibilityRow,
  searchValueStats,
  type PopulationCounts,
} from "@/repositories/search-audit";
import { __test as scoreInternals } from "@/features/hire/score-candidate";
import {
  eligibility,
  type CanonicalCandidate,
  type PoolCohort,
  type SearchEnv,
} from "@/features/search-qa/canonical";
import { buildCases, type ValueStats } from "@/features/search-qa/combinations";
import {
  CaseAccumulator,
  caseSpec,
  evaluateSpec,
  poolKey,
  rankOnlyChangesAdmission,
  type CaseResult,
  type SpecCase,
  type SpecEvaluation,
} from "@/features/search-qa/compare";
import {
  DuplicateAccountDetector,
  dataQualityIssues,
  healthOf,
  TEST_EMAIL_DOMAINS,
  type DataQualityRule,
} from "@/features/search-qa/data-quality";
import { explainFromPool, type ExplainResult } from "@/features/search-qa/explain";
import { FILTERS, type AppliedFilter } from "@/features/search-qa/filter-registry";
import { documentDrift } from "@/features/search-qa/index-consistency";
import { getCandidateDiscoverability } from "@/features/admin/get-candidate-discoverability";
import {
  clusterValues,
  describeCityCluster,
  describeSkillCluster,
  normalizeCity,
  normalizeDegree,
  normalizeWorkMode,
  isPickerWorkMode,
  skillClusterKey,
  squash,
  type NormalizationCluster,
} from "@/features/search-qa/normalize";
import {
  PIPELINE,
  RECRUITER_PAGE_LIMIT,
  callSearchService,
  currentSearchEnv,
  loadServicePool,
  type LoadedPool,
} from "@/features/search-qa/probe";
import {
  IdSample,
  percentile,
  readinessOf,
  type QaFinding,
  type Readiness,
  type Severity,
} from "@/features/search-qa/types";

/**
 * The production recruiter-search audit.
 *
 * READ-ONLY. Every database call is a SELECT through `repositories/search-audit`
 * or the real (read-only) search pipeline. Memory is bounded: candidates are
 * streamed in id-cursor batches and only the loaded search pool — which the
 * service itself holds in memory on every request — is kept whole.
 */

export type AuditSection =
  | "coverage"
  | "filters"
  | "combinations"
  | "index"
  | "pagination"
  | "sort"
  | "privacy"
  | "performance"
  | "data"
  | "normalization";

const TIER_RANK: Record<string, number> = { STRONG: 0, PARTIAL: 1, NONE: 2 };
const tierRank = (tier: string): number => TIER_RANK[tier] ?? 3;

export const SEARCH_SECTIONS: AuditSection[] = ["coverage", "filters", "combinations", "pagination", "sort", "privacy", "performance"];

export type AuditOptions = {
  sections: AuditSection[];
  batchSize?: number;
  seed?: number;
  randomCount?: number;
  /** Rounds of real `searchCandidates` calls per sampled spec, for latency. */
  latencyRounds?: number;
  lite?: boolean;
  onProgress?: (message: string) => void;
};

export type CheckRow = {
  id: string;
  label: string;
  status: "PASS" | "FAIL" | "WARN" | "XFAIL" | "SKIPPED";
  detail: string;
};

export type FilterHealthRow = {
  id: string;
  label: string;
  kind: string;
  criticality: string;
  status: CaseResult["status"] | "N/A";
  cases: number;
  expected: number;
  actual: number;
  falsePositives: number;
  falseNegatives: number;
  knownIssues: string[];
  implementedAt: string;
  semantics: string;
};

export type AuditReport = {
  generatedAt: string;
  durationMs: number;
  environment: {
    flags: SearchEnv;
    pipeline: { minResults: number; pageLimit: number };
    enabledTracks: string[];
    notes: string[];
  };
  population: PopulationCounts | null;
  coverage: null | {
    eligible: number;
    indexed: number;
    eligibleIndexed: number;
    coveragePct: number;
    missing: { count: number; byCause: Record<string, number>; userIds: string[] };
    duplicates: { count: number; userIds: string[] };
    invalidIndexed: { count: number; byReason: Record<string, number>; userIds: string[] };
    stale: { count: number; byCause: Record<string, number>; userIds: string[] };
    wrongTrack: { count: number; userIds: string[] };
    perTrack: { slug: string; expected: number; loaded: number; uniqueLoaded: number; cap: number | null; truncated: boolean }[];
    usableProfileNoVisibilityRow: { count: number; userIds: string[] };
  };
  filters: FilterHealthRow[];
  cases: CaseResult[];
  combinations: { kind: string; total: number; pass: number; warn: number; xfail: number; fail: number }[];
  checks: { pagination: CheckRow[]; sort: CheckRow[]; privacy: CheckRow[]; ranking: CheckRow[] };
  indexConsistency: null | {
    documents: number;
    drifted: number;
    byCause: { cause: string; category: string; count: number; userIds: string[]; example: string }[];
    persisted: Awaited<ReturnType<typeof persistedResultHealth>> | null;
  };
  performance: {
    searchLatencyMs: { p50: number | null; p95: number | null; p99: number | null; samples: number };
    poolLoadMs: { slug: string; ms: number; count: number }[];
    canonicalBatchMs: { p50: number | null; p95: number | null; batches: number; rows: number };
    slowestCases: { id: string; label: string; ms: number }[];
  };
  dataQuality: null | {
    scope: "profiles" | "searchable";
    profiles: number;
    healthy: number;
    warnings: number;
    invalid: number;
    rules: { rule: DataQualityRule; severity: Severity; count: number; userIds: string[]; example: string }[];
    duplicateAccounts: { kind: string; groups: number; userIds: string[] }[];
    orphanCollegeRefs: { count: number; userIds: string[] } | null;
  };
  normalization: null | {
    entities: {
      entity: string;
      searchImpact: boolean;
      distinct: number;
      clusters: NormalizationCluster[];
      note?: string;
    }[];
  };
  findings: QaFinding[];
  readiness: { readiness: Readiness; reasons: string[] };
};

function emptyReport(env: SearchEnv): AuditReport {
  return {
    generatedAt: new Date().toISOString(),
    durationMs: 0,
    environment: {
      flags: env,
      pipeline: { minResults: PIPELINE.minResults, pageLimit: RECRUITER_PAGE_LIMIT },
      enabledTracks: [],
      notes: [],
    },
    population: null,
    coverage: null,
    filters: [],
    cases: [],
    combinations: [],
    checks: { pagination: [], sort: [], privacy: [], ranking: [] },
    indexConsistency: null,
    performance: {
      searchLatencyMs: { p50: null, p95: null, p99: null, samples: 0 },
      poolLoadMs: [],
      canonicalBatchMs: { p50: null, p95: null, batches: 0, rows: 0 },
      slowestCases: [],
    },
    dataQuality: null,
    normalization: null,
    findings: [],
    readiness: { readiness: "READY", reasons: [] },
  };
}

const finding = (f: Omit<QaFinding, "userIds" | "affected"> & { sample: IdSample }): QaFinding => {
  const { sample, ...rest } = f;
  return { ...rest, affected: sample.count, userIds: sample.ids };
};

class Buckets {
  private map = new Map<string, { sample: IdSample; example: string; category: string }>();
  add(key: string, userId: string, example = "", category = ""): void {
    let b = this.map.get(key);
    if (!b) {
      b = { sample: new IdSample(), example, category };
      this.map.set(key, b);
    }
    b.sample.add(userId);
  }
  entries() {
    return [...this.map.entries()].sort((a, b) => b[1].sample.count - a[1].sample.count);
  }
  counts(): Record<string, number> {
    return Object.fromEntries(this.entries().map(([k, v]) => [k, v.sample.count]));
  }
  total(): number {
    return this.entries().reduce((n, [, v]) => n + v.sample.count, 0);
  }
  ids(): string[] {
    return this.entries().flatMap(([, v]) => v.sample.ids).slice(0, 25);
  }
}

export async function runRecruiterSearchAudit(opts: AuditOptions): Promise<AuditReport> {
  const started = performance.now();
  const say = opts.onProgress ?? (() => {});
  const want = new Set(opts.sections);
  const env = currentSearchEnv();
  const report = emptyReport(env);
  const findings: QaFinding[] = [];

  const needsPool = ["coverage", "filters", "combinations", "index", "pagination", "sort", "privacy", "performance"].some((s) => want.has(s as AuditSection));

  let cohorts: Map<string, PoolCohort> = new Map();
  const pools = new Map<string, LoadedPool>();
  let base: LoadedPool | null = null;

  if (needsPool) {
    say("population counts");
    report.population = await countPopulation();
    cohorts = await listCohortsForAudit();
    say("loading the search pool through the real track loaders");
    base = await loadServicePool([], 0);
    pools.set(base.pool.key, base);
    report.performance.poolLoadMs = base.timings.map((t) => ({ ...t, ms: Math.round(t.ms) }));
    report.environment.enabledTracks = base.pool.loads.map((l) => l.slug);
    if (!env.challengePool.enabled) {
      report.environment.notes.push("HIRE_CHALLENGE_POOL is off: the CLAUDE and CHALLENGE_60 tracks are not searchable in this environment.");
    }
    if (env.openCohortIds == null) {
      report.environment.notes.push("HIRE_OPEN_COHORT_IDS is unset: only cohorts with published results are searchable.");
    }
    report.environment.notes.push(
      "Search documents read CandidateProfile / CandidateVisibility / ProgramEnrollment. ENABLE_NEW_TALENT is a report label only.",
    );
  }

  /* ── cases ─────────────────────────────────────────────────────────────── */

  const runCases = want.has("filters") || want.has("combinations");
  const accumulators: { spec: SpecCase; acc: CaseAccumulator; ev: SpecEvaluation; ms: number }[] = [];
  if (runCases && base) {
    const stats = await searchValueStats();
    const valueStats: ValueStats = {
      skills: stats.skills,
      cities: stats.cities,
      tracks: base.pool.loads.filter((l) => l.count > 0).map((l) => l.slug),
    };
    let cases = buildCases(valueStats, { lite: opts.lite, seed: opts.seed, randomCount: opts.randomCount });
    if (!want.has("combinations")) cases = cases.filter((c) => c.kind === "SINGLE" || c.kind === "BOUNDARY" || c.kind === "MULTI_VALUE");
    if (!want.has("filters")) cases = cases.filter((c) => !(c.kind === "SINGLE" || c.kind === "BOUNDARY"));
    say(`evaluating ${cases.length} search cases`);
    for (const c of cases) {
      const key = poolKey(c);
      let loaded = pools.get(key);
      if (!loaded) {
        loaded = await loadServicePool(c.tracks, c.minEvidenceDays);
        pools.set(key, loaded);
      }
      const t0 = performance.now();
      const ev = evaluateSpec(loaded.pool, caseSpec(c), PIPELINE);
      const ms = performance.now() - t0;
      accumulators.push({ spec: c, acc: new CaseAccumulator(c, ev, loaded.pool, env, cohorts), ev, ms });
    }
  }

  /* ── one streaming pass over every searchable candidate ─────────────────── */

  const poolUserIds = new Set<string>();
  for (const p of pools.values()) for (const m of p.pool.members) poolUserIds.add(m.userId);
  const canonicalForPool = new Map<string, CanonicalCandidate>();
  const baseMembers = new Map<string, ScoreableMember>(base ? base.pool.members.map((m) => [m.userId, m]) : []);

  const coverage = {
    eligible: 0,
    eligibleIndexed: 0,
    missing: new Buckets(),
    wrongTrack: new IdSample(),
    perTrackExpected: new Map<string, number>(),
  };
  const dqSearchable = { profiles: 0, healthy: 0, warnings: 0, invalid: 0, rules: new Map<DataQualityRule, { severity: Severity; sample: IdSample; example: string }>() };
  const batchMs: number[] = [];
  let batchRows = 0;

  if (needsPool) {
    say("streaming canonical searchable candidates");
    for await (const batch of iterateCanonicalCandidates({
      scope: "searchable",
      batchSize: opts.batchSize,
      onBatch: (ms, rows) => {
        batchMs.push(ms);
        batchRows += rows;
      },
    })) {
      for (const c of batch) {
        if (poolUserIds.has(c.userId)) canonicalForPool.set(c.userId, c);
        for (const a of accumulators) a.acc.observe(c);

        const e = eligibility(c, env, cohorts);
        if (e.eligible) {
          coverage.eligible += 1;
          for (const t of e.tracks) coverage.perTrackExpected.set(t, (coverage.perTrackExpected.get(t) ?? 0) + 1);
          const m = baseMembers.get(c.userId);
          if (m) {
            coverage.eligibleIndexed += 1;
            if (!(e.tracks as readonly string[]).includes(m.source ?? "")) coverage.wrongTrack.add(c.userId);
          } else {
            const truncated = e.tracks.every((t) => base!.pool.loads.find((l) => l.slug === t)?.truncated);
            coverage.missing.add(truncated ? "POOL_CAP" : "NOT_LOADED", c.userId);
          }
        }
        if (opts.lite && c.profile) {
          const issues = dataQualityIssues(c);
          dqSearchable.profiles += 1;
          const h = healthOf(issues);
          if (h === "HEALTHY") dqSearchable.healthy += 1;
          else if (h === "WARNING") dqSearchable.warnings += 1;
          else dqSearchable.invalid += 1;
          for (const i of issues) {
            const cur = dqSearchable.rules.get(i.rule) ?? { severity: i.severity, sample: new IdSample(), example: i.message };
            cur.sample.add(c.userId);
            dqSearchable.rules.set(i.rule, cur);
          }
        }
      }
    }
    const unseen = [...poolUserIds].filter((id) => !canonicalForPool.has(id));
    if (unseen.length) {
      const fetched = await fetchCanonicalCandidates(unseen);
      for (const [id, c] of fetched) canonicalForPool.set(id, c);
    }
  }
  report.performance.canonicalBatchMs = {
    p50: percentile([...batchMs].sort((a, b) => a - b), 50),
    p95: percentile([...batchMs].sort((a, b) => a - b), 95),
    batches: batchMs.length,
    rows: batchRows,
  };

  /* ── coverage ──────────────────────────────────────────────────────────── */

  if (want.has("coverage") && base) {
    const invalid = new Buckets();
    for (const m of base.pool.members) {
      const c = canonicalForPool.get(m.userId);
      if (!c) {
        invalid.add("NO_CANONICAL_USER", m.userId);
        continue;
      }
      const e = eligibility(c, env, cohorts);
      if (e.gate.length > 0) invalid.add(e.gate[0]!, m.userId);
    }
    const noRow = report.population!.usableProfileWithoutVisibilityRow;
    const noRowIds = noRow > 0 ? await sampleUsableProfilesWithoutVisibilityRow() : [];
    report.coverage = {
      eligible: coverage.eligible,
      indexed: base.pool.members.length,
      eligibleIndexed: coverage.eligibleIndexed,
      coveragePct: coverage.eligible === 0 ? 100 : Math.round((coverage.eligibleIndexed / coverage.eligible) * 10000) / 100,
      missing: { count: coverage.missing.total(), byCause: coverage.missing.counts(), userIds: coverage.missing.ids() },
      duplicates: { count: base.pool.duplicateUserIds.length, userIds: base.pool.duplicateUserIds.slice(0, 25) },
      invalidIndexed: { count: invalid.total(), byReason: invalid.counts(), userIds: invalid.ids() },
      stale: { count: 0, byCause: {}, userIds: [] },
      wrongTrack: { count: coverage.wrongTrack.count, userIds: coverage.wrongTrack.ids },
      perTrack: base.pool.loads.map((l) => ({
        slug: l.slug,
        expected: coverage.perTrackExpected.get(l.slug) ?? 0,
        loaded: l.count,
        uniqueLoaded: new Set(l.userIds).size,
        cap: l.cap,
        truncated: l.truncated,
      })),
      usableProfileNoVisibilityRow: { count: noRow, userIds: noRowIds },
    };
    for (const [cause, v] of coverage.missing.entries()) {
      findings.push(finding({
        category: cause === "POOL_CAP" ? "PAGINATION_ERROR" : "SEARCH_INDEX_MISSING",
        severity: "CRITICAL",
        searchVerdict: "FAIL",
        check: "coverage:missing",
        sample: v.sample,
        message: cause === "POOL_CAP"
          ? `${v.sample.count} eligible candidate(s) are never searched because their track is loaded to its cap`
          : `${v.sample.count} eligible candidate(s) are not returned by any track loader`,
        detail: { cause },
      }));
    }
    for (const l of base.pool.loads) {
      const unique = new Set(l.userIds).size;
      if (unique < l.count) {
        const seenIds = new Set<string>();
        const s = new IdSample();
        for (const id of l.userIds) {
          if (seenIds.has(id)) s.add(id);
          seenIds.add(id);
        }
        findings.push(finding({
          category: "SEARCH_INDEX_DUPLICATE",
          severity: "INFO",
          searchVerdict: "PASS",
          check: `coverage:track-duplicates:${l.slug}`,
          sample: s,
          message: `${l.slug} loads ${l.count} documents for ${unique} people (one per enrolment); mergeTrackLoads keeps the strongest, so no duplicate reaches a recruiter`,
        }));
      }
    }
    if (base.pool.duplicateUserIds.length) {
      const s = new IdSample();
      base.pool.duplicateUserIds.forEach((id) => s.add(id));
      findings.push(finding({ category: "SEARCH_INDEX_DUPLICATE", severity: "ERROR", searchVerdict: "FAIL", check: "coverage:duplicates", sample: s, message: "the same person is loaded more than once after dedupe" }));
    }
    for (const [reason, v] of invalid.entries()) {
      findings.push(finding({ category: "VISIBILITY_ERROR", severity: "CRITICAL", searchVerdict: "FAIL", check: "coverage:invalid-indexed", sample: v.sample, message: `${v.sample.count} candidate(s) who must never appear (${reason}) are in the search pool`, detail: { reason } }));
    }
    if (coverage.wrongTrack.count) {
      findings.push(finding({ category: "SEARCH_INDEX_STALE", severity: "WARNING", searchVerdict: "FAIL", check: "coverage:wrong-track", sample: coverage.wrongTrack, message: "loaded under a track the canonical rules do not assign them" }));
    }
    if (noRow > 0) {
      const s = new IdSample();
      noRowIds.forEach((id) => s.add(id));
      s.count = noRow;
      findings.push(finding({
        category: "VISIBILITY_ERROR",
        severity: "WARNING",
        searchVerdict: "PASS",
        check: "coverage:no-visibility-row",
        sample: s,
        productDecision: true,
        message: `PRODUCT DECISION REQUIRED: ${noRow} candidate(s) have a usable profile but no CandidateVisibility row, so search hides them (plan 117 expected profile-only discoverability). Since 2026-09-17 a row is created on the candidate's next name or skill save (repositories/discovery-record.ts); these existing profiles need that save or a backfill`,
      }));
    }
  }

  /* ── cases → results ───────────────────────────────────────────────────── */

  if (accumulators.length) {
    for (const a of accumulators) {
      const r = a.acc.finish(canonicalForPool);
      report.cases.push(r);
      findings.push(...r.findings);
      if (a.spec.rankOnly?.length) {
        const loaded = pools.get(poolKey(a.spec))!;
        const flipped = rankOnlyChangesAdmission(loaded.pool, a.spec, PIPELINE);
        if (flipped.length) {
          const s = new IdSample();
          flipped.forEach((id) => s.add(id));
          findings.push(finding({ category: "SEARCH_FILTER_ERROR", severity: "ERROR", searchVerdict: "FAIL", check: `case:${a.spec.id}`, sample: s, message: `${r.label}: a rank-only field changed who is admitted` }));
        }
      }
    }
    report.performance.slowestCases = [...accumulators]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 5)
      .map((a) => ({ id: a.spec.id, label: report.cases.find((c) => c.id === a.spec.id)?.label ?? a.spec.id, ms: Math.round(a.ms * 10) / 10 }));

    report.filters = FILTERS.map((def): FilterHealthRow => {
      const related = report.cases.filter(
        (c) => (c.kind === "SINGLE" || c.kind === "BOUNDARY" || c.kind === "MULTI_VALUE") &&
          (c.filterIds.includes(def.id) || (def.id === "tracks" && c.label.includes("tracks [") && c.filterIds.length === 0) || (def.id === "minEvidenceDays" && c.label.includes("days") && c.filterIds.length === 0)),
      );
      const status = related.length === 0
        ? "N/A"
        : related.some((c) => c.status === "FAIL") ? "FAIL"
        : related.some((c) => c.status === "XFAIL") ? "XFAIL"
        : related.some((c) => c.status === "WARN") ? "WARN" : "PASS";
      return {
        id: def.id,
        label: def.label,
        kind: def.kind,
        criticality: def.criticality,
        status,
        cases: related.length,
        expected: related.reduce((n, c) => n + c.expected, 0),
        actual: related.reduce((n, c) => n + c.actual, 0),
        falsePositives: related.reduce((n, c) => n + c.falsePositives, 0),
        falseNegatives: related.reduce((n, c) => n + c.falseNegatives, 0),
        knownIssues: [...new Set(related.flatMap((c) => c.findings.map((x) => x.knownIssue).filter((x): x is string => Boolean(x))))],
        implementedAt: def.semantics.implementedAt,
        semantics: `${def.semantics.logic} · ${def.semantics.match} · null: ${def.semantics.nullPolicy}`,
      };
    });

    const kinds = [...new Set(report.cases.map((c) => c.kind))];
    report.combinations = kinds.map((kind) => {
      const list = report.cases.filter((c) => c.kind === kind);
      return {
        kind,
        total: list.length,
        pass: list.filter((c) => c.status === "PASS").length,
        warn: list.filter((c) => c.status === "WARN").length,
        xfail: list.filter((c) => c.status === "XFAIL").length,
        fail: list.filter((c) => c.status === "FAIL").length,
      };
    });
  }

  /* ── index consistency ─────────────────────────────────────────────────── */

  if ((want.has("index") || want.has("coverage")) && base) {
    const byCause = new Map<string, { category: string; sample: IdSample; example: string; knownIssue?: string; productDecision?: boolean; severity: Severity }>();
    const drifted = new IdSample();
    for (const m of base.pool.members) {
      const c = canonicalForPool.get(m.userId);
      if (!c) continue;
      const drift = documentDrift(c, m);
      if (drift.length) drifted.add(m.userId);
      for (const d of drift) {
        const key = `${d.field}:${d.cause}`;
        const cur = byCause.get(key) ?? { category: d.category, sample: new IdSample(), example: `${d.field}: canonical ${d.canonical} → document ${d.document}`, knownIssue: d.knownIssue, productDecision: d.productDecision, severity: d.severity };
        cur.sample.add(m.userId);
        byCause.set(key, cur);
      }
    }
    const persisted = want.has("index") ? await persistedResultHealth() : null;
    report.indexConsistency = {
      documents: base.pool.members.length,
      drifted: drifted.count,
      byCause: [...byCause.entries()].map(([cause, v]) => ({ cause, category: v.category, count: v.sample.count, userIds: v.sample.ids, example: v.example })),
      persisted,
    };
    if (report.coverage) {
      report.coverage.stale = {
        count: drifted.count,
        byCause: Object.fromEntries([...byCause.entries()].map(([k, v]) => [k, v.sample.count])),
        userIds: drifted.ids,
      };
    }
    for (const [cause, v] of byCause) {
      findings.push(finding({
        category: v.category as QaFinding["category"],
        severity: v.severity,
        searchVerdict: v.category === "DATA_QUALITY_ERROR" || (v.category === "RANKING_ERROR" && v.severity === "INFO") ? "PASS" : "FAIL",
        check: `index:${cause}`,
        sample: v.sample,
        message: `search document disagrees with the canonical profile (${cause}), e.g. ${v.example}`,
        knownIssue: v.knownIssue,
        productDecision: v.productDecision,
      }));
    }
    if (persisted) {
      if (persisted.matchesForUnsearchable > 0) {
        const s = new IdSample();
        persisted.unsearchableSample.forEach((id) => s.add(id));
        s.count = persisted.matchesForUnsearchable;
        findings.push(finding({ category: "SEARCH_INDEX_STALE", severity: "INFO", searchVerdict: "PASS", check: "index:persisted-unsearchable", sample: s, message: `${persisted.matchesForUnsearchable} saved match row(s) point at candidates no longer searchable. loadRequestMatches re-gates them on read` }));
      }
      if (persisted.enrollmentDomainMismatch > 0) {
        const s = new IdSample();
        s.count = persisted.enrollmentDomainMismatch;
        findings.push(finding({ category: "DATA_QUALITY_ERROR", severity: "WARNING", searchVerdict: "PASS", check: "index:enrollment-domain", sample: s, message: "Enrollment.domain differs from its Challenge.domain, and the challenge loader filters on one and labels by the other" }));
      }
    }
  }

  /* ── pagination ────────────────────────────────────────────────────────── */

  const latencies: number[] = [];
  if (want.has("pagination") && base) {
    const rows: CheckRow[] = report.checks.pagination;
    let pageViolations = 0;
    for (const a of accumulators) {
      const ids = a.ev.page.map((p) => p.userId);
      const limit = a.ev.spec.extra && typeof (a.ev.spec.extra as Record<string, unknown>).resultLimit === "number"
        ? ((a.ev.spec.extra as Record<string, unknown>).resultLimit as number)
        : RECRUITER_PAGE_LIMIT;
      if (ids.length > limit || new Set(ids).size !== ids.length || ids.some((id) => !a.ev.admitted.has(id))) pageViolations += 1;
    }
    rows.push({ id: "page-shape", label: "Page ≤ limit, no duplicates, every card admitted", status: pageViolations ? "FAIL" : "PASS", detail: `${accumulators.length} cases, ${pageViolations} violation(s)` });

    const sampled = accumulators.filter((a) => a.spec.criticality === "CORE").slice(0, opts.lite ? 1 : 10);
    let drift = 0;
    const driftIds: string[] = [];
    for (const a of sampled) {
      const call = await callSearchService(a.ev.spec);
      latencies.push(call.ms);
      const probe = a.ev.page.map((p) => p.candidateRef);
      if (!call.ok || call.refs.join(",") !== probe.join(",")) {
        drift += 1;
        driftIds.push(a.spec.id);
      }
    }
    rows.push({
      id: "probe-matches-service",
      label: "Audit probe page is identical to searchCandidates() (same refs, same order)",
      status: drift ? "FAIL" : "PASS",
      detail: drift ? `drift on ${driftIds.join(", ")} . Audit results for these cases are not trustworthy` : `${sampled.length} specs compared`,
    });
    if (drift) {
      const s = new IdSample();
      findings.push(finding({ category: "UNKNOWN", severity: "CRITICAL", searchVerdict: "FAIL", check: "pagination:probe-drift", sample: s, message: `probe and searchCandidates disagree on ${driftIds.join(", ")} (data changed mid-audit, or the pipeline changed without the probe)` }));
    }

    if (!opts.lite) {
      const spec = caseSpec({ id: "det", kind: "SINGLE", filters: [], tracks: [], minEvidenceDays: 0, criticality: "CORE" });
      const first = await callSearchService(spec);
      const second = await callSearchService(spec);
      latencies.push(first.ms, second.ms);
      rows.push({ id: "stable-order", label: "Repeated identical search returns the same order", status: first.refs.join() === second.refs.join() ? "PASS" : "FAIL", detail: `${first.refs.length} cards` });

      for (const n of [1, 5, 25]) {
        const call = await callSearchService({ extra: { resultLimit: n } });
        latencies.push(call.ms);
        rows.push({ id: `result-limit-${n}`, label: `resultLimit ${n} caps the page`, status: call.refs.length <= n ? "PASS" : "FAIL", detail: `${call.refs.length} returned` });
      }
    }

    const unscoped = accumulators.find((a) => a.spec.filters.length === 0 && a.spec.tracks.length === 0 && a.spec.minEvidenceDays === 0);
    if (unscoped && unscoped.ev.admitted.size > unscoped.ev.page.length) {
      const hidden = unscoped.ev.admitted.size - unscoped.ev.page.length;
      const s = new IdSample();
      unscoped.ev.ranked.filter((r) => unscoped.ev.admitted.has(r.userId) && !unscoped.ev.page.some((p) => p.userId === r.userId)).forEach((r) => s.add(r.userId));
      findings.push(finding({ category: "PAGINATION_ERROR", severity: "WARNING", searchVerdict: "FAIL", check: "pagination:top-n", sample: s, productDecision: true, message: `PRODUCT DECISION REQUIRED: search is top-${RECRUITER_PAGE_LIMIT} with no page 2: ${hidden} of ${unscoped.ev.admitted.size} candidates cannot be reached by an unfiltered search` }));
      rows.push({ id: "top-n", label: "Every admitted candidate reachable across pages", status: "WARN", detail: `no pagination: ${hidden} admitted candidates beyond the page` });
    }
    const persisted = report.indexConsistency?.persisted ?? (await persistedResultHealth());
    rows.push({ id: "session-duplicates", label: "Saved search sessions hold no duplicate candidate ids", status: persisted.sessionsWithDuplicateIds ? "FAIL" : "PASS", detail: `${persisted.sessionsWithDuplicateIds} session(s)` });
    if (persisted.sessionsWithDuplicateIds) {
      const s = new IdSample();
      persisted.sessionDuplicateSample.forEach((id) => s.add(id));
      findings.push(finding({ category: "PAGINATION_ERROR", severity: "ERROR", searchVerdict: "FAIL", check: "pagination:session-duplicates", sample: s, message: "saved search sessions contain duplicate candidate ids (ids are session ids)" }));
    }
    rows.push({ id: "cursor-offset", label: "Out-of-range page / cursor / offset", status: "SKIPPED", detail: "not applicable, the search API has no page, offset or cursor parameter" });
  }

  /* ── sort ──────────────────────────────────────────────────────────────── */

  if (want.has("sort") && base) {
    const rows = report.checks.sort;
    let broken = 0;
    for (const a of accumulators) {
      for (let i = 1; i < a.ev.page.length; i++) {
        const x = a.ev.page[i - 1]!;
        const y = a.ev.page[i]!;
        if (tierRank(x.tier) > tierRank(y.tier)) broken += 1;
        else if (x.tier === y.tier && x.tier !== "NONE" && x.score < y.score) broken += 1;
      }
    }
    rows.push({ id: "score-desc", label: "Relevance (the only sort): tier, then score descending", status: broken ? "FAIL" : "PASS", detail: `${accumulators.length} pages checked, ${broken} inversion(s)` });
    const call = await callSearchService({});
    latencies.push(call.ms);
    let inversions = 0;
    for (let i = 1; i < call.scores.length; i++) {
      const tierStep = tierRank(call.tiers[i - 1]!) - tierRank(call.tiers[i]!);
      if (tierStep > 0) inversions += 1;
      else if (tierStep === 0 && call.scores[i - 1]! < call.scores[i]!) inversions += 1;
      else if (tierStep === 0 && call.scores[i - 1] === call.scores[i] && call.tiebreak[i - 1]!.localeCompare(call.tiebreak[i]!) > 0) inversions += 1;
    }
    rows.push({ id: "service-order", label: "searchCandidates() page is tier, score desc, then name/ref", status: inversions ? "FAIL" : "PASS", detail: `${call.scores.length} cards` });
    const persisted = report.indexConsistency?.persisted ?? (await persistedResultHealth());
    rows.push({ id: "saved-ties", label: "Saved match lists order ties deterministically", status: "PASS", detail: `${persisted.scoreTieGroups} (request, score) tie group(s); loadRequestMatches breaks them by first seen, then candidate id (asserted by test:recruiter-search)` });
    rows.push({ id: "other-sorts", label: "Newest / experience / completion / evidence sorts", status: "SKIPPED", detail: "not implemented, recruiter search exposes a single relevance order" });
  }

  /* ── privacy ───────────────────────────────────────────────────────────── */

  if (want.has("privacy") && base) {
    const rows = report.checks.privacy;
    const invalid = report.coverage?.invalidIndexed.count ?? 0;
    rows.push({ id: "pool-leaks", label: "No deleted / disabled / hidden / withdrawn / anonymized candidate in the pool", status: invalid ? "FAIL" : "PASS", detail: `${invalid} leak(s)` });
    const caseLeaks = report.cases.flatMap((c) => c.findings.filter((x) => x.category === "VISIBILITY_ERROR"));
    rows.push({ id: "result-leaks", label: "No never-appear candidate returned by any search case", status: caseLeaks.length ? "FAIL" : "PASS", detail: `${report.cases.length} cases` });

    const never = await sampleNeverAppearUsers(opts.lite ? 15 : 40);
    const refs: string[] = [];
    for (const u of never) {
      for (const src of ["CLAUDE", "CHALLENGE_60", "HACKATHON", "PROFILE"]) refs.push(encodeCandidateRef(src, u.userId));
      for (const id of u.programMemberIds) refs.push(encodeCandidateRef("PROGRAM", id));
    }
    const resolved = refs.length ? await resolveEligibleCandidates(refs) : [];
    let inspectorLeaks = 0;
    const leakIds = new IdSample();
    for (const r of resolved) leakIds.add(r.userId);
    for (const ref of refs.slice(0, opts.lite ? 30 : 200)) {
      const hit = await resolveInspectorCandidate(ref);
      if (hit) {
        inspectorLeaks += 1;
        leakIds.add(hit.userId);
      }
    }
    rows.push({
      id: "forged-refs",
      label: "Forged candidate refs for hidden people cannot be shortlisted or inspected (direct API bypass)",
      status: resolved.length || inspectorLeaks ? "FAIL" : "PASS",
      detail: `${never.length} hidden people × ${refs.length} refs → ${resolved.length} shortlistable, ${inspectorLeaks} inspectable`,
    });
    if (resolved.length || inspectorLeaks) {
      findings.push(finding({ category: "VISIBILITY_ERROR", severity: "CRITICAL", searchVerdict: "FAIL", check: "privacy:forged-refs", sample: leakIds, message: "a constructed candidate ref resolves for a person who must never be discoverable" }));
    }

    const roleIds = new IdSample();
    const testIds = new IdSample();
    for (const m of base.pool.members) {
      const c = canonicalForPool.get(m.userId);
      if (!c) continue;
      if (c.role !== "STUDENT") roleIds.add(c.userId);
      if (c.emailDomain && TEST_EMAIL_DOMAINS.has(c.emailDomain)) testIds.add(c.userId);
    }
    rows.push({ id: "non-candidate-roles", label: "Recruiter / admin accounts are not searchable candidates", status: roleIds.count ? "WARN" : "PASS", detail: `${roleIds.count} in pool` });
    if (roleIds.count) {
      findings.push(finding({ category: "VISIBILITY_ERROR", severity: "ERROR", searchVerdict: "FAIL", check: "privacy:roles", sample: roleIds, productDecision: true, message: `PRODUCT DECISION REQUIRED: ${roleIds.count} RECRUITER/ADMIN account(s) are in the candidate pool; searchableUserWhere has no role rule` }));
    }
    rows.push({ id: "test-accounts", label: "No test-domain accounts in the candidate pool", status: testIds.count ? "WARN" : "PASS", detail: `${testIds.count} in pool` });
    if (testIds.count) {
      findings.push(finding({ category: "DATA_QUALITY_ERROR", severity: "CRITICAL", searchVerdict: "PASS", check: "privacy:test-accounts", sample: testIds, message: "test-domain accounts are recruiter-searchable" }));
    }

    if (!opts.lite) {
      // The admin "Recruiter search" panel answers the same question as this
      // audit. Run its real loader for every searchable candidate and require
      // the same verdict — a second explanation that disagrees is how admins
      // get misinformed (QA-KI-011, fixed 2026-09-17).
      const ids = [...canonicalForPool.keys()];
      const disagree = new IdSample();
      for (let i = 0; i < ids.length; i += 5) {
        const batch = ids.slice(i, i + 5);
        const verdicts = await Promise.all(batch.map((id) => getCandidateDiscoverability(id)));
        batch.forEach((id, j) => {
          const c = canonicalForPool.get(id)!;
          const panel = verdicts[j];
          if (panel && panel.appears !== eligibility(c, env, cohorts).eligible) disagree.add(id);
        });
      }
      rows.push({ id: "admin-panel", label: "Admin \"Recruiter search\" panel agrees with search eligibility", status: disagree.count ? "FAIL" : "PASS", detail: `${ids.length} candidates compared, ${disagree.count} disagreement(s)` });
      if (disagree.count) {
        findings.push(finding({ category: "VISIBILITY_ERROR", severity: "WARNING", searchVerdict: "FAIL", check: "privacy:admin-panel", sample: disagree, message: "the admin discoverability panel's verdict disagrees with the search loaders for these candidates" }));
      }
    }

    const sample = await callSearchService({ extra: { resultLimit: 25 } });
    latencies.push(sample.ms);
    const payloadLeak = /[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/|github\.com\/|linkedin\.com\/in|(?<!\d)[6-9]\d{9}(?!\d)/i.test(sample.publicJson);
    rows.push({ id: "payload", label: "Browser payload (toPublicMatch) carries no email, phone or profile URL", status: payloadLeak ? "FAIL" : "PASS", detail: `${sample.refs.length} cards scanned` });
    if (payloadLeak) {
      findings.push(finding({ category: "VISIBILITY_ERROR", severity: "CRITICAL", searchVerdict: "FAIL", check: "privacy:payload", sample: new IdSample(), message: "a recruiter-facing match card contains contact-shaped data" }));
    }
    rows.push({ id: "recruiter-auth", label: "Unauthorized / deleted / expired recruiter", status: "SKIPPED", detail: "needs a session, covered offline by test:recruiter-search source scan and npm run test:demo1-security" });
  }

  /* ── performance ───────────────────────────────────────────────────────── */

  if (want.has("performance") && base) {
    const rounds = opts.latencyRounds ?? (opts.lite ? 0 : 2);
    const specs = accumulators.filter((a) => a.spec.criticality === "CORE").slice(0, 8).map((a) => a.ev.spec);
    for (let r = 0; r < rounds; r++) {
      for (const s of specs) latencies.push((await callSearchService(s)).ms);
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    report.performance.searchLatencyMs = {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      samples: sorted.length,
    };
  }

  /* ── ranking (live) ────────────────────────────────────────────────────── */

  if (want.has("filters") && accumulators.length) {
    const rows = report.checks.ranking;
    const invariance = findings.filter((x) => x.message.includes("rank-only field changed"));
    rows.push({ id: "rank-only", label: "Experience / seniority / nice-to-have / priority / role never change who is admitted", status: invariance.length ? "FAIL" : "PASS", detail: `${accumulators.filter((a) => a.spec.rankOnly?.length).length} cases` });
    const unscoped = accumulators.find((a) => a.spec.filters.length === 0 && a.spec.tracks.length === 0 && a.spec.minEvidenceDays === 0);
    if (unscoped) {
      const strong = unscoped.ev.ranked.filter((r) => r.tier === "STRONG");
      const unproven = unscoped.ev.ranked.filter((r) => r.tier !== "STRONG" && r.evidence.missionsPassed === 0 && !r.hardFiltered);
      const worstStrong = strong.length ? Math.max(...strong.map((r) => unscoped.ev.ranked.indexOf(r))) : -1;
      const outranking = new IdSample();
      for (const u of unproven) if (unscoped.ev.ranked.indexOf(u) < worstStrong) outranking.add(u.userId);
      rows.push({ id: "evidence-over-claims", label: "Evidence-backed (STRONG) candidates rank above evidence-free ones", status: outranking.count ? "FAIL" : "PASS", detail: `${outranking.count} evidence-free candidate(s) rank above at least one STRONG candidate` });
      if (outranking.count) {
        findings.push(finding({ category: "RANKING_ERROR", severity: "ERROR", searchVerdict: "FAIL", check: "ranking:evidence-over-claims", sample: outranking, message: "declared-skills-only candidates outrank evidence-backed STRONG candidates in an unfiltered search" }));
      }
    }
  }

  /* ── data quality ──────────────────────────────────────────────────────── */

  if (want.has("data")) {
    say("streaming every candidate profile for data quality");
    const rules = new Map<DataQualityRule, { severity: Severity; sample: IdSample; example: string }>();
    const dup = new DuplicateAccountDetector();
    let profiles = 0;
    let healthy = 0;
    let warnings = 0;
    let invalid = 0;
    for await (const batch of iterateCanonicalCandidates({ scope: "profiles", batchSize: opts.batchSize })) {
      for (const c of batch) {
        profiles += 1;
        const issues = dataQualityIssues(c);
        const h = healthOf(issues);
        if (h === "HEALTHY") healthy += 1;
        else if (h === "WARNING") warnings += 1;
        else invalid += 1;
        for (const i of issues) {
          const cur = rules.get(i.rule) ?? { severity: i.severity, sample: new IdSample(), example: i.message };
          if (i.severity === "CRITICAL") cur.severity = "CRITICAL";
          cur.sample.add(c.userId);
          rules.set(i.rule, cur);
        }
        dup.observe(c);
      }
    }
    const dupGroups = dup.duplicates();
    const byKind = new Map<string, { groups: number; ids: string[] }>();
    for (const g of dupGroups) {
      const cur = byKind.get(g.kind) ?? { groups: 0, ids: [] };
      cur.groups += 1;
      if (cur.ids.length < 25) cur.ids.push(...g.userIds.slice(0, 25 - cur.ids.length));
      byKind.set(g.kind, cur);
    }
    const orphans = await orphanCollegeReferences();
    report.dataQuality = {
      scope: "profiles",
      profiles,
      healthy,
      warnings,
      invalid,
      rules: [...rules.entries()].map(([rule, v]) => ({ rule, severity: v.severity, count: v.sample.count, userIds: v.sample.ids, example: v.example })).sort((a, b) => b.count - a.count),
      duplicateAccounts: [...byKind.entries()].map(([kind, v]) => ({ kind, groups: v.groups, userIds: v.ids })),
      orphanCollegeRefs: orphans,
    };
    const membersNoProfile = await programMembersWithoutProfile();
    if (membersNoProfile) report.environment.notes.push(`${membersNoProfile} enrolled cohort member(s) have no CandidateProfile, their cards fall back to legacy ProgramMember fields.`);
  } else if (opts.lite && dqSearchable.profiles > 0) {
    report.dataQuality = {
      scope: "searchable",
      profiles: dqSearchable.profiles,
      healthy: dqSearchable.healthy,
      warnings: dqSearchable.warnings,
      invalid: dqSearchable.invalid,
      rules: [...dqSearchable.rules.entries()].map(([rule, v]) => ({ rule, severity: v.severity, count: v.sample.count, userIds: v.sample.ids, example: v.example })).sort((a, b) => b.count - a.count),
      duplicateAccounts: [],
      orphanCollegeRefs: null,
    };
  }
  if (report.dataQuality) {
    for (const r of report.dataQuality.rules) {
      if (r.severity === "INFO") continue;
      const s = new IdSample();
      r.userIds.forEach((id) => s.add(id));
      s.count = r.count;
      findings.push(finding({ category: "DATA_QUALITY_ERROR", severity: r.severity, searchVerdict: "PASS", check: `data:${r.rule}`, sample: s, message: `${r.count} profile(s): ${r.example}` }));
    }
  }

  /* ── normalization ─────────────────────────────────────────────────────── */

  if (want.has("normalization")) {
    say("aggregating values for normalization");
    const n = await normalizationInputs();
    const workModeClusters: NormalizationCluster[] = n.workModes
      .filter((w) => !isPickerWorkMode(w.raw))
      .map((w) => ({
        key: squash(w.raw),
        canonical: normalizeWorkMode(w.raw) ?? "UNRECOGNISED",
        variants: [w],
        total: w.count,
        safety: normalizeWorkMode(w.raw) ? "SAFE" : "AMBIGUOUS",
      }));
    report.normalization = {
      entities: [
        {
          entity: "skills (Skill catalog rows, weighted by claims)",
          searchImpact: true,
          distinct: n.skillNames.length,
          clusters: clusterValues(n.skillNames, skillClusterKey, describeSkillCluster).slice(0, 40),
          note: "Search matches literal skill names: every cluster with more than one spelling splits recruiter results.",
        },
        {
          entity: "preferred locations",
          searchImpact: true,
          distinct: n.preferredLocations.length,
          clusters: clusterValues(n.preferredLocations, (r) => normalizeCity(r).key, describeCityCluster).slice(0, 40),
          note: "Delhi NCR / NCR / Noida / Gurugram are region-vs-city and are never merged automatically.",
        },
        {
          entity: "work mode (non-picker values)",
          searchImpact: true,
          distinct: n.workModes.length,
          clusters: workModeClusters,
          note: `Picker values (${n.workModes.filter((w) => isPickerWorkMode(w.raw)).map((w) => `${w.raw} ${w.count}`).join(", ") || "none"}) are folded to the recruiter enum by evaluateHardFilters; anything listed here is not.`,
        },
        {
          entity: "profile city (CandidateProfile.locationCity)",
          searchImpact: false,
          distinct: n.profileCities.length,
          clusters: clusterValues(n.profileCities, (r) => normalizeCity(r).key, describeCityCluster).slice(0, 25),
          note: "Not read by recruiter search today.",
        },
        {
          entity: "degrees",
          searchImpact: false,
          distinct: n.degrees.length,
          clusters: clusterValues(n.degrees, (r) => squash(normalizeDegree(r).canonical), (v) => ({ canonical: normalizeDegree(v[0]!.raw).canonical, safety: "SAFE" })).slice(0, 25),
          note: "Not a recruiter filter today; clusters use lib/candidate-vocab canonicalDegree.",
        },
        {
          entity: "institutions",
          searchImpact: false,
          distinct: n.institutions.length,
          clusters: clusterValues(n.institutions, (r) => squash(r), (v) => ({ canonical: v[0]!.raw, safety: "SAFE" })).slice(0, 25),
          note: `${n.institutionsUnlinked} education row(s) are not linked to the College catalog. Not a recruiter filter today.`,
        },
        {
          entity: "fields of study",
          searchImpact: false,
          distinct: n.fieldsOfStudy.length,
          clusters: clusterValues(n.fieldsOfStudy, (r) => squash(r), (v) => ({ canonical: v[0]!.raw, safety: "SAFE" })).slice(0, 25),
        },
        {
          entity: "job titles",
          searchImpact: false,
          distinct: n.jobTitles.length,
          clusters: clusterValues(n.jobTitles, (r) => squash(r), (v) => ({ canonical: v[0]!.raw, safety: "SAFE" })).slice(0, 25),
          note: "spec.title is not used by search.",
        },
      ],
    };
    // Only clusters search still treats as different skills count as a search
    // gap: a recruiter typing one spelling must find a candidate who claimed any
    // other. Clusters search already folds (Python / Py, C++ / CPP) are catalog
    // hygiene for prisma/scripts/dedupe-skills.ts, reported as INFO.
    const clusters = report.normalization.entities[0]!.clusters.filter((c) => c.total > 0);
    const unfolded = clusters.filter((c) =>
      c.variants.some((a) => c.variants.some((b) => a.raw !== b.raw && !scoreInternals.stackTokensMatch([a.raw], b.raw))),
    );
    const folded = clusters.length - unfolded.length;
    if (unfolded.length) {
      findings.push({
        category: "NORMALIZATION_ERROR",
        severity: "WARNING",
        searchVerdict: "FAIL",
        check: "normalization:skills",
        affected: unfolded.reduce((n2, c) => n2 + c.total, 0),
        userIds: [],
        message: `${unfolded.length} skill(s) are claimed under spellings search does not match to each other (e.g. ${unfolded.slice(0, 3).map((c) => c.variants.map((v) => v.raw).join(" / ")).join("; ")})`,
        detail: { unfolded: unfolded.map((c) => c.variants.map((v) => v.raw)) },
      });
    }
    if (folded > 0) {
      findings.push({
        category: "DATA_QUALITY_ERROR",
        severity: "INFO",
        searchVerdict: "PASS",
        check: "normalization:skills-catalog",
        affected: folded,
        userIds: [],
        message: `${folded} skill(s) exist as several catalog rows that search already matches to each other. Merge them with prisma/scripts/dedupe-skills.ts`,
      });
    }
  }

  report.findings = findings;
  report.readiness = readinessOf(findings);
  report.durationMs = Math.round(performance.now() - started);
  return report;
}

/** Explain one candidate against one search, on the live pool. */
export async function explainCandidate(input: {
  userId: string;
  filters: AppliedFilter[];
  tracks?: string[];
  minEvidenceDays?: number;
}): Promise<ExplainResult> {
  const env = currentSearchEnv();
  const [cohorts, loaded, canon] = await Promise.all([
    listCohortsForAudit(),
    loadServicePool(input.tracks ?? [], input.minEvidenceDays ?? 0),
    fetchCanonicalCandidates([input.userId]),
  ]);
  return explainFromPool({
    userId: input.userId,
    canonical: canon.get(input.userId) ?? null,
    filters: input.filters,
    tracks: input.tracks,
    minEvidenceDays: input.minEvidenceDays,
    pool: loaded.pool,
    env,
    cohorts,
    constants: PIPELINE,
  });
}
