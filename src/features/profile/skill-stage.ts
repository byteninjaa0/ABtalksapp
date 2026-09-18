/**
 * Plan 151 §8.1 — skill stages, computed from evidence. Never chosen.
 *
 * Self-rating was removed from the product on 2026-09-09 for exactly this
 * reason: a claim is not a stage. Pure module — no Prisma, no server-only.
 */
import type { EvidenceSourceType } from "@prisma/client";

export const SKILL_STAGES = [
  "Claimed",
  "Learning",
  "Practicing",
  "Applied",
  "Verified",
  "Advanced",
] as const;

export type SkillStage = (typeof SKILL_STAGES)[number];

export type StageEvidence = {
  sourceType: EvidenceSourceType;
  score: number | null;
  maxScore: number | null;
  weight: number;
  occurredAt: Date;
  /** True when the evidence came from a build: project, ship-it or hackathon. */
  isBuild?: boolean;
};

const ADVANCED_RECENCY_MONTHS = 12;

function ratio(e: StageEvidence): number | null {
  if (e.score == null || !e.maxScore || e.maxScore <= 0) return null;
  return e.score / e.maxScore;
}

/**
 * The highest stage the evidence supports.
 *
 * Learning   enrolled in a programme that teaches it, or 1 activity evidence
 * Practicing activity weight ≥ 10
 * Applied    ≥ 1 build (project / ship-it / hackathon)
 * Verified   a completion credential, an assessment ≥ 70%, or a top-25% result
 * Advanced   Verified + 2 independent source types + (assessment ≥ 85% or
 *            hackathon) + evidence inside the last 12 months
 */
export function deriveSkillStage(
  evidence: StageEvidence[],
  opts?: { enrolledInTeachingProgram?: boolean; now?: Date },
): SkillStage {
  const now = opts?.now ?? new Date();
  if (evidence.length === 0) {
    return opts?.enrolledInTeachingProgram ? "Learning" : "Claimed";
  }

  const activityWeight = evidence
    .filter((e) => e.sourceType === "ACTIVITY_EVALUATION")
    .reduce((sum, e) => sum + e.weight, 0);
  const hasBuild = evidence.some(
    (e) => e.isBuild || e.sourceType === "HACKATHON",
  );
  const bestAssessment = evidence
    .filter((e) => e.sourceType === "ASSESSMENT_SCORE")
    .reduce<number | null>((best, e) => {
      const r = ratio(e);
      return r != null && (best == null || r > best) ? r : best;
    }, null);
  const hasCredential = evidence.some((e) => e.sourceType === "CREDENTIAL");
  const hasHackathon = evidence.some((e) => e.sourceType === "HACKATHON");

  const verified =
    hasCredential ||
    (bestAssessment != null && bestAssessment >= 0.7) ||
    hasHackathon;

  if (verified) {
    const distinctSources = new Set(evidence.map((e) => e.sourceType)).size;
    const newest = evidence.reduce(
      (acc, e) => (e.occurredAt > acc ? e.occurredAt : acc),
      evidence[0].occurredAt,
    );
    const monthsOld =
      (now.getTime() - newest.getTime()) / (30.44 * 24 * 60 * 60 * 1000);
    const advanced =
      distinctSources >= 2 &&
      ((bestAssessment != null && bestAssessment >= 0.85) || hasHackathon) &&
      monthsOld <= ADVANCED_RECENCY_MONTHS;
    return advanced ? "Advanced" : "Verified";
  }

  if (hasBuild) return "Applied";
  if (activityWeight >= 10) return "Practicing";
  return "Learning";
}

/** Bands shown to recruiters: a number needs words around it. */
export function strengthBand(score: number): "Emerging" | "Established" | "Strong" {
  if (score >= 60) return "Strong";
  if (score >= 30) return "Established";
  return "Emerging";
}

/** What the candidate must do to reach the next stage. */
export function nextStageHint(stage: SkillStage): string | null {
  switch (stage) {
    case "Claimed":
      return "Join a track that teaches it";
    case "Learning":
      return "Pass more checked activities in this skill";
    case "Practicing":
      return "Ship a project or a hackathon build";
    case "Applied":
      return "Finish a programme, or score 70%+ on an assessment";
    case "Verified":
      return "Score 85%+ on a second independent source";
    case "Advanced":
      return null;
  }
}
