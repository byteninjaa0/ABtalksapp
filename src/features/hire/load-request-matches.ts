import "server-only";

import { prisma } from "@/lib/db";
import {
  loadRecruiterExperienceSummaries,
  listProgramMemberLabels,
  listUserDisplayNames,
} from "@/repositories/hire";
import { filterSearchableUserIds } from "@/repositories/talent";
import { listCandidateAvailability } from "@/repositories/candidate";
import { activeAvailability } from "@/features/hire/availability-access";
import { encodeCandidateRef } from "@/features/hire/candidate-ref";
import { existingEngagements } from "@/features/hire/contact-access";
import { estimateCompensation, formatBandLpa } from "@/features/hire/compensation";
import { roleFamilyFor, tidyRoleLabel } from "@/features/hire/role-family";
import type { MatchTier } from "@/features/hire/types";
import type { MatchCardData } from "@/components/hire/match-card";
import {
  pickPublicEvidence,
  pickPublicScores,
} from "@/features/hire/to-public-match";

/**
 * Matches for one requirement, ready to render, for one recruiter.
 *
 * Shared by the requirement page and the full candidate list. It is one place
 * on purpose: the query is scoped to the caller's own request, and it
 * selects given name for the card heading. Company, email and profile URLs
 * stay off this query.
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
      mustHaveStack: true,
      matches: {
        orderBy: { score: "desc" },
        select: {
          candidateUserId: true,
          programMemberId: true,
          source: true,
          score: true,
          tier: true,
          scoreBreakdown: true,
          rationale: true,
          gaps: true,
          availabilityUnknown: true,
          evidence: true,
        },
      },
    },
  });
  if (!request) return null;

  // Every match is keyed on a person, so this needs no per-source branching.
  const storedUserIds = request.matches.map((m) => m.candidateUserId);

  // A saved match list is a discovery surface, not an archive. `TalentRequestMatch`
  // is a snapshot frozen at match time, so a candidate who has since been made
  // unsearchable would keep rendering on a recruiter's saved request forever
  // unless the gate is re-applied on read. Engagement requests are different and
  // deliberately not filtered — those are the record of an introduction that has
  // already happened.
  const stillSearchable = await filterSearchableUserIds(storedUserIds);
  const visibleMatches = request.matches.filter((m) =>
    stillSearchable.has(m.candidateUserId),
  );
  const candidateUserIds = visibleMatches.map((m) => m.candidateUserId);

  // Availability is read LIVE, never from the frozen evidence blob.
  //
  // Same reasoning the compensation comment below already records, and the same
  // reasoning as the searchability re-filter above: `TalentRequestMatch.evidence`
  // is a snapshot, and `docs/legal/hire-availability-privacy-note.md` promises
  // that turning open-to-work off removes a candidate from availability-filtered
  // results *immediately*. A city frozen into a row last month is exactly the
  // disclosure that promise forbids, so the stored `locationLabel` is ignored
  // and the label is rebuilt from what is true right now — or dropped.
  const liveAvailability = await listCandidateAvailability(
    candidateUserIds,
  ).catch(() => new Map());

  // Professional name / role / shortlist state still live on ProgramMember.
  // Loaded from the provenance id in a separate query rather than through a
  // relation, because the match row no longer has one — the candidate is the
  // user, and the cohort row is only where the evidence was read from.
  const provenanceMemberIds = [
    ...new Set(
      visibleMatches
        .map((m) => m.programMemberId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [engagements, cartCount, nameByUser, members, experienceByUser] = await Promise.all([
    existingEngagements(recruiterUserId, candidateUserIds),
    prisma.recruiterShortlistItem.count({ where: { recruiterUserId } }),
    listUserDisplayNames(candidateUserIds),
    listProgramMemberLabels(provenanceMemberIds, {
      shortlistedByRecruiterUserId: recruiterUserId,
    }),
    loadRecruiterExperienceSummaries(candidateUserIds),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));
  return {
    title: request.title,
    status: request.status,
    alertWhenAvailable: request.alertWhenAvailable,
    cartCount,
    matches: visibleMatches.map((m): MatchCardData => {
      const raw =
        m.evidence && typeof m.evidence === "object"
          ? (m.evidence as Record<string, unknown>)
          : {};
      const evidence = pickPublicEvidence(raw);
      // Older rows stored CandidateEvidence.interview as a nested object.
      const nested = raw.interview;
      if (nested && typeof nested === "object") {
        const iv = nested as Record<string, unknown>;
        if (evidence.interviewOverall == null && typeof iv.overall === "number") {
          evidence.interviewOverall = iv.overall;
        }
        if (evidence.interviewComm == null && typeof iv.comm === "number") {
          evidence.interviewComm = iv.comm;
        }
        if (evidence.interviewTech == null && typeof iv.tech === "number") {
          evidence.interviewTech = iv.tech;
        }
        if (evidence.interviewProblem == null && typeof iv.problem === "number") {
          evidence.interviewProblem = iv.problem;
        }
      }
      const storedRankKey =
        typeof raw.rankKey === "number" && Number.isFinite(raw.rankKey)
          ? raw.rankKey
          : null;
      const live = activeAvailability(
        liveAvailability.get(m.candidateUserId) ?? null,
      );
      const storedLocation =
        live?.preferredCities
          .map((c) => c.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(" · ") || null;
      const source = m.source === "PROGRAM" ? "PROGRAM" : m.source;
      const isProgram = source === "PROGRAM";
      const member = m.programMemberId
        ? memberById.get(m.programMemberId)
        : undefined;
      // The stored evidence blob carries the challenge candidate's role label;
      // there is no ProgramMember row to read it from.
      const rawRole =
        member?.jobRole ??
        (typeof (m.evidence as { jobRole?: unknown })?.jobRole === "string"
          ? ((m.evidence as { jobRole: string }).jobRole)
          : "");
      // Recomputed rather than stored: the band is a view of the role and the
      // tier, and a frozen copy would drift the moment the table is retuned.
      const band = estimateCompensation({
        roleFamily: roleFamilyFor(rawRole),
        yearsExperience: evidence.yearsExperience ?? 0,
        evidenceTier: m.tier as MatchTier,
        missionsPassed: evidence.missionsPassed ?? 0,
      });
      return {
        candidateRef: encodeCandidateRef(
          source === "PROGRAM" ||
            source === "CLAUDE" ||
            source === "CHALLENGE_60" ||
            source === "HACKATHON"
            ? source
            : "CLAUDE",
          (isProgram ? m.programMemberId : m.candidateUserId) ?? "",
        ),
        source:
          source === "PROGRAM" ||
          source === "CLAUDE" ||
          source === "CHALLENGE_60" ||
          source === "HACKATHON"
            ? source
            : "CLAUDE",
        programMemberId: m.programMemberId,
        displayName:
          (member?.fullName?.trim() || nameByUser.get(m.candidateUserId)) ?? null,
        professionalExperience:
          experienceByUser.get(m.candidateUserId) ?? undefined,
        jobRole: rawRole ? tidyRoleLabel(rawRole) : "Candidate",
        locationLabel: storedLocation,
        score: m.score,
        rankKey: storedRankKey ?? m.score,
        tier: m.tier,
        rationale: m.rationale,
        gaps: m.gaps,
        // Live, not frozen — same reason as `storedLocation` above. A stored
        // `false` would keep asserting "availability shared" after the
        // candidate withdrew.
        availabilityUnknown: live == null,
        shortlisted: (member?.shortlistedBy?.length ?? 0) > 0,
        engagementStatus: engagements.get(m.candidateUserId)?.status ?? null,
        scores: pickPublicScores(m.scoreBreakdown),
        // Always the recomputed ABTalks band, never a stored declared figure.
        // The candidate's own expectation is admin-only (see to-public-match.ts);
        // reading it back out of a frozen evidence blob would reopen exactly the
        // exposure that was closed on the write side.
        compensationBand: band ? formatBandLpa(band) : null,
        compensationDeclared: false,
        highlightSkills: request.mustHaveStack.length
          ? request.mustHaveStack
          : undefined,
        evidence,
      };
    }),
  };
}
