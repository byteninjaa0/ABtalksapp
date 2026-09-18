import "server-only";
import {
  AchievementSourceType,
  CredentialStatus,
  CredentialType,
  EvidenceSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  deriveSkillStage,
  nextStageHint,
  strengthBand,
  type SkillStage,
} from "@/features/profile/skill-stage";

/**
 * The read-only half of the profile: what the platform can actually attest to.
 *
 * Everything here comes from rows another part of the system already wrote —
 * `SkillEvidence`, `Credential`, `CandidateAchievement`. Nothing is inferred,
 * scored, or synthesised here. A candidate with no history sees an empty state,
 * not an encouraging guess.
 *
 * This is the candidate looking at their own profile, so it is unfiltered.
 *
 * Recruiter visibility is deliberately NOT read or returned here (plan 133).
 * Whether and how a recruiter sees a candidate is decided by the platform —
 * `searchableUserWhere` for eligibility and moderation, one field policy for
 * what is shown — and none of it is a candidate setting, so there is nothing
 * to report back to the candidate as though it were theirs to change.
 */

export type SkillEvidenceItem = {
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  score: number | null;
  maxScore: number | null;
  occurredAt: Date;
};

export type VerifiedSkillView = {
  skillId: string;
  name: string;
  evidenceScore: number;
  evidenceCount: number;
  items: SkillEvidenceItem[];
  /** Derived from the evidence rows, never chosen by the candidate. */
  stage: SkillStage;
  band: "Emerging" | "Established" | "Strong";
  nextStageHint: string | null;
};

export type CredentialItem = {
  credentialId: string;
  title: string;
  type: CredentialType;
  issuedAt: Date;
};

export type AchievementItem = {
  id: string;
  title: string;
  description: string | null;
  outcomeLabel: string | null;
  sourceType: AchievementSourceType;
  occurredAt: Date;
  isPublic: boolean;
};

export type ProfileEvidence = {
  verifiedSkills: VerifiedSkillView[];
  credentials: CredentialItem[];
  achievements: AchievementItem[];
  hasAny: boolean;
};

export async function getProfileEvidence(
  userId: string,
): Promise<ProfileEvidence> {
  const [skillRows, credentials, achievements] = await Promise.all([
    // Verification is `SkillEvidence` and nothing else. `selfRated` is not read
    // here — a candidate calling themselves an expert is not evidence.
    prisma.candidateSkill.findMany({
      where: { userId, evidence: { some: {} } },
      orderBy: { evidenceScore: "desc" },
      select: {
        skillId: true,
        evidenceScore: true,
        evidenceCount: true,
        skill: { select: { name: true } },
        evidence: {
          orderBy: { occurredAt: "desc" },
          take: 8,
          select: {
            sourceType: true,
            sourceLabel: true,
            score: true,
            maxScore: true,
            occurredAt: true,
          },
        },
      },
    }),
    prisma.credential.findMany({
      where: { userId, status: CredentialStatus.ISSUED },
      orderBy: { issuedAt: "desc" },
      select: {
        credentialId: true,
        title: true,
        type: true,
        issuedAt: true,
      },
    }),
    prisma.candidateAchievement.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        outcomeLabel: true,
        sourceType: true,
        occurredAt: true,
        isPublic: true,
      },
    }),
  ]);

  const verifiedSkills: VerifiedSkillView[] = skillRows.map((row) => {
    const items = row.evidence.map((e) => ({
      sourceType: e.sourceType,
      sourceLabel: e.sourceLabel,
      score: e.score,
      maxScore: e.maxScore,
      occurredAt: e.occurredAt,
    }));
    const stage = deriveSkillStage(
      items.map((e) => ({
        sourceType: e.sourceType,
        score: e.score,
        maxScore: e.maxScore,
        weight: 1,
        occurredAt: e.occurredAt,
      })),
    );
    return {
      skillId: row.skillId,
      name: row.skill.name,
      evidenceScore: row.evidenceScore,
      evidenceCount: row.evidenceCount || row.evidence.length,
      items,
      stage,
      band: strengthBand(row.evidenceScore),
      nextStageHint: nextStageHint(stage),
    };
  });

  return {
    verifiedSkills,
    credentials,
    achievements,
    hasAny:
      verifiedSkills.length > 0 ||
      credentials.length > 0 ||
      achievements.length > 0,
  };
}
