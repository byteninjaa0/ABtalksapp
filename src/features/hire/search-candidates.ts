import "server-only";

import { logger } from "@/lib/logger";
import type { JobSpec } from "@/lib/validations/hire";
import { rankCandidates } from "@/features/hire/score-candidate";
import { buildDossierSet, computeCoverage } from "@/features/hire/dossier";
import {
  clearsEvidenceFloor,
  memberEligibilityWhere,
  resolvePoolCohorts,
} from "@/features/hire/pool-policy";
import { estimateCompensation } from "@/features/hire/compensation";
import type {
  EvidenceCoverage,
  ScoreableMember,
  ScoredCandidate,
} from "@/features/hire/types";

export type SearchCandidatesResult =
  | {
      ok: true;
      data: {
        cohortName: string | null;
        /** Whether the pool is a finished cohort or one still running. */
        stage: "PUBLISHED" | "OPEN_MIDCOHORT" | null;
        matches: ScoredCandidate[];
        /** Near-miss / hard-filtered, for gap analysis only (not shortlist). */
        nearMisses: ScoredCandidate[];
        totalEligible: number;
        /** Consenting members held back by the evidence floor — the honest
         *  denominator behind a thin shortlist. */
        belowEvidenceFloor: number;
        coverage: EvidenceCoverage;
      };
    }
  | { ok: false; message: string };

/**
 * Below this, a shortlist is padded out with the next best people rather than
 * left short. Five is enough to read a pool from; a strict list of one tells
 * the recruiter nothing about who else is here.
 */
const MIN_RESULTS = 5;

const EMPTY_COVERAGE: EvidenceCoverage = {
  dimensions: {
    stack: false,
    missions: false,
    cleanPass: false,
    projects: false,
    consistency: false,
    interview: false,
    experience: false,
  },
  note: "No candidates in the pool yet.",
};

/**
 * Phase B: deterministic Prisma load + pure scoring.
 * Never invents candidates. Empty pool → empty arrays (caller's gap UI).
 */
export async function searchCandidates(
  spec: JobSpec,
  opts?: { limit?: number },
): Promise<SearchCandidatesResult> {
  try {
    const gate = await resolvePoolCohorts();
    if (!gate.ok) {
      return {
        ok: true,
        data: {
          cohortName: null,
          stage: null,
          matches: [],
          nearMisses: [],
          totalEligible: 0,
          belowEvidenceFloor: 0,
          coverage: EMPTY_COVERAGE,
        },
      };
    }

    const cohortIds = gate.cohorts.map((c) => c.id);
    const set = await buildDossierSet(memberEligibilityWhere(cohortIds));

    // The floor is a preference, not a wall.
    //
    // As a hard exclusion it emptied the board: on a cohort two weeks in, the
    // members who have opted into recruiter visibility are mostly the ones who
    // have not finished three missions yet, so every search returned nothing
    // and the recruiter learned nothing at all. A thin, honestly-labelled list
    // beats a blank one — they can see the shape of the pool and decide.
    // Below-floor candidates rank below the rest and say why on the card.
    const aboveFloor = set.dossiers.filter((d) =>
      clearsEvidenceFloor(d.evidence.missionsPassed.value),
    );
    const belowEvidenceFloor = set.dossiers.length - aboveFloor.length;
    const eligible = set.dossiers;

    if (eligible.length === 0) {
      return {
        ok: true,
        data: {
          cohortName: gate.cohorts[0]?.name ?? null,
          stage: gate.cohorts[0]?.stage ?? null,
          matches: [],
          nearMisses: [],
          totalEligible: 0,
          belowEvidenceFloor,
          coverage: EMPTY_COVERAGE,
        },
      };
    }

    // Coverage is read from the members who cleared the floor when there are
    // any: someone who has not started cannot tell us whether this cohort
    // produces project scores. With none above the floor, the whole pool is the
    // only evidence there is.
    const coverage = computeCoverage(aboveFloor.length > 0 ? aboveFloor : eligible);

    const scoreable: ScoreableMember[] = eligible.map((d) => {
      const id = d.programMemberId!;
      const identity = set.identityByMember.get(id);
      const legacy = set.legacyStatsByMember.get(id);
      return {
        id,
        userId: d.userId ?? "",
        fullName: identity?.fullName ?? "",
        jobRole: identity?.jobRole ?? "",
        company: identity?.company ?? "",
        yearsExperience: d.yearsExperience.value,
        skills: d.declaredSkills.value,
        missionPoints: legacy?.missionPoints ?? 0,
        missionsPassed: d.evidence.missionsPassed.value,
        missionsAttempted: d.evidence.missionsAttempted.value,
        cleanPassCount: d.evidence.cleanPassCount.value,
        totalScore: legacy?.totalScore ?? 0,
        commitDayCount: d.evidence.commitDays.value,
        projectScores: d.evidence.projectScores.value,
        interview: d.evidence.interview.value,
        // The policy query already enforced both; re-stating them keeps the
        // pure scorer's own hard filters meaningful when it is called directly.
        hasVisibilityConsent: true,
        cohortPublished: true,
        status: legacy?.status ?? "ENROLLED",
        availability: d.availability,
        cohortDay: set.cohortDayByMember.get(id) ?? 1,
        dossier: d,
      };
    });

    const limit = opts?.limit ?? 25;
    const ranked = rankCandidates(scoreable, spec, {
      includeHardFiltered: true,
      limit: 100,
      coverage,
    });

    // The band needs the tier, and the tier needs the score — so the estimate
    // is attached after ranking rather than during dossier assembly.
    for (const r of ranked) {
      const d = r.dossier;
      if (!d) continue;
      d.compensation.estimate = estimateCompensation({
        roleFamily: d.roleFamily.value,
        yearsExperience: d.yearsExperience.value,
        evidenceTier: r.tier,
        missionsPassed: d.evidence.missionsPassed.value,
      });
    }

    // A recruiter with nobody on screen cannot judge the pool, the role or us.
    // So the shortlist is the ranked STRONG/PARTIAL list, and when that comes
    // back thin it is topped up with the next best people the pool has — still
    // carrying their real tier and their real gaps, never dressed up.
    const shown = ranked.filter((r) => !r.hardFiltered);
    const primary = shown.filter((r) => r.tier !== "NONE");
    const matches = (
      primary.length >= MIN_RESULTS
        ? primary
        : [...primary, ...shown.filter((r) => r.tier === "NONE")]
    ).slice(0, limit);

    const shownIds = new Set(matches.map((m) => m.programMemberId));
    const nearMisses = ranked
      .filter(
        (r) =>
          !shownIds.has(r.programMemberId) &&
          (r.hardFiltered ||
            r.tier === "NONE" ||
            (r.tier === "PARTIAL" && r.gaps.length > 0)),
      )
      .slice(0, 10);

    return {
      ok: true,
      data: {
        cohortName: gate.cohorts[0]?.name ?? null,
        stage: gate.cohorts[0]?.stage ?? null,
        matches,
        nearMisses,
        totalEligible: scoreable.length,
        belowEvidenceFloor,
        coverage,
      },
    };
  } catch (error) {
    logger.error("[hire] searchCandidates failed", { error: String(error) });
    return {
      ok: false,
      message:
        "Could not search the talent pool. If tables are missing, apply the hire migration on a Neon branch first.",
    };
  }
}
