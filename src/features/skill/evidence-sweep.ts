import "server-only";
import { EvidenceSourceType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { emitSkillEvidence } from "@/repositories/skill-evidence";

/**
 * Plan 151 §20 / §31.4 — evidence derived from the rows the platform already
 * wrote, rather than from hooks scattered through every submit path.
 *
 * Idempotent: every source row has a stable id, and `emitSkillEvidence` keys on
 * it, so a re-run writes nothing new. Widen the window to backfill history.
 */

export type EvidenceSweepResult = {
  activityEvaluations: number;
  credentials: number;
  assessmentScores: number;
  emitted: number;
};

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_BATCH = 500;

export async function runSkillEvidenceSweep(opts?: {
  windowHours?: number;
  batch?: number;
  /** All history. Used by the backfill script. */
  allTime?: boolean;
}): Promise<EvidenceSweepResult> {
  const batch = opts?.batch ?? DEFAULT_BATCH;
  const since = opts?.allTime
    ? new Date(0)
    : new Date(Date.now() - (opts?.windowHours ?? DEFAULT_WINDOW_HOURS) * 3600_000);

  const result: EvidenceSweepResult = {
    activityEvaluations: 0,
    credentials: 0,
    assessmentScores: 0,
    emitted: 0,
  };

  // 1. Passed activities → evidence per ActivitySkill link.
  const evaluations = await prisma.activityEvaluation.findMany({
    where: { passed: true, isAuthoritative: true, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: batch,
    select: {
      id: true,
      score: true,
      maxScore: true,
      createdAt: true,
      attempt: {
        select: {
          enrollment: { select: { userId: true } },
          activity: {
            select: {
              title: true,
              type: true,
              skills: { select: { skillId: true, weight: true } },
            },
          },
        },
      },
    },
  });
  for (const evaluation of evaluations) {
    const userId = evaluation.attempt.enrollment.userId;
    const activity = evaluation.attempt.activity;
    result.activityEvaluations += 1;
    for (const link of activity.skills) {
      await emitSkillEvidence({
        userId,
        skillId: link.skillId,
        sourceType: EvidenceSourceType.ACTIVITY_EVALUATION,
        sourceKey: evaluation.id,
        sourceLabel: activity.title,
        score: evaluation.score,
        maxScore: evaluation.maxScore,
        weight: link.weight,
        occurredAt: evaluation.createdAt,
      });
      result.emitted += 1;
    }
  }

  // 2. Issued credentials → evidence per ProgramSkill of the programme behind
  //    the cohort. A completion is what turns a skill Verified.
  const credentials = await prisma.credential.findMany({
    where: { status: "ISSUED", issuedAt: { gte: since } },
    orderBy: { issuedAt: "asc" },
    take: batch,
    select: {
      id: true,
      userId: true,
      title: true,
      issuedAt: true,
      sourceType: true,
      sourceKey: true,
    },
  });
  for (const credential of credentials) {
    const skillIds = await skillsForCredential(credential.sourceType, credential.sourceKey);
    if (skillIds.length === 0) continue;
    result.credentials += 1;
    for (const skillId of skillIds) {
      await emitSkillEvidence({
        userId: credential.userId,
        skillId,
        sourceType:
          credential.sourceType === "HACKATHON_TEAM"
            ? EvidenceSourceType.HACKATHON
            : EvidenceSourceType.CREDENTIAL,
        sourceKey: credential.id,
        sourceLabel: credential.title,
        occurredAt: credential.issuedAt,
      });
      result.emitted += 1;
    }
  }

  // 3. Assessment scores that name a skill.
  const scores = await prisma.assessmentScore.findMany({
    where: { skillId: { not: null }, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: batch,
    select: {
      id: true,
      skillId: true,
      score: true,
      maxScore: true,
      createdAt: true,
      report: { select: { candidateUserId: true, title: true } },
    },
  });
  for (const score of scores) {
    if (!score.skillId || !score.report) continue;
    result.assessmentScores += 1;
    await emitSkillEvidence({
      userId: score.report.candidateUserId,
      skillId: score.skillId,
      sourceType: EvidenceSourceType.ASSESSMENT_SCORE,
      sourceKey: score.id,
      sourceLabel: score.report.title,
      score: score.score,
      maxScore: score.maxScore,
      occurredAt: score.createdAt,
    });
    result.emitted += 1;
  }

  logger.info("[skill-evidence] sweep complete", { ...result });
  return result;
}

/** Which skills a credential attests to, by what issued it. */
async function skillsForCredential(
  sourceType: string,
  sourceKey: string,
): Promise<string[]> {
  const programId =
    sourceType === "PROGRAM_ENROLLMENT"
      ? (
          await prisma.programEnrollment.findUnique({
            where: { id: sourceKey },
            select: {
              cohort: {
                select: { programVersion: { select: { programId: true } } },
              },
            },
          })
        )?.cohort.programVersion.programId
      : sourceType === "COHORT"
        ? (
            await prisma.cohort.findUnique({
              where: { id: sourceKey },
              select: { programVersion: { select: { programId: true } } },
            })
          )?.programVersion.programId
        : null;
  if (!programId) return [];
  const links = await prisma.programSkill.findMany({
    where: { programId },
    select: { skillId: true },
  });
  return links.map((l) => l.skillId);
}
