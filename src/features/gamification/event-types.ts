/**
 * Plan 151 — gamification event registry.
 *
 * Client-safe: no server-only marker, no Prisma client, no lib runtime
 * imports. The same constraint notification/types.ts has. Middleware must
 * never import this file.
 *
 * Naming: `<domain>.<past_tense>` lowercase strings. A shipped key is never
 * renamed. Idempotency key = `"<type>:<scope>"`.
 */
import { z } from "zod";

export const GAMIFICATION_EVENT_TYPES = [
  "activity.passed",
  "enrollment.started",
  "enrollment.completed",
  "credential.issued",
  "profile.section_completed",
  "hackathon.registered",
  "hackathon.submitted",
  "hackathon.placed",
  "assessment.completed",
  "mock_interview.completed",
  "referral.qualified",
  "skill_evidence.added",
] as const;

export type GamificationEventType = (typeof GAMIFICATION_EVENT_TYPES)[number];

export const XP_CATEGORIES = [
  "LEARNING",
  "BUILDING",
  "CAREER",
  "COMPETITION",
  "COMMUNITY",
] as const;

export type XpCategoryName = (typeof XP_CATEGORIES)[number];

const id = z.string().min(1).max(128);
const enumStr = z.string().min(1).max(64);
const boundedInt = z.number().int().min(0).max(100_000);

/** Payloads carry ids and enums only. No email, phone, name, URL text. */
const activityPassedPayload = z
  .object({
    activityId: id,
    enrollmentId: id.optional(),
    activityType: enumStr,
    estimatedMinutes: boundedInt.nullable().optional(),
    difficulty: enumStr.nullable().optional(),
    lateness: enumStr,
    hasGithubProof: z.boolean(),
    missionType: enumStr.nullable().optional(),
    programId: id.optional(),
    isAdminIssued: z.boolean().optional(),
  })
  .strict();

const enrollmentPayload = z
  .object({
    enrollmentId: id,
    cohortId: id.optional(),
    programId: id.optional(),
    enrollmentXp: boundedInt.optional(),
  })
  .strict();

const credentialPayload = z
  .object({
    credentialId: id,
    credentialType: enumStr,
    sourceType: enumStr,
    hackathonVariant: enumStr.nullable().optional(),
  })
  .strict();

const profileSectionPayload = z
  .object({
    sectionKey: enumStr,
    completeness: z.number().int().min(0).max(100).optional(),
    hasHeadline: z.boolean().optional(),
    hasEducation: z.boolean().optional(),
    hasProject: z.boolean().optional(),
  })
  .strict();

const hackathonRegisteredPayload = z
  .object({
    eventId: enumStr,
    teamId: id.optional(),
  })
  .strict();

const hackathonSubmittedPayload = z
  .object({
    eventId: enumStr,
    teamId: id,
    repoPublic: z.boolean(),
    liveOk: z.boolean(),
    duplicateRepo: z.boolean().optional(),
  })
  .strict();

const hackathonPlacedPayload = z
  .object({
    eventId: enumStr,
    variant: enumStr,
    phoneVerified: z.boolean().optional(),
    joinedWithin48h: z.boolean().optional(),
  })
  .strict();

const assessmentPayload = z
  .object({
    assignmentId: id,
  })
  .strict();

const mockPayload = z
  .object({
    mockInterviewId: id,
  })
  .strict();

const referralPayload = z
  .object({
    referralId: id,
  })
  .strict();

const skillEvidencePayload = z
  .object({
    evidenceId: id,
    skillId: id.optional(),
  })
  .strict();

export const EVENT_PAYLOAD_SCHEMAS = {
  "activity.passed": activityPassedPayload,
  "enrollment.started": enrollmentPayload,
  "enrollment.completed": enrollmentPayload,
  "credential.issued": credentialPayload,
  "profile.section_completed": profileSectionPayload,
  "hackathon.registered": hackathonRegisteredPayload,
  "hackathon.submitted": hackathonSubmittedPayload,
  "hackathon.placed": hackathonPlacedPayload,
  "assessment.completed": assessmentPayload,
  "mock_interview.completed": mockPayload,
  "referral.qualified": referralPayload,
  "skill_evidence.added": skillEvidencePayload,
} as const;

export const EVENT_SOURCE_TYPES: Record<GamificationEventType, string> = {
  "activity.passed": "ActivityEvaluation",
  "enrollment.started": "ProgramEnrollment",
  "enrollment.completed": "ProgramEnrollment",
  "credential.issued": "Credential",
  "profile.section_completed": "CandidateProfile",
  "hackathon.registered": "HackathonParticipant",
  "hackathon.submitted": "HackathonSubmission",
  "hackathon.placed": "Credential",
  "assessment.completed": "AssessmentAttemptSession",
  "mock_interview.completed": "MockInterviewReport",
  "referral.qualified": "Referral",
  "skill_evidence.added": "SkillEvidence",
};

/** Events that can carry XP (§5.1). Everything else is 0 XP. */
export const XP_EVENT_TYPES: ReadonlySet<GamificationEventType> = new Set([
  "activity.passed",
  "enrollment.completed",
  "credential.issued",
  "profile.section_completed",
  "hackathon.submitted",
  "hackathon.placed",
  "assessment.completed",
  "mock_interview.completed",
  "referral.qualified",
]);

export const ZERO_XP_EVENT_TYPES: ReadonlySet<GamificationEventType> = new Set([
  "enrollment.started",
  "hackathon.registered",
  "skill_evidence.added",
]);

const PAYLOAD_MAX_BYTES = 1024;

export function isGamificationEventType(
  value: string,
): value is GamificationEventType {
  return (GAMIFICATION_EVENT_TYPES as readonly string[]).includes(value);
}

export function buildIdempotencyKey(
  type: GamificationEventType,
  scopeKey: string,
): string {
  return `${type}:${scopeKey}`;
}

export function parseEventPayload(
  type: GamificationEventType,
  payload: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  if (payload == null) {
    return { ok: true, data: {} };
  }
  const encoded = JSON.stringify(payload);
  if (encoded.length > PAYLOAD_MAX_BYTES) {
    return { ok: false, message: "payload exceeds 1 KB" };
  }
  const schema = EVENT_PAYLOAD_SCHEMAS[type];
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "payload rejected" };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}
