import "server-only";

import { logger } from "@/lib/logger";
import type { JobSpec } from "@/lib/validations/hire";
import { estimateCompensation } from "@/features/hire/compensation";
import { enabledTracks, isKnownTrack } from "@/features/hire/track-registry";
import {
  EMPTY_COVERAGE,
  loadSkillAliases,
  loadTrack,
  mergeTrackLoads,
} from "@/features/hire/track-loaders";
import { applyCoverageGate, searchSpecFromJob } from "@/features/hire/reduce-spec";
import { rankCandidates107 } from "@/features/hire/rank";
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
        stage: "PUBLISHED" | "OPEN_MIDCOHORT" | null;
        matches: ScoredCandidate[];
        /** Level-2 contradictions — a visible excluded section, never a silent drop. */
        nearMisses: ScoredCandidate[];
        totalEligible: number;
        belowEvidenceFloor: number;
        coverage: EvidenceCoverage;
      };
    }
  | { ok: false; message: string };

const CHALLENGE_POOL_CAP = 600;

/**
 * Stages 3→6: retrieve (structural filters only) → normalize → evaluate → rank.
 */
export async function searchCandidates(
  spec: JobSpec,
  opts?: { limit?: number },
): Promise<SearchCandidatesResult> {
  try {
    const searchSpec = searchSpecFromJob(spec);
    const wanted =
      searchSpec.filters.tracks.length > 0
        ? searchSpec.filters.tracks.filter((s) => isKnownTrack(s))
        : enabledTracks().map((t) => t.slug);

    const loads = await Promise.all(
      wanted.map((slug) =>
        loadTrack(slug, {
          minEvidenceDays: searchSpec.filters.minEvidenceDays ?? 0,
          limit: CHALLENGE_POOL_CAP,
        }),
      ),
    );

    const merged = mergeTrackLoads(loads);
    const scoreable: ScoreableMember[] = merged.members;
    const { coverage, belowEvidenceFloor } = merged;

    if (scoreable.length === 0) {
      return {
        ok: true,
        data: {
          cohortName: merged.cohortName,
          stage: merged.stage,
          matches: [],
          nearMisses: [],
          totalEligible: 0,
          belowEvidenceFloor,
          coverage: EMPTY_COVERAGE,
        },
      };
    }

    const table = await loadSkillAliases();
    const gated = applyCoverageGate(searchSpec, scoreable);
    const demotionNote = [
      ...new Set(gated.demoted.map((d) => d.reason)),
    ].join(" ");
    const ranked = rankCandidates107(scoreable, gated.spec, {
      table,
      limit: searchSpec.filters.resultLimit ?? opts?.limit ?? 25,
    });

    for (const r of [...ranked.primary, ...ranked.excluded]) {
      const d = r.dossier;
      if (!d) continue;
      d.compensation.estimate = estimateCompensation({
        roleFamily: d.roleFamily.value,
        yearsExperience: d.yearsExperience.value,
        evidenceTier: r.tier,
        missionsPassed: d.evidence.missionsPassed.value,
      });
    }

    return {
      ok: true,
      data: {
        cohortName: merged.cohortName,
        stage: merged.stage,
        matches: ranked.primary,
        nearMisses: ranked.excluded,
        totalEligible: scoreable.length,
        belowEvidenceFloor,
        coverage: {
          ...coverage,
          note: [coverage.note, demotionNote].filter(Boolean).join(" "),
        },
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
