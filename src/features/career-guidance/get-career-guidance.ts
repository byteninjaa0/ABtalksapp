import "server-only";
import {
  CertificateStatus,
  CertificateType,
  EnrollmentStatusV2,
  ProgramMemberStatus,
} from "@prisma/client";
import { isHackathonRegistrationOpen } from "@/components/hackathon/hackathon-config";
import { isUserRegistered } from "@/features/hackathon/registration-status";
import { evaluateRules } from "@/features/career-guidance/rules";
import { getIstDateKey, getIstWeekKey } from "@/lib/date-utils";
import type { GuidanceTargeting } from "@/features/career-guidance/catalog";
import { getMyQuests } from "@/features/gamification/loaders";
import { isQuestsEnabled } from "@/lib/feature-flags";
import type {
  AiCohortStatus,
  CandidateFacts,
  ChallengeFact,
  DailyCard,
  GuidanceItem,
  MockFact,
  TrackStatus,
} from "@/features/career-guidance/types";
import {
  isClaudeEnabled,
  isDatabricksEnabled,
  isDsArchitectEnabled,
  isPowerBiEnabled,
  isProgramEnabled,
} from "@/lib/feature-flags";
import { getCareerGuidanceFacts } from "@/repositories/candidate-detail";
import { findDatabricksEnrollment } from "@/repositories/databricks";
import { findDsArchitectEnrollment } from "@/repositories/ds-architect";
import {
  findActiveMembership,
  listChallengeEnrollments,
} from "@/repositories/learning";
import { findPowerBiEnrollment } from "@/repositories/powerbi";
import { listForUser } from "@/repositories/credentials";
import { certificateTypeFromCredentialTitle } from "@/features/certificate/constants";

function peToTrackStatus(
  status: EnrollmentStatusV2 | undefined,
): TrackStatus | null {
  if (!status) return null;
  if (
    status === EnrollmentStatusV2.DROPPED ||
    status === EnrollmentStatusV2.REMOVED
  ) {
    return null;
  }
  if (status === EnrollmentStatusV2.COMPLETED) return "COMPLETED";
  return "ACTIVE";
}

function memberToAiCohortStatus(
  status: ProgramMemberStatus | undefined,
): AiCohortStatus {
  if (!status) return null;
  if (status === ProgramMemberStatus.DROPPED) return null;
  if (status === ProgramMemberStatus.COMPLETED) return "COMPLETED";
  if (
    status === ProgramMemberStatus.APPLIED ||
    status === ProgramMemberStatus.WAITLISTED
  ) {
    return "APPLIED";
  }
  if (status === ProgramMemberStatus.ENROLLED) return "ACTIVE";
  return null;
}

export type CareerGuidancePayload = {
  items: GuidanceItem[];
  targeting: GuidanceTargeting;
  istDay: string;
  istWeek: string;
  questCards: DailyCard[];
};

/**
 * Assemble this candidate's facts and evaluate the progression edge table.
 * Mocks are passed in from the hub (already loaded).
 */
export async function getCareerGuidance(
  userId: string,
  mocks: MockFact[],
): Promise<CareerGuidancePayload> {
  const [
    challengeRows,
    membership,
    databricks,
    dsArchitect,
    powerBi,
    hackathonRegistered,
    profile,
    credentials,
  ] = await Promise.all([
    listChallengeEnrollments(userId),
    findActiveMembership(userId),
    findDatabricksEnrollment(userId),
    findDsArchitectEnrollment(userId),
    findPowerBiEnrollment(userId),
    isUserRegistered(userId),
    getCareerGuidanceFacts(userId),
    listForUser(userId),
  ]);

  const challenges: ChallengeFact[] = challengeRows.map((row) => ({
    domain: row.domain,
    status: row.status,
    daysCompleted: row.daysCompleted,
  }));

  const hasClaudeCredential = credentials.some((row) => {
    if (row.status === CertificateStatus.REVOKED) return false;
    if (row.type === CertificateType.CLAUDE_CHALLENGE) return true;
    return (
      certificateTypeFromCredentialTitle(row.title) ===
      CertificateType.CLAUDE_CHALLENGE
    );
  });

  const facts: CandidateFacts = {
    challenges,
    aiCohortStatus: memberToAiCohortStatus(membership?.member.status),
    databricksStatus: peToTrackStatus(databricks?.status),
    dsArchitectStatus: peToTrackStatus(dsArchitect?.status),
    powerBiStatus: peToTrackStatus(powerBi?.status),
    hackathonRegistered,
    hackathonRegistrationOpen: isHackathonRegistrationOpen(),
    hasClaudeCredential,
    skills: profile.skills,
    preferredRoles: profile.preferredRoles,
    flags: {
      program: isProgramEnabled(),
      databricks: isDatabricksEnabled(),
      dsArchitect: isDsArchitectEnabled(),
      powerBi: isPowerBiEnabled(),
      claude: isClaudeEnabled(),
    },
    mocks,
  };

  const quests = isQuestsEnabled() ? await getMyQuests(userId) : [];
  const questCards: DailyCard[] = quests.slice(0, 1).map((q) => {
    const step = q.tasks[q.currentIndex] ?? q.tasks[0];
    return {
      id: `quest:${q.slug}`,
      source: "profile" as const,
      kind: "quest" as const,
      title: q.name,
      body: step
        ? `${step.label} (${step.current}/${step.required})`
        : q.description,
      ctaLabel: "Continue",
      href: q.href,
    };
  });

  return {
    items: evaluateRules(facts),
    targeting: {
      challengeDomains: [
        ...new Set(
          challenges
            .filter((c) => c.status === "ACTIVE" || c.status === "COMPLETED")
            .map((c) => c.domain),
        ),
      ],
      aiCohortActive: facts.aiCohortStatus === "ACTIVE",
      aiCohortCompleted: facts.aiCohortStatus === "COMPLETED",
      skillNames: profile.skills.map((s) => s.name),
      preferredRoles: profile.preferredRoles,
      skillsEmpty: profile.skills.length === 0,
    },
    istDay: getIstDateKey(),
    istWeek: getIstWeekKey(),
    questCards,
  };
}
