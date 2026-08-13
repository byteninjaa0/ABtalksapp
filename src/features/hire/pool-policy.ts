import "server-only";

import { ProgramCohortStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hireOpenCohortIds } from "@/lib/feature-flags";

/**
 * The floor below which someone is not a candidate.
 *
 * Counted in *earned* mission passes — days 1–3 are waived at enrolment and
 * award points to everyone, so a member who has never opened a mission still
 * carries 36 mission points and three "clean passes". Without this floor the
 * first thing a recruiter sees can be a page of people who have done nothing,
 * which is worse for the business than an empty pool.
 */
export const MIN_EARNED_MISSIONS = 3;

export type PoolCohort = {
  id: string;
  name: string;
  startsAt: Date;
  stage: "PUBLISHED" | "OPEN_MIDCOHORT";
};

export type PoolGateResult =
  | { ok: true; cohorts: PoolCohort[] }
  | { ok: false; reason: "NO_COHORT"; message: string };

/**
 * Which cohorts `/hire` may search, and why each one qualifies.
 *
 * This exists because the gate was one line inside `searchCandidates` —
 * `resultsPublishedAt != null` on a single `findFirst` — and it made the whole
 * product unreachable: no cohort on the platform has ever had results
 * published, so the search returned an empty array before it read a single
 * member row.
 *
 * Two deliberate differences from `/talent`:
 *
 * 1. **Every open cohort, not the latest one.** `findFirst` meant a second
 *    running cohort was invisible no matter how good its people were.
 * 2. **A cohort can be opened mid-flight** (see `hireOpenCohortIds`), because
 *    evidence-so-far is real evidence. `/talent` keeps its published-only gate
 *    untouched — see `assertPoolAccess` in features/talent-pool/pool.ts.
 *
 * Consent is *not* configurable here and never will be. It is enforced in
 * `memberEligibilityWhere` on every query, with no override, no admin bypass
 * and no demo exception.
 */
export async function resolvePoolCohorts(): Promise<PoolGateResult> {
  const openIds = hireOpenCohortIds();

  const cohorts = await prisma.programCohort.findMany({
    where: {
      OR: [
        { resultsPublishedAt: { not: null } },
        ...(openIds === "all"
          ? [{ status: { in: [ProgramCohortStatus.ENROLLING, ProgramCohortStatus.ACTIVE] } }]
          : openIds
            ? [{ id: { in: openIds } }]
            : []),
      ],
    },
    orderBy: { startsAt: "desc" },
    select: {
      id: true,
      name: true,
      startsAt: true,
      resultsPublishedAt: true,
    },
  });

  if (cohorts.length === 0) {
    return {
      ok: false,
      reason: "NO_COHORT",
      message: "No cohort is open to hiring yet.",
    };
  }

  return {
    ok: true,
    cohorts: cohorts.map((c) => ({
      id: c.id,
      name: c.name,
      startsAt: c.startsAt,
      stage: c.resultsPublishedAt ? ("PUBLISHED" as const) : ("OPEN_MIDCOHORT" as const),
    })),
  };
}

/**
 * The one where-clause every `/hire` surface must use to load candidates.
 *
 * Reused by search and by the engagement-request actions so a recruiter can
 * never raise a request against somebody Scout would not have shown them.
 */
export function memberEligibilityWhere(
  cohortIds: string[],
): Prisma.ProgramMemberWhereInput {
  return {
    cohortId: { in: cohortIds },
    status: { in: ["ENROLLED", "COMPLETED"] },
    // Non-negotiable. The member ticked a box saying recruiters may see their
    // work; nothing else in this file may weaken it.
    recruiterVisibilityConsentAt: { not: null },
  };
}

/** Does this candidate clear the evidence floor? Takes earned passes, never
 *  `missionPoints`. */
export function clearsEvidenceFloor(missionsPassed: number): boolean {
  return missionsPassed >= MIN_EARNED_MISSIONS;
}
