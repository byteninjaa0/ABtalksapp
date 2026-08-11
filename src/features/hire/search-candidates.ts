import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { JobSpec } from "@/lib/validations/hire";
import { rankCandidates } from "@/features/hire/score-candidate";
import type { ScoreableMember, ScoredCandidate } from "@/features/hire/types";

export type SearchCandidatesResult =
  | {
      ok: true;
      data: {
        cohortName: string | null;
        matches: ScoredCandidate[];
        /** Near-miss / hard-filtered, for gap analysis only (not shortlist). */
        nearMisses: ScoredCandidate[];
        totalEligible: number;
      };
    }
  | { ok: false; message: string };

/**
 * Phase B: deterministic Prisma load + pure scoring.
 * Never invents candidates. Empty pool → empty arrays (caller's gap UI).
 */
export async function searchCandidates(
  spec: JobSpec,
  opts?: { limit?: number },
): Promise<SearchCandidatesResult> {
  try {
    const cohort = await prisma.programCohort.findFirst({
      where: { resultsPublishedAt: { not: null } },
      orderBy: { resultsPublishedAt: "desc" },
      select: {
        id: true,
        name: true,
        resultsPublishedAt: true,
      },
    });

    if (!cohort) {
      return {
        ok: true,
        data: {
          cohortName: null,
          matches: [],
          nearMisses: [],
          totalEligible: 0,
        },
      };
    }

    const members = await prisma.programMember.findMany({
      where: {
        cohortId: cohort.id,
        status: { in: ["ENROLLED", "COMPLETED"] },
        recruiterVisibilityConsentAt: { not: null },
      },
      select: {
        id: true,
        userId: true,
        fullName: true,
        jobRole: true,
        company: true,
        yearsExperience: true,
        skills: true,
        missionPoints: true,
        cleanPassCount: true,
        totalScore: true,
        status: true,
        recruiterVisibilityConsentAt: true,
        commitDays: { select: { id: true } },
        projects: {
          select: { aiScore: true, adminScore: true },
        },
        interview: {
          select: {
            overallScore: true,
            commScore: true,
            techScore: true,
            problemScore: true,
          },
        },
        user: {
          select: {
            candidateAvailability: {
              select: {
                openToWork: true,
                expectedSalaryMin: true,
                expectedSalaryMax: true,
                salaryCurrency: true,
                noticePeriodDays: true,
                preferredWorkMode: true,
                preferredCities: true,
                openToRelocate: true,
              },
            },
          },
        },
      },
    });

    const scoreable: ScoreableMember[] = members.map((m) => {
      const projectScores = m.projects
        .map((p) => p.adminScore ?? p.aiScore)
        .filter((n): n is number => typeof n === "number");
      const av = m.user.candidateAvailability;
      return {
        id: m.id,
        userId: m.userId,
        fullName: m.fullName,
        jobRole: m.jobRole,
        company: m.company,
        yearsExperience: m.yearsExperience,
        skills: m.skills,
        missionPoints: m.missionPoints,
        cleanPassCount: m.cleanPassCount,
        totalScore: m.totalScore,
        commitDayCount: m.commitDays.length,
        projectScores,
        interview: m.interview
          ? {
              overall: m.interview.overallScore,
              comm: m.interview.commScore,
              tech: m.interview.techScore,
              problem: m.interview.problemScore,
            }
          : null,
        hasVisibilityConsent: m.recruiterVisibilityConsentAt != null,
        cohortPublished: true,
        status: m.status,
        availability: av
          ? {
              openToWork: av.openToWork,
              expectedSalaryMin: av.expectedSalaryMin,
              expectedSalaryMax: av.expectedSalaryMax,
              salaryCurrency: av.salaryCurrency,
              noticePeriodDays: av.noticePeriodDays,
              preferredWorkMode: av.preferredWorkMode,
              preferredCities: av.preferredCities,
              openToRelocate: av.openToRelocate,
            }
          : null,
      };
    });

    const limit = opts?.limit ?? 25;
    const ranked = rankCandidates(scoreable, spec, {
      includeHardFiltered: true,
      limit: 100,
    });

    const matches = ranked
      .filter((r) => !r.hardFiltered && r.tier !== "NONE")
      .slice(0, limit);

    const nearMisses = ranked
      .filter(
        (r) =>
          r.hardFiltered ||
          r.tier === "NONE" ||
          (r.tier === "PARTIAL" && r.gaps.length > 0),
      )
      .slice(0, 10);

    return {
      ok: true,
      data: {
        cohortName: cohort.name,
        matches,
        nearMisses,
        totalEligible: scoreable.length,
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
