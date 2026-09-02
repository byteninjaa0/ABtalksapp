import "server-only";

import { logger } from "@/lib/logger";
import type { JobSpec } from "@/lib/validations/hire";
import { searchCandidates } from "@/features/hire/search-candidates";
import { loadTrack, mergeTrackLoads } from "@/features/hire/track-loaders";
import { enabledTracks } from "@/features/hire/track-registry";
import {
  ROLE_FAMILY_LABEL,
  roleFamilyFor,
  type RoleFamily,
} from "@/features/hire/role-family";

/**
 * Rows pulled per track before counting. Matches the search's own ceiling, so
 * the two cannot disagree about how big the pool is.
 */
const POOL_SCAN_CAP = 600;

/**
 * What Scout is allowed to know about the pool.
 *
 * Every figure here comes from the same code paths the real search uses, so a
 * number the agent quotes mid-conversation cannot disagree with the shortlist
 * it produces two questions later. That is the whole design constraint: the
 * model reads facts, it does not compute them, and it certainly does not
 * query.
 */
export type PoolSnapshot = {
  hasPool: boolean;
  stage: "PUBLISHED" | "OPEN_MIDCOHORT" | null;
  cohortNames: string[];
  cohortDay: number | null;
  ofDays: number;
  /** Discoverable members who clear the evidence floor — the searchable pool. */
  eligibleCount: number;
  /** Discoverable members held back by the floor. */
  belowFloorCount: number;
  topSkills: { skill: string; count: number }[];
  workingLanguages: { language: string; count: number }[];
  roleFamilies: { family: string; count: number }[];
  experienceMix: { band: string; count: number }[];
  coverageNote: string;
};

const EMPTY_SNAPSHOT: PoolSnapshot = {
  hasPool: false,
  stage: null,
  cohortNames: [],
  cohortDay: null,
  ofDays: 31,
  eligibleCount: 0,
  belowFloorCount: 0,
  topSkills: [],
  workingLanguages: [],
  roleFamilies: [],
  experienceMix: [],
  coverageNote: "No cohort is open to hiring yet.",
};

/**
 * Runs on every Scout turn, so it is memoised briefly rather than re-queried
 * per message. A minute is short enough that a member opting in is reflected
 * almost immediately and long enough that a conversation costs one read.
 */
let snapshotCache: { at: number; value: PoolSnapshot } | null = null;
const SNAPSHOT_TTL_MS = 60_000;

export async function poolSnapshot(): Promise<PoolSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.value;
  }

  try {
    // ── The same loaders the search uses, not a second opinion. ─────────────
    //
    // This function used to query the AI Cohort and the challenge tracks by
    // hand, from before `loadTrack` existed. `searchCandidates` meanwhile walks
    // `enabledTracks()`, so the hackathon pool was searchable and invisible
    // here — and a recruiter asking "how many candidates do you have?" was told
    // "there are no candidates available, no cohort is open to hiring yet"
    // seconds before a search returned nineteen of them. The doc comment above
    // has always promised these figures come from the search's own code paths;
    // now they do, and a new track in the registry is counted the day it is
    // added rather than the day someone remembers this file.
    const loads = await Promise.all(
      enabledTracks().map((t) =>
        loadTrack(t.slug, { minEvidenceDays: 0, limit: POOL_SCAN_CAP }),
      ),
    );
    const merged = mergeTrackLoads(loads);
    const members = merged.members;

    if (members.length === 0) {
      const value = { ...EMPTY_SNAPSHOT, belowFloorCount: merged.belowEvidenceFloor };
      snapshotCache = { at: Date.now(), value };
      return value;
    }

    const skillCounts = new Map<string, number>();
    const languageCounts = new Map<string, number>();
    const familyCounts = new Map<RoleFamily, number>();
    const bandCounts = new Map<string, number>();

    for (const m of members) {
      for (const raw of m.skills) {
        const skill = raw.trim().toLowerCase();
        if (skill) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
      }
      for (const lang of m.dossier?.evidence.workingLanguages.value ?? []) {
        languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
      }
      // The dossier's own bucket where there is one — it already folds in the
      // track and the skills for the ~80% of profiles carrying no job title.
      const family = m.dossier?.roleFamily.value ?? roleFamilyFor(m.jobRole);
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      // An unstated figure is not "0–1 yrs". Counting it as one told a
      // recruiter the pool was junior when the truth is that nobody said.
      const stated = m.yearsExperienceKnown !== false;
      const years = m.yearsExperience;
      const band = !stated
        ? "not stated"
        : years <= 1
          ? "0–1 yrs"
          : years <= 3
            ? "2–3 yrs"
            : years <= 6
              ? "4–6 yrs"
              : "7+ yrs";
      bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    }

    const byCountDesc = <T>(m: Map<T, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);

    const cohortNames = [
      ...new Set(
        loads
          .map((l) => l.cohortName)
          .filter((n): n is string => Boolean(n && n.trim())),
      ),
    ];
    const withDay = members.find((m) => m.cohortDay > 0);

    const value: PoolSnapshot = {
      hasPool: true,
      stage: merged.stage,
      cohortNames,
      cohortDay: withDay?.cohortDay ?? null,
      ofDays:
        withDay?.dossier?.evidence.cohortProgress.value.ofDays ?? 31,
      eligibleCount: members.length,
      belowFloorCount: merged.belowEvidenceFloor,
      topSkills: byCountDesc(skillCounts)
        .slice(0, 12)
        .map(([skill, count]) => ({ skill, count })),
      workingLanguages: byCountDesc(languageCounts).map(([language, count]) => ({
        language,
        count,
      })),
      roleFamilies: byCountDesc(familyCounts).map(([family, count]) => ({
        family: ROLE_FAMILY_LABEL[family],
        count,
      })),
      experienceMix: byCountDesc(bandCounts).map(([band, count]) => ({
        band,
        count,
      })),
      coverageNote: merged.coverage.note,
    };

    snapshotCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    logger.error("[hire] poolSnapshot failed", { error: String(error) });
    return EMPTY_SNAPSHOT;
  }
}

export type MatchPreview = {
  strong: number;
  partial: number;
  none: number;
  /** Must-haves nobody in the pool has — the honest reason a count collapsed. */
  topMissingMustHave: string[];
};

/**
 * How many people the requirement-so-far still matches.
 *
 * Deliberately the same `searchCandidates` the final shortlist uses rather
 * than a cheaper approximation: a preview that disagrees with the result is
 * worse than no preview at all.
 */
export async function previewMatch(spec: JobSpec): Promise<MatchPreview | null> {
  try {
    const res = await searchCandidates(spec, { limit: 100 });
    if (!res.ok) return null;

    const missing = new Map<string, number>();
    for (const m of [...res.data.matches, ...res.data.nearMisses]) {
      for (const g of m.gaps) {
        const hit = /^Missing stack: (.+)$/.exec(g);
        if (hit?.[1]) missing.set(hit[1], (missing.get(hit[1]) ?? 0) + 1);
      }
    }

    return {
      strong: res.data.matches.filter((m) => m.tier === "STRONG").length,
      partial: res.data.matches.filter((m) => m.tier === "PARTIAL").length,
      none: res.data.nearMisses.length,
      topMissingMustHave: [...missing.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([skill]) => skill),
    };
  } catch (error) {
    logger.error("[hire] previewMatch failed", { error: String(error) });
    return null;
  }
}

/* `challengeReach()` and its `ChallengeReach` type were removed here.
 *
 * It counted challenge enrollees "sitting behind the consent wall" so the owner
 * could see what a consent drive would unlock. Two reasons it went:
 *
 *  - It had no callers. Nothing rendered it.
 *  - Its premise is gone. Recruiter discoverability is a platform default now,
 *    enforced by `CandidateVisibility` at the User level, so "people who have not
 *    consented" is no longer the shape of the gap. `scripts/verify-hire-pool.ts`
 *    reports the real numbers — searchable and openToWork, side by side.
 *
 * It was also the last ungated read of a candidate table in this feature.
 */
