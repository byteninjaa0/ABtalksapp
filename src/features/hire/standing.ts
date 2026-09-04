import "server-only";

import type { ScoreableMember } from "@/features/hire/types";

/**
 * Stage 6b — platform standing. How live and how proven a candidate is,
 * separately from whether they match the requirement.
 *
 * ## Why this is not part of `match`
 *
 * `match` means one thing: how well this person meets what the recruiter asked
 * for. Folding activity or verification into it would make "Match 87"
 * unreadable and would silently overturn stated requirements — the same class
 * of failure as a location filter that claimed one thing and did another.
 *
 * So standing never crosses a match band. It reorders people who are already
 * equivalent on the requirement, and nothing else. A busy fresher can never
 * appear above a qualified senior. See `rank.ts` for the lexicographic sort
 * that enforces it.
 *
 * ## Why a signal can be dropped rather than scored zero
 *
 * The tracks do not produce the same evidence. `hackathon-dossier.ts` records
 * `lastActiveAt: verified(null)` and `certificateIssued: verified(false)` for
 * every candidate it builds, and `cleanPassCount: verified(0)` is true of both
 * the hackathon and the 60-day challenge — those pools log a submission, they
 * do not re-run it.
 *
 * Scored naively, an entire track would sit at the floor on three of five
 * signals for a data gap its members had no part in. That is absent data read
 * as a bad score, which is the bug this codebase keeps having.
 *
 * So a signal is measured PER TRACK across the retrieved pool: if nobody on a
 * candidate's own track can produce it, it is dropped for that track and its
 * weight is redistributed across the rest. Exactly the rule `computeCoverage`
 * already applies to the seven scoring dimensions in `dossier.ts`, applied to
 * the same problem one layer up. It is data-driven on purpose — no track is
 * named in the scoring, so a new track needs no change here.
 */

export type StandingSignal =
  | "verifiedWork"
  | "recentlyActive"
  | "certified"
  | "inCohort"
  | "shipped";

export const STANDING_SIGNALS: StandingSignal[] = [
  "verifiedWork",
  "recentlyActive",
  "certified",
  "inCohort",
  "shipped",
];

/**
 * Relative weights. Tunable in ONE place on purpose.
 *
 * These are starting values, not findings. Five interacting weights cannot be
 * calibrated by argument — they need the graded benchmark in
 * `docs/hire-benchmark/queries.json` and a pool to run it against. Until that
 * exists, treat every number here as a guess that is deliberately cheap to
 * change, and change it there rather than by adding a sixth signal.
 */
export type StandingWeights = Record<StandingSignal, number>;

export const DEFAULT_STANDING_WEIGHTS: StandingWeights = {
  // Volume of work the platform actually checked. The strongest of the five,
  // because it is the only one that measures how much rather than whether.
  verifiedWork: 3,
  // Liveness. Decays on its own (see `recencyScore`).
  recentlyActive: 2,
  // Finished a track end to end. Durable — a certificate does not go stale.
  certified: 2,
  // Currently enrolled and progressing. Real, but the weakest evidence claim
  // of the five: it says they are doing the work, not that they have done it.
  inCohort: 1,
  // Produced a graded artifact — a cohort project, or a hackathon repo.
  shipped: 1,
};

/**
 * Recency, as a curve rather than a badge.
 *
 * A boolean "active" flag is stale the day after it flips and creates a cliff
 * worth gaming — commit once a month, keep the badge. A decay ranks smoothly
 * and lets the badge be a display threshold on the same number, so the badge
 * and the ranking can never disagree with each other.
 *
 * Returns null when the candidate has no activity timestamp at all, which on
 * the hackathon track is everybody. Null means "not produced", never "zero".
 */
export function recencyScore(
  lastActiveAt: string | null | undefined,
  now: Date,
): number | null {
  if (!lastActiveAt) return null;
  const at = Date.parse(lastActiveAt);
  if (!Number.isFinite(at)) return null;
  const days = (now.getTime() - at) / 86_400_000;
  if (days < 0) return 1; // clock skew — treat as today rather than as future
  if (days <= 7) return 1;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.5;
  if (days <= 180) return 0.25;
  return 0.1;
}

/**
 * Raw evidence volume for one candidate, before pool normalisation.
 *
 * Missions passed plus commit days — both VERIFIED on every track that records
 * them. Deliberately NOT a per-track constant: the plan is that a 31-day
 * cohort outranks a weekend hackathon because it produces more checked
 * evidence, not because a table says cohorts rank higher. Nothing here names a
 * track, so the ordering survives a new one being added.
 *
 * Distinct commit DAYS rather than commit volume, and passes rather than
 * attempts: both are far harder to inflate than raw activity counts.
 */
function evidenceVolume(m: ScoreableMember): number {
  return Math.max(0, m.missionsPassed) + Math.max(0, m.commitDayCount);
}

/**
 * One candidate's raw signal values. `null` = this candidate produced nothing
 * for that signal; whether that means "zero" or "the track cannot record it"
 * is decided by `trackCoverage` below, never here.
 */
function rawSignals(
  m: ScoreableMember,
  now: Date,
  poolMaxVolume: number,
): Record<StandingSignal, number | null> {
  const ev = m.dossier?.evidence;
  const progress = ev?.cohortProgress.value;
  const missionTypes = ev?.missionTypesPassed.value ?? [];
  const projects = ev?.projectScores.value ?? m.projectScores ?? [];

  const volume = evidenceVolume(m);

  const certificate = ev?.certificateIssued;

  return {
    // Normalised against the busiest candidate in this search, so it is a
    // relative ordering rather than a scale that drifts as tracks lengthen.
    verifiedWork: poolMaxVolume > 0 ? clamp01(volume / poolMaxVolume) : null,
    recentlyActive: recencyScore(ev?.lastActiveAt.value ?? null, now),
    // An absent Fact is "this track does not issue certificates"; a present
    // `false` is "this person has not earned one". Only the first is null.
    certified: certificate === undefined ? null : certificate.value ? 1 : 0,
    inCohort:
      progress == null
        ? null
        : m.status === "ENROLLED" && progress.day < progress.ofDays
          ? 1
          : 0,
    // A graded cohort project, or a shipped hackathon repo — the dossier
    // records the second as a passed mission type rather than a score. Always
    // 0 or 1; a track where nobody shipped simply fails coverage and is
    // dropped, which is the same outcome without a third state to reason about.
    shipped: projects.length > 0 || missionTypes.includes("HACKATHON") ? 1 : 0,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Which signals each track in this pool can produce at all.
 *
 * `.some(...)` per track, mirroring `computeCoverage`: one candidate anywhere
 * on the track producing a non-null, non-zero value is enough to say the track
 * records it, at which point a zero from anyone else on that track is a real
 * zero and scores as one.
 */
export function trackCoverage(
  members: ScoreableMember[],
  now: Date,
): Map<string, Set<StandingSignal>> {
  const poolMax = Math.max(0, ...members.map(evidenceVolume));
  const byTrack = new Map<string, ScoreableMember[]>();
  for (const m of members) {
    const key = m.source ?? "PROGRAM";
    const list = byTrack.get(key);
    if (list) list.push(m);
    else byTrack.set(key, [m]);
  }

  const out = new Map<string, Set<StandingSignal>>();
  for (const [track, group] of byTrack) {
    const covered = new Set<StandingSignal>();
    for (const signal of STANDING_SIGNALS) {
      const produced = group.some((m) => {
        const v = rawSignals(m, now, poolMax)[signal];
        return v != null && v > 0;
      });
      if (produced) covered.add(signal);
    }
    out.set(track, covered);
  }
  return out;
}

export type StandingResult = {
  /** 0–100. Only ever a tie-break inside a match band — see `rank.ts`. */
  score: number;
  /** Signals that counted, for the card and the explanation layer. */
  used: StandingSignal[];
  /** Per-signal values that counted, for a "why is this one above that one". */
  values: Partial<Record<StandingSignal, number>>;
  /** Dropped because this candidate's track cannot record them. */
  uncovered: StandingSignal[];
};

/**
 * Standing for one candidate, with the weight of any uncovered signal
 * redistributed across the ones that remain.
 */
export function standingFor(
  m: ScoreableMember,
  opts: {
    now: Date;
    poolMaxVolume: number;
    coverage: Map<string, Set<StandingSignal>>;
    weights?: StandingWeights;
  },
): StandingResult {
  const weights = opts.weights ?? DEFAULT_STANDING_WEIGHTS;
  const covered =
    opts.coverage.get(m.source ?? "PROGRAM") ?? new Set<StandingSignal>();
  const raw = rawSignals(m, opts.now, opts.poolMaxVolume);

  const used: StandingSignal[] = [];
  const uncovered: StandingSignal[] = [];
  const values: Partial<Record<StandingSignal, number>> = {};

  let weighted = 0;
  let total = 0;
  for (const signal of STANDING_SIGNALS) {
    if (!covered.has(signal)) {
      uncovered.push(signal);
      continue;
    }
    const w = weights[signal];
    if (w <= 0) continue;
    const v = raw[signal] ?? 0;
    values[signal] = v;
    used.push(signal);
    weighted += w * v;
    total += w;
  }

  // No signal covered at all — every candidate on this track is level, which is
  // the honest answer rather than a fabricated ordering.
  const score = total > 0 ? (weighted / total) * 100 : 0;
  return { score, used, values, uncovered };
}

/** Batch helper: coverage is a property of the pool, so compute it once. */
export function standingForAll(
  members: ScoreableMember[],
  opts?: { now?: Date; weights?: StandingWeights },
): Map<string, StandingResult> {
  const now = opts?.now ?? new Date();
  const poolMaxVolume = Math.max(0, ...members.map(evidenceVolume));
  const coverage = trackCoverage(members, now);
  const out = new Map<string, StandingResult>();
  for (const m of members) {
    out.set(
      m.candidateRef ?? m.id,
      standingFor(m, { now, poolMaxVolume, coverage, weights: opts?.weights }),
    );
  }
  return out;
}

export const __test = { evidenceVolume, rawSignals, clamp01 };
