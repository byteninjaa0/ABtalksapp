import { z } from "zod";

export const talentCandidateSourceSchema = z.enum([
  "PROGRAM",
  "CHALLENGE_60",
  "CLAUDE",
  "HACKATHON",
]);

export const talentEngagementStatusSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "CONTACT_SHARED",
  "DECLINED",
  "CLOSED",
]);

/**
 * A recruiter asking to be introduced to one candidate.
 *
 * `programMemberId` is the internal id, never the AB-#### label — that is a
 * display string and must not be usable to address a row.
 */
export const placeEngagementRequestSchema = z.object({
  programMemberId: z.string().cuid(),
  requestId: z.string().cuid().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const engagementMessageSchema = z.object({
  engagementId: z.string().cuid(),
  body: z.string().trim().min(1).max(2000),
});

/** Admin decision on a request. Only these transitions are offered. */
export const decideEngagementSchema = z.object({
  engagementId: z.string().cuid(),
  decision: z.enum(["IN_REVIEW", "CONTACT_SHARED", "DECLINED", "CLOSED"]),
  note: z.string().trim().max(2000).optional(),
});

export type PlaceEngagementRequestInput = z.infer<
  typeof placeEngagementRequestSchema
>;
