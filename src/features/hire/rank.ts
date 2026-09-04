import "server-only";

import { evaluateAll } from "@/features/hire/criteria";
import type { SkillAliasRow } from "@/features/hire/normalize";
import { scoreCandidate } from "@/features/hire/score-candidate";
import {
  standingForAll,
  type StandingResult,
  type StandingWeights,
} from "@/features/hire/standing";
import type { ScoreableMember, ScoredCandidate } from "@/features/hire/types";
import type {
  Criterion,
  CriterionVerdict,
  SearchSpec,
} from "@/lib/validations/hire";

/**
 * Stage 6 — match and confidence are two numbers.
 *
 * `UNCLEAR = 0.4` is deleted. Match is how good the evidence we have looks;
 * confidence is how much of the requirement we could actually check.
 *
 * A candidate reaches `excluded` only when a level-2 criterion is NOT_MET —
 * never on UNCLEAR.
 */

export const MUST_WEIGHT = 3;
export const NICE_WEIGHT = 1;

export type RankedCandidate = ScoredCandidate & {
  match: number;
  confidence: number;
  /**
   * Weighted mean of per-verdict confidence over the criteria we could judge.
   *
   * This existed and was thrown away. Every evaluator computes it —
   * `evaluateSkill` returns 0.85 when a skill appears in the languages of
   * missions the candidate actually passed, and 0.5 when it is only typed on a
   * profile — and `scoresFor` read `fit` and ignored it. So "Python across 14
   * verified missions" and "Python, self-declared" ranked identically.
   */
  evidenceStrength: number;
  /** Platform standing. Tie-break only — see the sort below. */
  standing: number;
  standingDetail: StandingResult | null;
  /**
   * How much of the requirement we could actually verify, as a word.
   *
   * `100 + PARTIAL` was confusing because it read as one judgement with a
   * contradiction in it. It is two: the candidate scores 100 on ROLE FIT, and
   * the evidence behind that 100 is PARTIAL. Splitting them is the whole point
   * — a recruiter can act on "perfect fit, thinly evidenced" and cannot act on
   * "100, partial".
   */
  evidenceLabel: "Verified" | "Partial" | "Thin";
  /** Exactly what is unverified, in the recruiter's own terms. */
  evidenceReasons: string[];
  sortKey: number;
  verdicts: CriterionVerdict[];
  excludedReason?: string;
};

export type RankResult = {
  primary: RankedCandidate[];
  excluded: RankedCandidate[];
};

function isLevel2(c: Criterion): boolean {
  return c.absolute && !c.demotedReason;
}

function weightOf(c: Criterion): number {
  return c.weight === "must" ? MUST_WEIGHT : NICE_WEIGHT;
}

function median(values: number[]): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function scoresFor(
  criteria: Criterion[],
  verdicts: CriterionVerdict[],
): { match: number; confidence: number; evidenceStrength: number } {
  if (criteria.length === 0) {
    return { match: 50, confidence: 0, evidenceStrength: 0 };
  }
  const byId = new Map(verdicts.map((v) => [v.criterionId, v]));
  let known = 0;
  let knownFit = 0;
  let knownConfidence = 0;
  let all = 0;
  for (const c of criteria) {
    const w = weightOf(c);
    all += w;
    const v = byId.get(c.id);
    if (!v || v.verdict === "UNCLEAR" || v.fit == null) continue;
    known += w;
    knownFit += w * v.fit;
    // Per-verdict provenance. Kept SEPARATE from `match` on purpose — see the
    // note on `evidenceStrength` in RankedCandidate and the sort below.
    knownConfidence += w * v.confidence;
  }
  const match = known === 0 ? 50 : (knownFit / known) * 100;
  const confidence = all === 0 ? 0 : known / all;
  const evidenceStrength = known === 0 ? 0 : knownConfidence / known;
  return { match, confidence, evidenceStrength };
}

/**
 * Why the evidence behind a match is not complete.
 *
 * Every entry must be a real, checkable absence — an UNCLEAR verdict on a
 * criterion the recruiter actually stated, or a missing evidence field we know
 * we do not hold. Never a generic hedge: "see gaps" tells a recruiter nothing
 * and is exactly the kind of unsupported filler this codebase keeps removing.
 */
function evidenceGaps(
  criteria: Criterion[],
  verdicts: CriterionVerdict[],
  member: ScoreableMember,
): string[] {
  const out: string[] = [];
  const byId = new Map(criteria.map((c) => [c.id, c]));
  for (const v of verdicts) {
    if (v.verdict !== "UNCLEAR") continue;
    const c = byId.get(v.criterionId);
    if (c) out.push(`${c.label} not recorded`);
  }
  if (member.missionsPassed <= 0) out.push("No verified missions");
  if (member.availability == null) out.push("Availability not shared");
  return [...new Set(out)];
}

function evidenceLabelFor(
  confidence: number,
  evidenceStrength: number,
  hasCriteria: boolean,
): "Verified" | "Partial" | "Thin" {
  if (!hasCriteria) return "Partial";
  if (confidence >= 0.8 && evidenceStrength >= 0.7) return "Verified";
  if (confidence >= 0.5) return "Partial";
  return "Thin";
}

function exclusionReason(
  criteria: Criterion[],
  verdicts: CriterionVerdict[],
): string | null {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  for (const v of verdicts) {
    const c = byId.get(v.criterionId);
    if (!c || !isLevel2(c)) continue;
    if (v.verdict !== "NOT_MET") continue;
    return `Does not meet ${c.label}`;
  }
  return null;
}

function asRanked(
  member: ScoreableMember,
  spec: SearchSpec,
  table: SkillAliasRow[],
): RankedCandidate {
  const scored = scoreCandidate(member, {
    title: spec.statedAs || undefined,
    evidencePriority: undefined,
  });
  const verdicts =
    spec.criteria.length > 0 ? evaluateAll(spec.criteria, member, table) : [];
  const { match, confidence, evidenceStrength } =
    spec.criteria.length > 0
      ? scoresFor(spec.criteria, verdicts)
      : { match: scored.score, confidence: 1, evidenceStrength: 0 };
  const reason = spec.criteria.length > 0 ? exclusionReason(spec.criteria, verdicts) : null;
  const display = spec.criteria.length > 0 ? Math.round(match) : scored.score;
  const gaps = [...scored.gaps];
  for (const v of verdicts) {
    if (v.verdict === "UNCLEAR") {
      const c = spec.criteria.find((x) => x.id === v.criterionId);
      if (c) gaps.push(`${c.label} not recorded`);
    } else if (v.verdict === "NOT_MET") {
      const c = spec.criteria.find((x) => x.id === v.criterionId);
      if (c) gaps.push(`Does not meet ${c.label}`);
    }
  }
  return {
    ...scored,
    score: display,
    gaps,
    match,
    confidence,
    evidenceStrength,
    evidenceLabel: evidenceLabelFor(
      confidence,
      evidenceStrength,
      spec.criteria.length > 0,
    ),
    evidenceReasons: evidenceGaps(spec.criteria, verdicts, member),
    standing: 0,
    standingDetail: null,
    sortKey: 0,
    verdicts,
    excludedReason: reason ?? undefined,
    hardFiltered: false,
    hardFilterReasons: [],
  };
}

/**
 * How wide a band counts as "the same match".
 *
 * Standing and evidence strength reorder only inside one of these. Five points
 * of a 0-100 match is close enough that two candidates are genuinely
 * equivalent on the requirement, and narrow enough that a real difference
 * survives.
 */
export const MATCH_BAND = 5;

function bandOf(c: RankedCandidate): number {
  return Math.round(c.sortKey / MATCH_BAND);
}

/**
 * Lexicographic, and the order is the whole contract.
 *
 *   1. match band      — how well they meet what the recruiter asked
 *   2. evidence strength — proven beats claimed, for the SAME match
 *   3. standing         — live and productive beats dormant, for the same again
 *   4. exact match      — a stable, arbitrary tiebreak so results never shuffle
 *
 * The banding is what makes 2 and 3 safe. Multiplying them into the score
 * instead would let a near-miss with better provenance overtake a true match:
 *
 *   requirement 14+ years
 *   A declares 14   → MET     fit 1.00 × conf 0.50 = 0.50
 *   B declares 13.5 → NOT_MET fit 0.96 × conf 0.90 = 0.87   ← wrong winner
 *
 * So nothing below rank 1 may ever cross a band. A busy fresher cannot appear
 * above a qualified senior, and a verified profile cannot appear above someone
 * who actually meets the requirement.
 */
function tiebreak(a: RankedCandidate, b: RankedCandidate): number {
  return (
    bandOf(b) - bandOf(a) ||
    b.evidenceStrength - a.evidenceStrength ||
    b.standing - a.standing ||
    b.sortKey - a.sortKey ||
    (a.fullName || a.candidateRef).localeCompare(b.fullName || b.candidateRef)
  );
}

export function rankCandidates107(
  members: ScoreableMember[],
  spec: SearchSpec,
  opts?: {
    table?: SkillAliasRow[];
    limit?: number;
    /** Override the standing weights. Tuning belongs in the benchmark. */
    standingWeights?: StandingWeights;
    /** Injectable for deterministic tests of the recency curve. */
    now?: Date;
  },
): RankResult {
  const table = opts?.table ?? [];
  const scored = members.map((m) => asRanked(m, spec, table));

  const knownMatches = scored
    .filter((s) => s.confidence > 0)
    .map((s) => s.match);
  const medianMatch = median(knownMatches.length ? knownMatches : scored.map((s) => s.match));

  // Standing is a property of the pool as much as of the person: which signals
  // count is decided by what each track in THIS search can produce.
  const standing = standingForAll(members, {
    now: opts?.now,
    weights: opts?.standingWeights,
  });

  for (const s of scored) {
    s.sortKey = s.match * s.confidence + medianMatch * (1 - s.confidence);
    const detail = standing.get(s.candidateRef) ?? null;
    s.standingDetail = detail;
    s.standing = detail?.score ?? 0;
  }

  const primary: RankedCandidate[] = [];
  const excluded: RankedCandidate[] = [];
  for (const s of scored) {
    if (s.excludedReason) excluded.push(s);
    else primary.push(s);
  }

  // There is deliberately NO "promote everyone back" fallback here any more.
  //
  // It used to move every excluded candidate into `primary` and then empty
  // `excluded`, which did two dishonest things at once: it presented people the
  // recruiter had explicitly ruled out as exact matches, and it destroyed the
  // near-miss list, so the surface could not even label them. A recruiter who
  // said "Pune only" was shown Bengaluru-only candidates as matches.
  //
  // `excluded` is only ever populated by a level-2 criterion — one the recruiter
  // marked absolute AND that cleared the coverage gate — and only on a NOT_MET,
  // never on an UNCLEAR. So an empty `primary` means exactly one thing: you set
  // a hard requirement and we can prove nobody in the pool meets it. That is a
  // real answer, and the caller reports it as one (see `explain-matches.ts`,
  // which already has the zero-exact-matches copy path).
  //
  // A search with no absolute criteria cannot reach an empty `primary` by this
  // route at all, so the "never a blank board" guarantee still holds everywhere
  // the recruiter has not deliberately narrowed.
  primary.sort(tiebreak);
  excluded.sort(tiebreak);

  // `rankKey` is assigned AFTER the sort, as an ordinal — not as a copy of
  // `sortKey`.
  //
  // The first attempt exported `sortKey` and let the surface re-sort on it.
  // The benchmark's order-integrity gate failed 8 of 8 queries immediately:
  // the engine separates equal-`sortKey` candidates by `evidenceStrength` and
  // then `standing`, and the card carries neither, so every tie collapsed to an
  // alphabetical fallback and the screen showed a different ranking from the
  // one computed.
  //
  // Exporting the position instead makes agreement structural rather than
  // something two comparators have to be kept in step about. Higher is better,
  // so the display comparator keeps its direction and its `?? score` fallback
  // for rows written before this existed.
  primary.forEach((c, i) => {
    c.rankKey = primary.length - i;
  });
  excluded.forEach((c, i) => {
    c.rankKey = excluded.length - i;
  });

  const cap = spec.filters.resultLimit ?? opts?.limit ?? 25;
  return {
    primary: primary.slice(0, cap),
    excluded: excluded.slice(0, 25),
  };
}

export const __test = {
  weightOf,
  median,
  scoresFor,
  exclusionReason,
  isLevel2,
  bandOf,
};
