import "server-only";

import { logger } from "@/lib/logger";
import { hireChallengePool } from "@/lib/feature-flags";
import type { JobSpec } from "@/lib/validations/hire";
import { rankCandidates } from "@/features/hire/score-candidate";
import { buildDossierSet, computeCoverage } from "@/features/hire/dossier";
import {
  CHALLENGE_TOTAL_DAYS,
  buildChallengeDossierSet,
} from "@/features/hire/challenge-dossier";
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

/**
 * How many challenge candidates are loaded before ranking.
 *
 * Scoring is a pure function over an in-memory array, so the cost of the pool
 * is the dossier assembly. Six hundred is comfortably above the whole eligible
 * cohort today (320 at a ten-day floor) and low enough that a future track with
 * thousands of enrolments cannot turn one Server Action into a full table scan.
 * Rows are ordered by days submitted before the cap, so the ceiling can only
 * ever trim the least-evidenced people.
 */
const CHALLENGE_POOL_CAP = 600;

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
    const challengeFlag = hireChallengePool();

    // Two independent pools. Either may be empty, and the search is only over
    // when both are — a deployment with no open cohort still has a challenge
    // track worth searching, and the old early return hid it.
    const [set, challenge] = await Promise.all([
      gate.ok
        ? buildDossierSet(memberEligibilityWhere(gate.cohorts.map((c) => c.id)))
        : null,
      challengeFlag.enabled
        ? buildChallengeDossierSet({
            minDays: challengeFlag.minDays,
            limit: CHALLENGE_POOL_CAP,
          })
        : null,
    ]);

    const programDossiers = set?.dossiers ?? [];

    // One person, one card. Somebody who did the challenge and then joined the
    // cohort has evidence in both tables, and the program dossier is the richer
    // of the two — it has the graded project and the interview.
    const programUserIds = new Set(
      programDossiers.map((d) => d.userId).filter((id): id is string => Boolean(id)),
    );
    const challengeDossiers = (challenge?.dossiers ?? []).filter(
      (d) => !d.userId || !programUserIds.has(d.userId),
    );

    // The floor is a preference, not a wall.
    //
    // As a hard exclusion it emptied the board: on a cohort two weeks in, the
    // members who have opted into recruiter visibility are mostly the ones who
    // have not finished three missions yet, so every search returned nothing
    // and the recruiter learned nothing at all. A thin, honestly-labelled list
    // beats a blank one — they can see the shape of the pool and decide.
    // Below-floor candidates rank below the rest and say why on the card.
    //
    // Challenge candidates are not counted here: their floor is applied in the
    // query that loads them, so everyone who arrives has already cleared it.
    const aboveFloor = programDossiers.filter((d) =>
      clearsEvidenceFloor(d.evidence.missionsPassed.value),
    );
    const belowEvidenceFloor = programDossiers.length - aboveFloor.length;

    if (programDossiers.length === 0 && challengeDossiers.length === 0) {
      return {
        ok: true,
        data: {
          cohortName: gate.ok ? (gate.cohorts[0]?.name ?? null) : null,
          stage: gate.ok ? (gate.cohorts[0]?.stage ?? null) : null,
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
    const programCoverage =
      programDossiers.length > 0
        ? computeCoverage(aboveFloor.length > 0 ? aboveFloor : programDossiers)
        : EMPTY_COVERAGE;
    const challengeCoverage = challenge?.coverage ?? EMPTY_COVERAGE;

    const scoreable: ScoreableMember[] = [
      ...programDossiers.map((d): ScoreableMember => {
        const id = d.programMemberId!;
        const identity = set?.identityByMember.get(id);
        const legacy = set?.legacyStatsByMember.get(id);
        return {
          id,
          source: "PROGRAM",
          candidateRef: d.candidateRef,
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
          cohortDay: set?.cohortDayByMember.get(id) ?? 1,
          coverage: programCoverage,
          dossier: d,
        };
      }),
      ...challengeDossiers.map((d): ScoreableMember => ({
        id: d.userId ?? "",
        source: "CLAUDE",
        candidateRef: d.candidateRef,
        userId: d.userId ?? "",
        // No name, no employer. There is none to load and none to leak.
        fullName: "",
        jobRole: d.rawRoleLabel.value,
        company: "",
        yearsExperience: d.yearsExperience.value,
        skills: d.declaredSkills.value,
        missionPoints: 0,
        missionsPassed: d.evidence.missionsPassed.value,
        missionsAttempted: d.evidence.missionsAttempted.value,
        cleanPassCount: d.evidence.cleanPassCount.value,
        totalScore: 0,
        commitDayCount: d.evidence.commitDays.value,
        projectScores: d.evidence.projectScores.value,
        interview: d.evidence.interview.value,
        // Neither gate applies to this track. Consent to be *contacted* is
        // asked at the introduction, and there is no cohort to publish — the
        // work is done and recorded either way.
        hasVisibilityConsent: true,
        cohortPublished: true,
        status: "ENROLLED",
        availability: d.availability,
        cohortDay: challenge?.dayByUser.get(d.userId ?? "") ?? CHALLENGE_TOTAL_DAYS,
        maxEarnableMissions: CHALLENGE_TOTAL_DAYS,
        consistencyWindow: CHALLENGE_TOTAL_DAYS,
        coverage: challengeCoverage,
        dossier: d,
      })),
    ];

    const coverage =
      programDossiers.length > 0 && challengeDossiers.length > 0
        ? {
            dimensions: programCoverage.dimensions,
            note: `${programCoverage.note} Challenge candidates are ranked separately against what their own track records: ${challengeCoverage.note}`,
          }
        : programDossiers.length > 0
          ? programCoverage
          : challengeCoverage;

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
        cohortName: gate.ok
          ? (gate.cohorts[0]?.name ?? null)
          : challengeDossiers.length > 0
            ? "60-Day Challenge"
            : null,
        // A rolling track has no single publish state — people are on day 12
        // and day 60 at the same time — so it reports none rather than
        // borrowing the cohort's.
        stage: gate.ok ? (gate.cohorts[0]?.stage ?? null) : null,
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
