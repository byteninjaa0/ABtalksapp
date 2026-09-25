/**
 * "Why is candidate X in this search — or why not?"
 *
 * Admin / developer only. It reads the scorer's own breakdown, so every number
 * here is the number production ranked on: weights, dimension values and the
 * points each contributed, the hard-filter reason strings, and the rank. Next to
 * each filter it shows what the canonical oracle expected, and — when they
 * disagree — the classification, so a support question becomes a bug report or
 * a data fix in one read.
 *
 * Contact data never appears: the canonical snapshot carries none beyond link
 * presence, and the scored row carries none by construction.
 *
 * PURE — the admin page and the CLI supply the pool.
 */
import { __test as scoreInternals } from "@/features/hire/score-candidate";
import { candidatePublicId } from "@/features/hire/public-id";
import {
  claimedSkillNames,
  eligibility,
  type CanonicalCandidate,
  type PoolCohort,
  type SearchEnv,
} from "@/features/search-qa/canonical";
import {
  caseSpec,
  evaluateSpec,
  type PipelineConstants,
  type PoolSnapshot,
  type SpecCase,
} from "@/features/search-qa/compare";
import { dataQualityIssues, type DataQualityIssue } from "@/features/search-qa/data-quality";
import {
  describeFilters,
  filterById,
  type AppliedFilter,
  type Diagnosis,
} from "@/features/search-qa/filter-registry";
import { documentDrift, type DocumentDrift } from "@/features/search-qa/index-consistency";
import { skillMatchesToken } from "@/features/search-qa/normalize";

export type ExplainFilterRow = {
  id: string;
  label: string;
  value: string;
  expected: { pass: boolean; ambiguous: string | null; reason: string };
  service: { pass: boolean; reason: string | null } | null;
  verdict: "AGREE" | "DISAGREE" | "AMBIGUOUS" | "NOT_EVALUATED";
  diagnosis: Diagnosis | null;
};

export type ExplainResult = {
  userId: string;
  publicId: string;
  search: string;
  found: boolean;
  gate: { pass: boolean; reasons: string[] };
  tracks: { expected: string[]; winner: string | null };
  document: { loaded: boolean; loadedAs: string | null; candidateRef: string | null; loadedIn: string[] };
  filters: ExplainFilterRow[];
  requiredSkills: { token: string; claimed: string | null; document: string | null }[];
  ranking: {
    score: number;
    tier: string;
    hardFiltered: boolean;
    hardFilterReasons: string[];
    contributions: { dimension: string; value: number | null; weight: number; points: number }[];
    gaps: string[];
    coverageNote: string;
  } | null;
  position: {
    rank: number | null;
    rankedOf: number;
    admitted: boolean;
    admittedRank: number | null;
    admittedOf: number;
    onPage: boolean;
    pageRank: number | null;
    pageSize: number;
  };
  drift: DocumentDrift[];
  dataQuality: DataQualityIssue[];
  summary: string;
};

export function explainFromPool(input: {
  userId: string;
  canonical: CanonicalCandidate | null;
  filters: AppliedFilter[];
  tracks?: string[];
  minEvidenceDays?: number;
  pool: PoolSnapshot;
  env: SearchEnv;
  cohorts: ReadonlyMap<string, PoolCohort>;
  constants: PipelineConstants;
}): ExplainResult {
  const spec: SpecCase = {
    id: "explain",
    kind: "SINGLE",
    filters: input.filters,
    tracks: input.tracks ?? [],
    minEvidenceDays: input.minEvidenceDays ?? 0,
    criticality: "CORE",
  };
  const ev = evaluateSpec(input.pool, caseSpec(spec), input.constants);
  const c = input.canonical;
  const member = ev.memberByUser.get(input.userId) ?? null;
  const scored = ev.byUser.get(input.userId) ?? null;
  const e = c
    ? eligibility(c, input.env, input.cohorts, { tracks: spec.tracks, minEvidenceDays: spec.minEvidenceDays })
    : null;

  const filters: ExplainFilterRow[] = input.filters.map((f) => {
    const def = filterById(f.id);
    const value = Array.isArray(f.value) ? f.value.join(", ") : String(f.value);
    if (!def?.oracle || !c) {
      return {
        id: f.id,
        label: def?.label ?? f.id,
        value,
        expected: { pass: true, ambiguous: null, reason: def ? `${def.kind.toLowerCase().replace("_", " ")} is not a pass/fail filter` : "unknown filter" },
        service: null,
        verdict: "NOT_EVALUATED",
        diagnosis: null,
      };
    }
    const o = def.oracle(c, f.value);
    const s = scored && def.service ? def.service(scored, f.value) : null;
    const verdict: ExplainFilterRow["verdict"] = o.ambiguous
      ? "AMBIGUOUS"
      : !s
        ? "NOT_EVALUATED"
        : s.pass === o.pass
          ? "AGREE"
          : "DISAGREE";
    return {
      id: f.id,
      label: def.label,
      value,
      expected: { pass: o.pass, ambiguous: o.ambiguous, reason: o.reason },
      service: s,
      verdict,
      diagnosis:
        verdict === "DISAGREE" && member && s && def.diagnose
          ? def.diagnose(c, member, f.value, o, s)
          : null,
    };
  });

  const tokens = input.filters.find((f) => f.id === "mustHaveStack")?.value;
  const requiredSkills = (Array.isArray(tokens) ? tokens : []).map((token) => ({
    token,
    claimed: c ? claimedSkillNames(c).find((s) => skillMatchesToken(s, token).literal || skillMatchesToken(s, token).normalized) ?? null : null,
    document: member ? member.skills.find((s) => scoreInternals.stackTokensMatch([s], token)) ?? null : null,
  }));

  const rankIdx = ev.ranked.findIndex((r) => r.userId === input.userId);
  const admittedList = ev.ranked.filter((r) => ev.admitted.has(r.userId));
  const admittedIdx = admittedList.findIndex((r) => r.userId === input.userId);
  const pageIdx = ev.page.findIndex((r) => r.userId === input.userId);

  const ranking = scored
    ? {
        score: scored.score,
        tier: scored.tier,
        hardFiltered: scored.hardFiltered,
        hardFilterReasons: scored.hardFilterReasons,
        contributions: (["stack", "missions", "cleanPass", "projects", "consistency", "interview", "experience", "role"] as const).map((dim) => {
          const value = scored.scoreBreakdown[dim] ?? null;
          const weight = scored.scoreBreakdown.weights[dim] ?? 0;
          const used = scored.scoreBreakdown.dimensionsUsed.includes(dim);
          return {
            dimension: dim,
            value,
            weight: used ? weight : 0,
            points: used && value != null ? Math.round((value / 100) * weight * 10) / 10 : 0,
          };
        }),
        gaps: scored.gaps,
        coverageNote: member?.coverage?.note ?? input.pool.coverage.note,
      }
    : null;

  const loadedIn = input.pool.loads.filter((l) => l.userIds.includes(input.userId)).map((l) => l.slug);
  const drift = c && member ? documentDrift(c, member) : [];
  const dataQuality = c ? dataQualityIssues(c) : [];

  let summary: string;
  if (!c) summary = "No canonical user with this id.";
  else if (e && e.gate.length > 0) {
    summary = member
      ? `LEAK: must never appear (${e.gate.join(", ")}) but the search loaded them. VISIBILITY_ERROR.`
      : `Not discoverable: ${e.gate.join(", ")}. Correctly absent.`;
  } else if (e && e.tracks.length === 0) {
    summary = `Not in any searched track (expected tracks: none for ${spec.tracks.join(", ") || "all tracks"}).`;
  } else if (!member) {
    summary = `Eligible via ${e?.tracks.join(", ")} but not loaded by the search (${loadedIn.length ? "" : "no loader returned them"}). See coverage.`;
  } else if (pageIdx >= 0) {
    summary = `On the page at #${pageIdx + 1} of ${ev.page.length} (score ${scored?.score}, ${scored?.tier}).`;
  } else if (ev.admitted.has(input.userId)) {
    summary = `Passes every filter and ranks #${admittedIdx + 1} among ${admittedList.length} matches, beyond the ${ev.page.length}-result page (no pagination).`;
  } else {
    const reasons = [
      ...(scored?.hardFilterReasons ?? []),
      ...requiredSkills.filter((r) => !r.document).map((r) => `missing required skill "${r.token}"`),
    ];
    const disagreement = filters.find((f) => f.verdict === "DISAGREE");
    summary = `Excluded: ${reasons.join("; ") || "no reason recorded"}.${
      disagreement?.diagnosis
        ? ` Expected to pass ${disagreement.label}: ${disagreement.diagnosis.category}${disagreement.diagnosis.knownIssue ? ` (${disagreement.diagnosis.knownIssue})` : ""}: ${disagreement.diagnosis.message}.`
        : " The canonical profile agrees."
    }`;
  }

  return {
    userId: input.userId,
    publicId: candidatePublicId(member?.id ?? input.userId),
    search: describeFilters(input.filters) + (spec.tracks.length ? ` · tracks ${spec.tracks.join(", ")}` : ""),
    found: Boolean(c),
    gate: { pass: (e?.gate.length ?? 1) === 0, reasons: e?.gate ?? ["NO_USER"] },
    tracks: { expected: e?.tracks ?? [], winner: e?.winner ?? null },
    document: {
      loaded: Boolean(member),
      loadedAs: member?.source ?? null,
      candidateRef: member?.candidateRef ?? null,
      loadedIn,
    },
    filters,
    requiredSkills,
    ranking,
    position: {
      rank: rankIdx >= 0 ? rankIdx + 1 : null,
      rankedOf: ev.ranked.length,
      admitted: ev.admitted.has(input.userId),
      admittedRank: admittedIdx >= 0 ? admittedIdx + 1 : null,
      admittedOf: admittedList.length,
      onPage: pageIdx >= 0,
      pageRank: pageIdx >= 0 ? pageIdx + 1 : null,
      pageSize: ev.page.length,
    },
    drift,
    dataQuality,
    summary,
  };
}
