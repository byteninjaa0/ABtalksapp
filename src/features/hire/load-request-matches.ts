import "server-only";

import { prisma } from "@/lib/db";
import { existingEngagements } from "@/features/hire/contact-access";
import type { MatchCardData } from "@/components/hire/match-card";

/**
 * Matches for one requirement, ready to render, for one recruiter.
 *
 * Shared by the requirement page and the full candidate list. It is one place
 * on purpose: the query is scoped to the caller's own request, and it
 * deliberately does not select `fullName` or `company` — a field that was never
 * fetched cannot be leaked by a later change to a card. Duplicating that across
 * two pages is how one copy quietly grows a name.
 */
export async function loadRequestMatches(
  requestId: string,
  recruiterUserId: string,
): Promise<{
  title: string;
  status: string;
  alertWhenAvailable: boolean;
  matches: MatchCardData[];
  cartCount: number;
} | null> {
  const request = await prisma.talentRequest.findFirst({
    where: { id: requestId, recruiterUserId },
    select: {
      title: true,
      status: true,
      alertWhenAvailable: true,
      matches: {
        orderBy: { score: "desc" },
        select: {
          programMemberId: true,
          score: true,
          tier: true,
          rationale: true,
          gaps: true,
          availabilityUnknown: true,
          evidence: true,
          programMember: {
            select: {
              jobRole: true,
              shortlistedBy: {
                where: { recruiterUserId },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!request) return null;

  const memberIds = request.matches
    .map((m) => m.programMemberId)
    .filter((id): id is string => id !== null);

  const [engagements, cartCount] = await Promise.all([
    existingEngagements(recruiterUserId, memberIds),
    prisma.recruiterShortlistItem.count({ where: { recruiterUserId } }),
  ]);

  return {
    title: request.title,
    status: request.status,
    alertWhenAvailable: request.alertWhenAvailable,
    cartCount,
    matches: request.matches.map((m): MatchCardData => ({
      programMemberId: m.programMemberId,
      jobRole: m.programMember?.jobRole ?? "Candidate",
      score: m.score,
      tier: m.tier,
      rationale: m.rationale,
      gaps: m.gaps,
      availabilityUnknown: m.availabilityUnknown,
      shortlisted: (m.programMember?.shortlistedBy?.length ?? 0) > 0,
      engagementStatus: m.programMemberId
        ? (engagements.get(m.programMemberId)?.status ?? null)
        : null,
      evidence:
        m.evidence && typeof m.evidence === "object"
          ? (m.evidence as MatchCardData["evidence"])
          : {},
    })),
  };
}
