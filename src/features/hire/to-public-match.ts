import type { MatchCardData } from "@/components/hire/match-card";
import type { ScoredCandidate } from "@/features/hire/types";

/**
 * What a browser is allowed to see of a scored candidate.
 *
 * Drops name, company, userId and any other identity. The card type already
 * forbids those fields — this is the one mapper so a guest action cannot
 * accidentally spread a ScoredCandidate across the wire.
 */
export function toPublicMatch(
  match: ScoredCandidate & { rationale?: string | null },
  opts?: { shortlisted?: boolean },
): MatchCardData {
  return {
    programMemberId: match.programMemberId,
    jobRole: match.jobRole,
    score: match.score,
    tier: match.tier,
    rationale: match.rationale ?? null,
    gaps: match.gaps,
    availabilityUnknown: match.availabilityUnknown,
    shortlisted: opts?.shortlisted ?? false,
    engagementStatus: null,
    evidence: {
      skills: match.evidence.skills,
      missionPoints: match.evidence.missionPoints,
      cleanPassCount: match.evidence.cleanPassCount,
      commitDayCount: match.evidence.commitDayCount,
      projectScores: match.evidence.projectScores,
      yearsExperience: match.evidence.yearsExperience,
    },
  };
}
