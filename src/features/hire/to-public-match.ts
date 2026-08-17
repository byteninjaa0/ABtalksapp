import type { MatchCardData } from "@/components/hire/match-card";
import type { ScoredCandidate } from "@/features/hire/types";
import { formatBandLpa } from "@/features/hire/compensation";
import { ROLE_FAMILY_LABEL } from "@/features/hire/role-family";

/** The candidate's own words where there are any, the derived bucket otherwise. */
function declaredRole(match: ScoredCandidate): string {
  const raw = match.dossier?.rawRoleLabel.value ?? match.jobRole;
  if (raw && raw !== "Not stated") return raw;
  const family = match.dossier?.roleFamily.value;
  return family ? ROLE_FAMILY_LABEL[family] : "Candidate";
}

/**
 * What a browser is allowed to see of a scored candidate.
 *
 * Drops name, company, userId and any other identity. The card type already
 * forbids those fields — this is the one mapper so a guest action cannot
 * accidentally spread a ScoredCandidate across the wire.
 */
export function toPublicMatch(
  match: ScoredCandidate & { rationale?: string | null },
  opts?: {
    shortlisted?: boolean;
    coverageNote?: string | null;
    highlightSkills?: string[];
  },
): MatchCardData {
  const band = match.dossier?.compensation.estimate ?? null;
  const ev = match.dossier?.evidence;
  return {
    candidateRef: match.candidateRef,
    source: match.source,
    programMemberId: match.programMemberId,
    // The raw job title is free text the member typed ("STUDENT", "B.Tech 3rd
    // year Student"). The derived family is the readable version; the raw one
    // stays on the dossier for the profile page to attribute properly.
    //
    // Most challenge participants never stated a role at all, and "Not stated"
    // as the heading of every second card tells a recruiter nothing. The
    // derived family is what the card is actually about — it is marked DERIVED
    // on the dossier, so nothing here is passed off as the candidate's claim.
    jobRole: declaredRole(match),
    score: match.score,
    tier: match.tier,
    rationale: match.rationale ?? null,
    gaps: match.gaps,
    availabilityUnknown: match.availabilityUnknown,
    shortlisted: opts?.shortlisted ?? false,
    engagementStatus: null,
    compensationBand: band ? formatBandLpa(band) : null,
    coverageNote: opts?.coverageNote ?? null,
    highlightSkills: opts?.highlightSkills?.length
      ? opts.highlightSkills
      : undefined,
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
      // Shown, never scored — see the notes on these facts in types.ts.
      certificateIssued: ev?.certificateIssued?.value ?? false,
      quizAverage: ev?.quizAverage?.value ?? null,
      totalTrackDays: ev?.cohortProgress.value.ofDays ?? null,
    },
  };
}
