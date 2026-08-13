import type { MatchCardData } from "@/components/hire/match-card";
import type { ScoredCandidate } from "@/features/hire/types";
import { formatBandLpa } from "@/features/hire/compensation";

/**
 * What a browser is allowed to see of a scored candidate.
 *
 * Drops name, company, userId and any other identity. The card type already
 * forbids those fields — this is the one mapper so a guest action cannot
 * accidentally spread a ScoredCandidate across the wire.
 */
export function toPublicMatch(
  match: ScoredCandidate & { rationale?: string | null },
  opts?: { shortlisted?: boolean; coverageNote?: string | null },
): MatchCardData {
  const band = match.dossier?.compensation.estimate ?? null;
  return {
    programMemberId: match.programMemberId,
    // The raw job title is free text the member typed ("STUDENT", "B.Tech 3rd
    // year Student"). The derived family is the readable version; the raw one
    // stays on the dossier for the profile page to attribute properly.
    jobRole: match.dossier?.rawRoleLabel.value ?? match.jobRole,
    score: match.score,
    tier: match.tier,
    rationale: match.rationale ?? null,
    gaps: match.gaps,
    availabilityUnknown: match.availabilityUnknown,
    shortlisted: opts?.shortlisted ?? false,
    engagementStatus: null,
    compensationBand: band ? formatBandLpa(band) : null,
    coverageNote: opts?.coverageNote ?? null,
    evidence: {
      skills: match.evidence.skills,
      missionPoints: match.evidence.missionPoints,
      missionsPassed: match.evidence.missionsPassed,
      missionsAttempted: match.evidence.missionsAttempted,
      cleanPassCount: match.evidence.cleanPassCount,
      commitDayCount: match.evidence.commitDayCount,
      projectScores: match.evidence.projectScores,
      yearsExperience: match.evidence.yearsExperience,
      workingLanguages: match.evidence.workingLanguages,
      cohortDay: match.evidence.cohortDay,
    },
  };
}
