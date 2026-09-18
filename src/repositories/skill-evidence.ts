import "server-only";
import type { Prisma } from "@prisma/client";
import { EvidenceSourceType } from "@prisma/client";
import { prisma, writeClient } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * The single write path for `SkillEvidence`.
 *
 * Idempotent on (`sourceType`, `sourceKey`, `skillId`) per candidate. That is
 * the existing `@@unique([candidateSkillId, sourceType, sourceId])` on the
 * model: `CandidateSkill` is itself unique on (`userId`, `skillId`), so
 * `candidateSkillId` is a bijection for that pair. No schema change is needed
 * to make this key hold.
 *
 * Evidence is a DOMAIN fact, not a gamification reward: it is written whether
 * or not any `ENABLE_GAMIFICATION_*` flag is on, and gamification only ever
 * reads it (plan 151 §20).
 */

export type EmitSkillEvidenceInput = {
  userId: string;
  /**
   * A `Skill.id`, never a typed name. Callers holding a name resolve it with
   * `resolveOrCreateSkill` FIRST — that helper uses the global client, so
   * resolving here would escape a caller's transaction.
   */
  skillId: string;
  sourceType: EvidenceSourceType;
  /**
   * Idempotency key, persisted to `SkillEvidence.sourceId`. Must be stable
   * across re-evaluation: the id of the row that caused the evidence
   * (`AssessmentScore.id`, `ActivityEvaluation.id`), never a timestamp.
   */
  sourceKey: string;
  /** Recruiter-visible provenance, e.g. "Databricks Assessment". Non-null column. */
  sourceLabel: string;
  /** The domain event time, never insert time. Non-null column, no default. */
  occurredAt: Date;
  /** Absent where the source has no score — a passed cohort mission, a hackathon result. */
  score?: number | null;
  maxScore?: number | null;
  /** 1–10. `ActivitySkill.weight` for cohort activities. Defaults to 1 on write. */
  weight?: number;
};

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Plan 151 §8.2 — how much a source is worth. A completion credential or a
 * scored assessment says far more than one passed mission, and a single
 * activity is deliberately small so grinding cannot manufacture strength.
 */
const SOURCE_WEIGHT: Record<EvidenceSourceType, number> = {
  CREDENTIAL: 30,
  ASSESSMENT_SCORE: 25,
  HACKATHON: 25,
  ACTIVITY_EVALUATION: 3,
  EXTERNAL: 10,
};

const RECENCY_HALF_LIFE_MONTHS = 18;
const DIVERSITY_BONUS = 10;

export type EvidenceRow = {
  sourceType: EvidenceSourceType;
  score: number | null;
  maxScore: number | null;
  weight: number;
  occurredAt: Date;
};

/**
 * 0–100 strength. XP never decays; evidence strength does, because recruiters
 * care whether a skill is current.
 */
export function computeEvidenceScore(rows: EvidenceRow[], now = new Date()): number {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const ratio =
      row.maxScore && row.maxScore > 0 && row.score != null
        ? Math.max(0, Math.min(1, row.score / row.maxScore))
        : 1;
    const activityWeight =
      row.sourceType === EvidenceSourceType.ACTIVITY_EVALUATION
        ? Math.max(0.2, Math.min(2, row.weight / 5))
        : 1;
    const ageMonths = Math.max(
      0,
      (now.getTime() - row.occurredAt.getTime()) / (30.44 * 24 * 60 * 60 * 1000),
    );
    const recency = 0.5 ** (ageMonths / RECENCY_HALF_LIFE_MONTHS);
    total += SOURCE_WEIGHT[row.sourceType] * activityWeight * ratio * recency;
  }
  const distinct = new Set(rows.map((r) => r.sourceType)).size;
  if (distinct >= 3) total += DIVERSITY_BONUS;
  return Math.max(0, Math.min(100, Math.round(total)));
}

/** Recompute the CandidateSkill cache from its evidence rows. */
export async function recomputeCandidateSkill(
  candidateSkillId: string,
  db: Db = prisma,
): Promise<void> {
  const rows = await db.skillEvidence.findMany({
    where: { candidateSkillId },
    select: {
      sourceType: true,
      score: true,
      maxScore: true,
      weight: true,
      occurredAt: true,
    },
  });
  const lastEvidenceAt = rows.reduce<Date | null>(
    (acc, r) => (!acc || r.occurredAt > acc ? r.occurredAt : acc),
    null,
  );
  await db.candidateSkill.update({
    where: { id: candidateSkillId },
    data: {
      evidenceCount: rows.length,
      // "Verified" means someone other than the candidate attested to it.
      verified: rows.length > 0,
      evidenceScore: computeEvidenceScore(rows),
      lastEvidenceAt,
    },
  });
}

/**
 * Write one evidence row and refresh the cache it feeds. Never throws into a
 * caller's domain path: evidence failing must not fail a submission.
 */
export async function emitSkillEvidence(
  input: EmitSkillEvidenceInput,
): Promise<void> {
  try {
    const db = writeClient();
    // CandidateProfile is the parent of CandidateSkill; a candidate with no
    // profile row yet simply has nowhere to hang evidence.
    const profile = await db.candidateProfile.findUnique({
      where: { userId: input.userId },
      select: { userId: true },
    });
    if (!profile) return;

    const candidateSkill = await db.candidateSkill.upsert({
      where: { userId_skillId: { userId: input.userId, skillId: input.skillId } },
      // Evidence can arrive for a skill the candidate never claimed — that is
      // the point. `claimedByCandidate` stays false until they claim it.
      create: {
        userId: input.userId,
        skillId: input.skillId,
        claimedByCandidate: false,
      },
      update: {},
      select: { id: true },
    });

    await db.skillEvidence.upsert({
      where: {
        candidateSkillId_sourceType_sourceId: {
          candidateSkillId: candidateSkill.id,
          sourceType: input.sourceType,
          sourceId: input.sourceKey,
        },
      },
      create: {
        candidateSkillId: candidateSkill.id,
        sourceType: input.sourceType,
        sourceId: input.sourceKey,
        sourceLabel: input.sourceLabel.slice(0, 200),
        score: input.score ?? null,
        maxScore: input.maxScore ?? null,
        weight: Math.max(1, Math.min(10, input.weight ?? 1)),
        occurredAt: input.occurredAt,
      },
      // A re-grade updates the score; provenance and time stay as they were.
      update: {
        score: input.score ?? null,
        maxScore: input.maxScore ?? null,
      },
    });

    await recomputeCandidateSkill(candidateSkill.id, db);
  } catch (err) {
    logger.error("[skill-evidence] emit failed", {
      userId: input.userId,
      skillId: input.skillId,
      sourceType: input.sourceType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
