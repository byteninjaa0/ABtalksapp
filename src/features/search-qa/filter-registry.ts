/**
 * Every recruiter-search filter, as data.
 *
 * The inventory is the implementation's, not a wish list: each entry names the
 * line of code that applies it. A filter the product talks about but search
 * does not implement is listed too, as NOT_IMPLEMENTED, so "Graduation year
 * works" can never be claimed by omission.
 *
 * Adding a filter to recruiter search = adding one entry here:
 *   1. `apply`   — how a recruiter's value lands on the JobSpec the service reads.
 *   2. `oracle`  — the documented semantics over the CANONICAL candidate.
 *   3. `service` — how to read the service's own decision back off a scored row.
 *   4. `diagnose`— when they disagree, whose fault it is.
 *   5. `samples` — representative, boundary and zero-match values.
 * The comparison engine, combinations, explain mode and the admin page pick it
 * up with no other change.
 *
 * PURE.
 */
import type { JobSpec } from "@/lib/validations/hire";
import type { ScoreableMember, ScoredCandidate } from "@/features/hire/types";
import { __test as scoreInternals } from "@/features/hire/score-candidate";
import type { CanonicalCandidate } from "@/features/search-qa/canonical";
import { claimedSkillNames } from "@/features/search-qa/canonical";
import {
  documentReadsCohortSkills,
  documentReadsLegacyMirror,
  isPastedSkillList,
  splitPieces,
} from "@/features/search-qa/index-consistency";
import type { KnownIssueId } from "@/features/search-qa/known-issues";
import {
  citiesMatch,
  isNoCitySentinel,
  isPickerWorkMode,
  normKey,
  normalizeCity,
  normalizeWorkMode,
  skillMatchesToken,
  type WorkModeEnum,
} from "@/features/search-qa/normalize";
import type { QaCategory } from "@/features/search-qa/types";

export type FilterValue = string | number | boolean | string[];

export type OracleDecision = {
  pass: boolean;
  /** Set when documented semantics cannot decide — reported, never scored. */
  ambiguous: string | null;
  reason: string;
  /** The pass depended on a safe normalization the service may not perform. */
  normalized: boolean;
  /** The recruiter value is a documented "no filter" sentinel. */
  sentinel?: boolean;
  /** Candidate passed only because they never stated the field. */
  unstated?: boolean;
};

export type ServiceDecision = { pass: boolean; reason: string | null };

export type Diagnosis = {
  category: QaCategory;
  cause: string;
  message: string;
  /** Defaults to FAIL. PASS when the disagreement is the candidate's data, not search. */
  searchVerdict?: "PASS" | "FAIL";
  knownIssue?: KnownIssueId;
  productDecision?: boolean;
};

export type FilterKind = "HARD_FILTER" | "MATCH_GATE" | "POOL" | "RANK_ONLY" | "NOT_IMPLEMENTED";

export type FilterSemantics = {
  valueType: "enum" | "text" | "number" | "boolean" | "multi-text" | "range";
  logic: "SINGLE" | "AND" | "OR" | "ANY_OVERLAP" | "N/A";
  match: string;
  nullPolicy: string;
  /** Where the service applies it. */
  implementedAt: string;
  surfaces: string[];
};

export type FilterDef = {
  id: string;
  label: string;
  kind: FilterKind;
  criticality: "CORE" | "SECONDARY";
  semantics: FilterSemantics;
  /** Documented concerns that need a product owner, not a code fix. */
  productQuestions?: string[];
  apply?: (spec: JobSpec, value: FilterValue) => JobSpec;
  oracle?: (c: CanonicalCandidate, value: FilterValue) => OracleDecision;
  service?: (s: ScoredCandidate, value: FilterValue) => ServiceDecision;
  diagnose?: (
    c: CanonicalCandidate,
    m: ScoreableMember,
    value: FilterValue,
    oracle: OracleDecision,
    service: ServiceDecision,
  ) => Diagnosis;
  describe: (value: FilterValue) => string;
};

/* ── helpers ─────────────────────────────────────────────────────────────── */

const pass = (reason: string, extra: Partial<OracleDecision> = {}): OracleDecision => ({
  pass: true,
  ambiguous: null,
  reason,
  normalized: false,
  ...extra,
});
const fail = (reason: string): OracleDecision => ({
  pass: false,
  ambiguous: null,
  reason,
  normalized: false,
});
const ambiguous = (why: string): OracleDecision => ({
  pass: false,
  ambiguous: why,
  reason: why,
  normalized: false,
});

function hardReason(s: ScoredCandidate, reason: string): ServiceDecision {
  const hit = s.hardFilterReasons.includes(reason);
  return { pass: !hit, reason: hit ? reason : null };
}

function asString(v: FilterValue): string {
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function asStrings(v: FilterValue): string[] {
  return Array.isArray(v) ? v : [String(v)];
}

function withExtra(spec: JobSpec, patch: Record<string, unknown>): JobSpec {
  const prior = (spec.extra ?? {}) as Record<string, unknown>;
  return { ...spec, extra: { ...prior, ...patch } };
}

type Avail = NonNullable<ScoreableMember["availability"]>;

/** Does the search document's availability disagree with the canonical preference? */
function availabilityStale(
  c: CanonicalCandidate,
  m: ScoreableMember,
  pick: (a: Avail) => unknown,
  pickCanon: (p: NonNullable<CanonicalCandidate["preference"]>) => unknown,
): string | null {
  const doc = m.availability;
  const canon = c.preference;
  if (!doc && !canon) return null;
  if (!doc) return "document has no availability but the candidate has a preference row";
  if (!canon) return "document has availability but the candidate has no preference row";
  const a = JSON.stringify(pick(doc));
  const b = JSON.stringify(pickCanon(canon));
  return a === b ? null : `document ${a} ≠ canonical ${b}`;
}

const stale = (cause: string, message: string, knownIssue?: KnownIssueId): Diagnosis => ({
  category: "SEARCH_INDEX_STALE",
  cause,
  message,
  knownIssue,
});

/* ── the filters ─────────────────────────────────────────────────────────── */

const mustHaveSkills: FilterDef = {
  id: "mustHaveStack",
  label: "Required skills",
  kind: "MATCH_GATE",
  criticality: "CORE",
  semantics: {
    valueType: "multi-text",
    logic: "AND",
    match: "whole-word containment on skill names, case-insensitive; single letters by equality only",
    nullPolicy: "a candidate with no skills never matches a stated requirement",
    implementedAt: "src/features/hire/score-candidate.ts pickSearchMatches (+ stackTokensMatch)",
    surfaces: ["Scout chat", "filter dialog (Skills)", "guest desk"],
  },
  productQuestions: [
    "A requirement \"React\" also matches a candidate whose only skill is \"React Native\" (documented containment). Confirm that is intended.",
    "Catalog aliases apply to compound parts too: a claim of \"AI/ML\" answers a \"Machine Learning\" requirement. Confirm that is intended.",
  ],
  apply: (spec, v) => ({ ...spec, mustHaveStack: asStrings(v) }),
  oracle: (c, v) => {
    const skills = claimedSkillNames(c);
    let anyAmbiguous: string | null = null;
    let usedNormalization = false;
    for (const token of asStrings(v)) {
      const results = skills.map((s) => ({ s, r: skillMatchesToken(s, token) }));
      if (results.some((x) => x.r.literal)) continue;
      if (results.some((x) => x.r.normalized)) {
        usedNormalization = true;
        continue;
      }
      const amb = results.find((x) => x.r.ambiguous);
      if (amb) {
        anyAmbiguous = amb.r.ambiguous;
        continue;
      }
      return fail(`no claimed skill matches "${token}"`);
    }
    if (anyAmbiguous) return ambiguous(anyAmbiguous);
    return pass("every required skill is claimed", { normalized: usedNormalization });
  },
  service: (s, v) => {
    const missing = asStrings(v).filter(
      (t) => !scoreInternals.stackTokensMatch(s.evidence.skills ?? [], t),
    );
    return {
      pass: missing.length === 0,
      reason: missing.length ? `missing ${missing.join(", ")}` : null,
    };
  },
  diagnose: (c, m, v, oracle) => {
    const canon = claimedSkillNames(c);
    const doc = m.skills ?? [];
    const docLower = new Set(doc.map((s) => normKey(s)));
    if (documentReadsCohortSkills(c, m)) {
      return {
        category: "DATA_QUALITY_ERROR",
        cause: "CANONICAL_PROFILE_MISSING_COHORT_SKILLS",
        message: `cohort member claims no skills on the canonical profile; search used their cohort application skills [${doc.slice(0, 6).join(", ")}] (078 skill sync gap)`,
        searchVerdict: "PASS",
      };
    }
    if (documentReadsLegacyMirror(c, m)) {
      return stale(
        "LEGACY_MIRROR_READ",
        `the search document reads the legacy StudentProfile skills [${doc.slice(0, 6).join(", ")}], not the claimed skills [${canon.slice(0, 6).join(", ")}] (ENABLE_NEW_TALENT off)`,
      );
    }
    if (oracle.pass) {
      // Expected in, service said no.
      for (const token of asStrings(v)) {
        const matched = canon.find((s) => skillMatchesToken(s, token).literal);
        if (matched && !docLower.has(normKey(matched))) {
          const pieces = splitPieces(matched).map((p) => normKey(p));
          if (pieces.length > 1 && pieces.every((p) => !p || docLower.has(p))) {
            return stale(
              "LOADER_SPLIT_SKILL",
              `claimed skill "${matched}" was split into ${pieces.join(" + ")} in the search document`,
            );
          }
          return stale(
            "CLAIMED_SKILL_MISSING_FROM_DOCUMENT",
            `claimed skill "${matched}" is absent from the search document (document: ${doc.slice(0, 8).join(", ") || "none"})`,
          );
        }
      }
      if (oracle.normalized) {
        return {
          category: "NORMALIZATION_ERROR",
          cause: "SKILL_ALIAS_NOT_APPLIED",
          message: `requirement ${asString(v)} matches a claimed skill only through the skill catalog's aliases`,
        };
      }
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "SKILL_MATCHER_DISAGREES",
        message: `claimed skills [${canon.join(", ")}] satisfy ${asString(v)} under documented semantics but the matcher rejected them`,
      };
    }
    // Service admitted someone the oracle rejects.
    const pasted = canon.filter((s) => isPastedSkillList(s));
    for (const token of asStrings(v)) {
      const hit = doc.find((d) => scoreInternals.stackTokensMatch([d], token));
      const source = hit ? pasted.find((s) => splitPieces(s).map(normKey).includes(normKey(hit))) : undefined;
      if (hit && source) {
        return {
          category: "DATA_QUALITY_ERROR",
          cause: "PASTED_SKILL_LIST",
          message: `the claimed "skill" "${source.slice(0, 60)}" is a pasted list; search splits it and matched "${hit}"`,
          searchVerdict: "PASS",
        };
      }
    }
    const canonLower = new Set(canon.map((s) => normKey(s)));
    const unclaimed = new Set(c.skills.filter((s) => !s.claimed).map((s) => normKey(s.name)));
    for (const token of asStrings(v)) {
      const hit = doc.find((d) => scoreInternals.stackTokensMatch([d], token));
      if (!hit) continue;
      const key = normKey(hit);
      if (canonLower.has(key)) continue;
      if (unclaimed.has(key)) {
        return {
          category: "SEARCH_FILTER_ERROR",
          cause: "UNCLAIMED_SKILL_MATCHED",
          message: `matched on "${hit}", a skill the candidate withdrew (kept only for its evidence)`,
          productDecision: true,
        };
      }
      return stale(
        "DOCUMENT_SKILL_NOT_CLAIMED",
        `search document carries "${hit}" but the canonical profile does not claim it (legacy mirror or cohort fallback)`,
      );
    }
    return {
      category: "SEARCH_FILTER_ERROR",
      cause: "SKILL_MATCHER_TOO_LOOSE",
      message: `matcher admitted ${asString(v)} against [${doc.join(", ")}]`,
    };
  },
  describe: (v) => `skills ALL OF [${asStrings(v).join(", ")}]`,
};

const WORK_MODES: WorkModeEnum[] = ["REMOTE", "HYBRID", "ONSITE", "FLEXIBLE"];

const workMode: FilterDef = {
  id: "workMode",
  label: "Work mode",
  kind: "HARD_FILTER",
  criticality: "CORE",
  semantics: {
    valueType: "enum",
    logic: "SINGLE",
    match: "equal work mode; FLEXIBLE on either side matches everything",
    nullPolicy: "no preference row or no stated work mode passes",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Work mode mismatch)",
    surfaces: ["Scout chat", "filter dialog (Work mode)"],
  },
  apply: (spec, v) => ({ ...spec, workMode: String(v) as WorkModeEnum }),
  oracle: (c, v) => {
    const want = String(v) as WorkModeEnum;
    if (want === "FLEXIBLE") return pass("recruiter is flexible");
    const raw = c.preference?.remotePreference ?? null;
    if (!raw || !raw.trim()) return pass("candidate did not state a work mode", { unstated: true });
    const have = normalizeWorkMode(raw);
    if (!have) return ambiguous(`unrecognised work mode "${raw}"`);
    if (have === "FLEXIBLE" || have === want) {
      return pass(`candidate prefers ${raw}`, { normalized: raw !== want });
    }
    return fail(`candidate prefers ${raw}, not ${want}`);
  },
  service: (s) => hardReason(s, "Work mode mismatch"),
  diagnose: (c, m, v, oracle) => {
    const drift = availabilityStale(c, m, (a) => a.preferredWorkMode, (p) => p.remotePreference);
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    const raw = c.preference?.remotePreference ?? "";
    if (oracle.pass && isPickerWorkMode(raw)) {
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "WORK_MODE_LABEL_VS_ENUM",
        message: `candidate stored the profile picker value "${raw}" and the filter did not fold it to ${String(v)}`,
      };
    }
    if (oracle.pass) {
      return {
        category: "NORMALIZATION_ERROR",
        cause: "WORK_MODE_SPELLING",
        message: `stored work mode "${raw}" means ${normalizeWorkMode(raw)} but was not normalized`,
      };
    }
    return {
      category: "SEARCH_FILTER_ERROR",
      cause: "WORK_MODE_TOO_LOOSE",
      message: `candidate prefers "${raw}" but passed a ${String(v)} filter`,
    };
  },
  describe: (v) => `work mode = ${String(v)}`,
};

const locationCity: FilterDef = {
  id: "locationCity",
  label: "Location",
  kind: "HARD_FILTER",
  criticality: "CORE",
  semantics: {
    valueType: "text",
    logic: "ANY_OVERLAP",
    match: "any preferred city matches (service: substring either way; oracle: same city or whole-word containment)",
    nullPolicy: "no preference row, empty preferred cities, or willing to relocate passes",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Location mismatch)",
    surfaces: ["Scout chat", "filter dialog (City)"],
  },
  productQuestions: [
    "CandidateProfile.locationCity (where the candidate lives) is never read by search; only preferred cities are.",
    "Delhi NCR vs Noida / Gurugram / Ghaziabad: region or city? Reported as ambiguous, not merged.",
    "A candidate who never stated preferences passes every location filter.",
  ],
  apply: (spec, v) => ({ ...spec, locationCity: String(v) }),
  oracle: (c, v) => {
    const want = String(v);
    if (isNoCitySentinel(want)) return pass("recruiter skipped the city", { sentinel: true });
    if (normalizeCity(want).nonCity) return ambiguous(`"${want}" is not a city`);
    const p = c.preference;
    if (!p) return pass("no preference row", { unstated: true });
    if (p.willingToRelocate) return pass("willing to relocate");
    if (p.preferredLocations.length === 0) return pass("no preferred cities stated", { unstated: true });
    let sawAmbiguous: string | null = null;
    for (const city of p.preferredLocations) {
      const m = citiesMatch(city, want);
      if (m === "MATCH") {
        const literal =
          normKey(city) === normKey(want) ||
          normKey(city).includes(normKey(want)) ||
          normKey(want).includes(normKey(city));
        return pass(`prefers ${city}`, { normalized: !literal });
      }
      if (m === "AMBIGUOUS") sawAmbiguous = `"${city}" vs "${want}" (region / non-city)`;
    }
    if (sawAmbiguous) return ambiguous(sawAmbiguous);
    return fail(`prefers ${p.preferredLocations.join(" / ")}, not ${want}`);
  },
  service: (s) => hardReason(s, "Location mismatch"),
  diagnose: (c, m, v, oracle) => {
    const drift = availabilityStale(
      c,
      m,
      (a) => [a.preferredCities, a.openToRelocate],
      (p) => [p.preferredLocations, p.willingToRelocate],
    );
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    if (oracle.sentinel) {
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "ANY_CITY_SENTINEL_APPLIED",
        message: `"${String(v)}" means no city but was matched as a city name`,
      };
    }
    if (oracle.pass && oracle.normalized) {
      return {
        category: "NORMALIZATION_ERROR",
        cause: "CITY_ALIAS_NOT_APPLIED",
        message: `${c.preference?.preferredLocations.join(" / ")} is the same city as ${String(v)} after safe normalization`,
      };
    }
    if (!oracle.pass) {
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "CITY_SUBSTRING_MATCH",
        message: `${c.preference?.preferredLocations.join(" / ")} matched ${String(v)} by substring, not as a city`,
      };
    }
    return {
      category: "SEARCH_FILTER_ERROR",
      cause: "CITY_MATCHER_DISAGREES",
      message: `preferred ${c.preference?.preferredLocations.join(" / ")} should satisfy ${String(v)}`,
    };
  },
  describe: (v) => `city = ${String(v)}`,
};

const employmentType: FilterDef = {
  id: "employmentType",
  label: "Engagement type",
  kind: "HARD_FILTER",
  criticality: "CORE",
  semantics: {
    valueType: "enum",
    logic: "ANY_OVERLAP",
    match: "the role's type is in the candidate's opportunity types",
    nullPolicy: "empty opportunity types = unstated, passes (plan 117 §5.4)",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Not open to this engagement type)",
    surfaces: ["Scout chat", "filter dialog (Employment type)"],
  },
  apply: (spec, v) => ({
    ...spec,
    employmentType: String(v) as NonNullable<JobSpec["employmentType"]>,
  }),
  oracle: (c, v) => {
    const types = c.preference?.opportunityTypes ?? [];
    if (!c.preference || types.length === 0) return pass("unstated", { unstated: true });
    return types.includes(String(v))
      ? pass(`open to ${String(v)}`)
      : fail(`open to ${types.join(", ")}, not ${String(v)}`);
  },
  service: (s) => hardReason(s, "Not open to this engagement type"),
  diagnose: (c, m, v, oracle) => {
    const drift = availabilityStale(c, m, (a) => a.opportunityTypes, (p) => p.opportunityTypes);
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    return {
      category: "SEARCH_FILTER_ERROR",
      cause: oracle.pass ? "ENGAGEMENT_TOO_STRICT" : "ENGAGEMENT_TOO_LOOSE",
      message: `opportunity types [${c.preference?.opportunityTypes.join(", ") ?? ""}] vs ${String(v)}`,
    };
  },
  describe: (v) => `engagement = ${String(v)}`,
};

const openToWork: FilterDef = {
  id: "openToWork",
  label: "Open to work only",
  kind: "HARD_FILTER",
  criticality: "CORE",
  semantics: {
    valueType: "boolean",
    logic: "SINGLE",
    match: "CandidatePreference.openToWork = true",
    nullPolicy: "no preference row passes (availability unknown)",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Not open to work)",
    surfaces: ["filter dialog (Open to work)"],
  },
  productQuestions: [
    "\"Open to work only\" returns candidates who never said whether they are looking. Confirm, or exclude unknown availability.",
  ],
  apply: (spec, v) => (v === true ? withExtra(spec, { openToWork: true }) : spec),
  oracle: (c, v) => {
    if (v !== true) return pass("filter off");
    if (!c.preference) return pass("availability unknown", { unstated: true });
    return c.preference.openToWork ? pass("open to work") : fail("not open to work");
  },
  service: (s) => hardReason(s, "Not open to work"),
  diagnose: (c, m) => {
    const drift = availabilityStale(c, m, (a) => a.openToWork, (p) => p.openToWork);
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    return {
      category: "SEARCH_FILTER_ERROR",
      cause: "OPEN_TO_WORK_DISAGREES",
      message: `openToWork=${String(c.preference?.openToWork)}`,
    };
  },
  describe: () => "open to work",
};

const salaryMax: FilterDef = {
  id: "salaryMax",
  label: "Budget ceiling",
  kind: "HARD_FILTER",
  criticality: "SECONDARY",
  semantics: {
    valueType: "number",
    logic: "SINGLE",
    match: "candidate's expected minimum ≤ budget (annual ₹)",
    nullPolicy: "no stated expectation passes; budget 0/0 is the 'not decided' sentinel",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Expected salary above budget)",
    surfaces: ["Scout chat (budget)", "filter dialog (Max LPA)"],
  },
  apply: (spec, v) => {
    const n = Number(v);
    return n === 0 ? { ...spec, salaryMin: 0, salaryMax: 0 } : { ...spec, salaryMax: n };
  },
  oracle: (c, v) => {
    const budget = Number(v);
    if (budget === 0) return pass("budget not decided", { sentinel: true });
    const min = c.preference?.expectedSalaryMin ?? null;
    if (min == null) return pass("no stated expectation", { unstated: true });
    return min <= budget ? pass(`expects ≥ ${min}`) : fail(`expects ≥ ${min}, budget ${budget}`);
  },
  service: (s) => hardReason(s, "Expected salary above budget"),
  diagnose: (c, m, _v, oracle) => {
    const drift = availabilityStale(c, m, (a) => a.expectedSalaryMin, (p) => p.expectedSalaryMin);
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    if (oracle.sentinel) {
      return {
        category: "SEARCH_FILTER_ERROR",
        cause: "SALARY_ZERO_SENTINEL_APPLIED",
        message: "a not-decided budget (0/0) excluded a candidate with a stated expectation",
      };
    }
    return { category: "SEARCH_FILTER_ERROR", cause: "SALARY_DISAGREES", message: "budget comparison disagrees" };
  },
  describe: (v) => (Number(v) === 0 ? "budget not decided (0/0)" : `budget ≤ ₹${Number(v).toLocaleString("en-IN")}`),
};

const noticePeriodDays: FilterDef = {
  id: "noticePeriodDays",
  label: "Notice period",
  kind: "HARD_FILTER",
  criticality: "SECONDARY",
  semantics: {
    valueType: "number",
    logic: "SINGLE",
    match: "candidate notice ≤ requested days",
    nullPolicy: "no stated notice passes",
    implementedAt: "src/features/hire/score-candidate.ts evaluateHardFilters (Notice period too long)",
    surfaces: ["Scout chat"],
  },
  apply: (spec, v) => ({ ...spec, noticePeriodDays: Number(v) }),
  oracle: (c, v) => {
    const n = c.preference?.noticePeriodDays ?? null;
    if (n == null) return pass("no stated notice", { unstated: true });
    return n <= Number(v) ? pass(`${n} days`) : fail(`${n} days > ${Number(v)}`);
  },
  service: (s) => hardReason(s, "Notice period too long"),
  diagnose: (c, m) => {
    const drift = availabilityStale(c, m, (a) => a.noticePeriodDays, (p) => p.noticePeriodDays);
    if (drift) return stale("AVAILABILITY_DRIFT", drift);
    return { category: "SEARCH_FILTER_ERROR", cause: "NOTICE_DISAGREES", message: "notice comparison disagrees" };
  },
  describe: (v) => `notice ≤ ${Number(v)} days`,
};

/* Pool filters: expressed on the spec, decided by canonical eligibility. */

const tracks: FilterDef = {
  id: "tracks",
  label: "Candidate track",
  kind: "POOL",
  criticality: "CORE",
  semantics: {
    valueType: "multi-text",
    logic: "OR",
    match: "candidate belongs to any named track (PROGRAM, CLAUDE, CHALLENGE_60, HACKATHON, PROFILE)",
    nullPolicy: "no track named = every enabled track",
    implementedAt: "src/features/hire/search-candidates.ts (extra.poolSources) → track-loaders",
    surfaces: ["Scout chat (set_pool_filters)", "India / US geo"],
  },
  apply: (spec, v) => withExtra(spec, { poolSources: asStrings(v) }),
  describe: (v) => `track ANY OF [${asStrings(v).join(", ")}]`,
};

const minEvidenceDays: FilterDef = {
  id: "minEvidenceDays",
  label: "Minimum verified days",
  kind: "POOL",
  criticality: "SECONDARY",
  semantics: {
    valueType: "number",
    logic: "SINGLE",
    match: "challenge submissions ≥ max(HIRE_CHALLENGE_POOL floor, stated days)",
    nullPolicy: "ignored on tracks without a day scale (PROGRAM, HACKATHON, PROFILE)",
    implementedAt: "src/features/hire/track-loaders.ts loadChallenge",
    surfaces: ["Scout chat (\"30+ days\")"],
  },
  apply: (spec, v) => withExtra(spec, { minEvidenceDays: Number(v) }),
  describe: (v) => `≥ ${Number(v)} verified days`,
};

const resultLimit: FilterDef = {
  id: "resultLimit",
  label: "Result count",
  kind: "POOL",
  criticality: "SECONDARY",
  semantics: {
    valueType: "number",
    logic: "SINGLE",
    match: "hard cap on returned cards (1–25), no padding",
    nullPolicy: "absent = the caller's limit (20 on recruiter runs)",
    implementedAt: "src/features/hire/search-candidates.ts (extra.resultLimit)",
    surfaces: ["Scout chat (\"top 5\")"],
  },
  apply: (spec, v) => withExtra(spec, { resultLimit: Number(v) }),
  describe: (v) => `top ${Number(v)}`,
};

/* Rank-only: must never change who is admitted. */

const experience: FilterDef = {
  id: "experience",
  label: "Years of experience",
  kind: "RANK_ONLY",
  criticality: "CORE",
  semantics: {
    valueType: "range",
    logic: "N/A",
    match: "scores 1.0 inside the band, decays outside; never excludes",
    nullPolicy: "0–50 is the 'evidence only' sentinel",
    implementedAt: "src/features/hire/score-candidate.ts experienceScore",
    surfaces: ["Scout chat", "filter dialog (Min/Max years)"],
  },
  productQuestions: [
    "The filter dialog presents min/max years as a filter, but candidates outside the band are still returned (ranked lower).",
  ],
  apply: (spec, v) => {
    const [lo, hi] = asStrings(v).map(Number);
    return { ...spec, minExperience: lo ?? null, maxExperience: hi ?? null };
  },
  describe: (v) => `experience ${asStrings(v).join("–")} years (rank only)`,
};

const seniority: FilterDef = {
  id: "seniority",
  label: "Seniority",
  kind: "RANK_ONLY",
  criticality: "SECONDARY",
  semantics: {
    valueType: "enum",
    logic: "N/A",
    match: "implies an experience band when none is given; never excludes",
    nullPolicy: "absent = no band",
    implementedAt: "src/features/hire/score-candidate.ts effectiveExperienceBand",
    surfaces: ["Scout chat"],
  },
  apply: (spec, v) => ({ ...spec, seniority: String(v) as NonNullable<JobSpec["seniority"]> }),
  describe: (v) => `seniority ${String(v)} (rank only)`,
};

const niceToHave: FilterDef = {
  id: "niceToHaveStack",
  label: "Nice-to-have skills",
  kind: "RANK_ONLY",
  criticality: "SECONDARY",
  semantics: {
    valueType: "multi-text",
    logic: "N/A",
    match: "adds to the stack dimension; never excludes",
    nullPolicy: "absent = neutral 0.5",
    implementedAt: "src/features/hire/score-candidate.ts stackScore",
    surfaces: ["Scout chat"],
  },
  apply: (spec, v) => ({ ...spec, niceToHaveStack: asStrings(v) }),
  describe: (v) => `nice to have [${asStrings(v).join(", ")}] (rank only)`,
};
const role: FilterDef = {
  id: "role",
  label: "Role / job title",
  kind: "RANK_ONLY",
  criticality: "CORE",
  semantics: {
    valueType: "text",
    logic: "N/A",
    match:
      "title fit (headline, target roles, work-history titles, cohort job role) is the role dimension; with no skills named, the role's typical skills stand in for the stack; no connection at all caps the tier at PARTIAL; never excludes",
    nullPolicy: "absent, or seniority words only = no role dimension (scores exactly as before)",
    implementedAt: "src/features/hire/role-match.ts + score-candidate.ts assessRole",
    surfaces: ["Scout chat (spec.title)"],
  },
  productQuestions: [
    "A candidate with no connection to the role scores low enough to be NONE, and NONE is only shown as padding when fewer than five better matches exist, so a title-only search can show fewer cards than before.",
  ],
  apply: (spec, v) => ({ ...spec, title: String(v) }),
  describe: (v) => `role "${String(v)}" (rank only)`,
};

const evidencePriority: FilterDef = {
  id: "evidencePriority",
  label: "Evidence priority",
  kind: "RANK_ONLY",
  criticality: "SECONDARY",
  semantics: {
    valueType: "multi-text",
    logic: "N/A",
    match: "boosts a scoring dimension ×1.5; never excludes",
    nullPolicy: "absent = base weights",
    implementedAt: "src/features/hire/score-candidate.ts reweight",
    surfaces: ["Scout chat"],
  },
  apply: (spec, v) => ({ ...spec, evidencePriority: asStrings(v) }),
  describe: (v) => `prioritise [${asStrings(v).join(", ")}] (rank only)`,
};

/* Asked about, not implemented. Listed so nobody reports them as passing. */

function notImplemented(id: string, label: string, note: string): FilterDef {
  return {
    id,
    label,
    kind: "NOT_IMPLEMENTED",
    criticality: "SECONDARY",
    semantics: {
      valueType: "text",
      logic: "N/A",
      match: "n/a",
      nullPolicy: "n/a",
      implementedAt: note,
      surfaces: [],
    },
    describe: () => `${label} (not implemented)`,
  };
}

export const FILTERS: readonly FilterDef[] = [
  mustHaveSkills,
  workMode,
  locationCity,
  employmentType,
  openToWork,
  salaryMax,
  noticePeriodDays,
  tracks,
  minEvidenceDays,
  resultLimit,
  experience,
  seniority,
  niceToHave,
  role,
  evidencePriority,
  notImplemented("graduationYear", "Graduation year", "not read by /hire search; shown on the card only"),
  notImplemented("college", "College", "not read by /hire search (withheld from challenge cards)"),
  notImplemented("degree", "Degree", "not read by /hire search; requiresDegree is stored and never used"),
  notImplemented("branch", "Branch / field of study", "not read by /hire search"),
  notImplemented("profileCompletion", "Profile completion", "computed at read time (features/profile/completeness.ts); not a search input"),
  notImplemented("verifiedSkills", "Verified skills / evidence", "CandidateSkill.verified is not read by search; SkillEvidence has no live writer (CLAUDE.md)"),
  notImplemented("github", "GitHub connected", "a card boolean only; not filterable"),
  notImplemented("leetcode", "LeetCode / coding profiles", "CandidateLink rows are not read by search"),
  notImplemented("projects", "Projects", "CandidateProjectEntry is not read by search"),
  notImplemented("assessments", "Assessments", "not read by search"),
  notImplemented("certifications", "Certifications", "not read by search (certificate flag is display-only)"),
  notImplemented("hackathon", "Hackathon participation", "available only as the HACKATHON track (see tracks)"),
  notImplemented("cohort", "Cohort", "available only as the PROGRAM track (see tracks)"),
];

export function filterById(id: string): FilterDef | null {
  return FILTERS.find((f) => f.id === id) ?? null;
}

/** Filters the comparison engine evaluates against canonical data. */
export const DECIDABLE_FILTERS = FILTERS.filter(
  (f) => (f.kind === "HARD_FILTER" || f.kind === "MATCH_GATE") && f.oracle && f.service,
);

export type AppliedFilter = { id: string; value: FilterValue };

/** Build the JobSpec the real service reads from a list of applied filters. */
export function specFor(filters: readonly AppliedFilter[], base: JobSpec = {}): JobSpec {
  let spec: JobSpec = { ...base };
  for (const f of filters) {
    const def = filterById(f.id);
    if (!def?.apply) throw new Error(`Filter ${f.id} cannot be applied to a spec`);
    spec = def.apply(spec, f.value);
  }
  return spec;
}

export function describeFilters(filters: readonly AppliedFilter[]): string {
  if (filters.length === 0) return "no filters";
  return filters
    .map((f) => filterById(f.id)?.describe(f.value) ?? `${f.id}=${String(f.value)}`)
    .join(" + ");
}

export { WORK_MODES as RECRUITER_WORK_MODES };
