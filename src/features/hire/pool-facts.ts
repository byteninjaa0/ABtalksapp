import "server-only";

import { logger } from "@/lib/logger";
import type { JobSpec } from "@/lib/validations/hire";
import { searchCandidates } from "@/features/hire/search-candidates";
import { buildDossierSet } from "@/features/hire/dossier";
import {
  clearsEvidenceFloor,
  memberEligibilityWhere,
  resolvePoolCohorts,
} from "@/features/hire/pool-policy";
import { ROLE_FAMILY_LABEL, type RoleFamily } from "@/features/hire/role-family";

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
  /** Consenting members who clear the evidence floor — the searchable pool. */
  eligibleCount: number;
  /** Consenting members held back by the floor. */
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
    const gate = await resolvePoolCohorts();
    if (!gate.ok) {
      snapshotCache = { at: Date.now(), value: EMPTY_SNAPSHOT };
      return EMPTY_SNAPSHOT;
    }

    const cohortIds = gate.cohorts.map((c) => c.id);
    const set = await buildDossierSet(memberEligibilityWhere(cohortIds));
    const eligible = set.dossiers.filter((d) =>
      clearsEvidenceFloor(d.evidence.missionsPassed.value),
    );

    const skillCounts = new Map<string, number>();
    const languageCounts = new Map<string, number>();
    const familyCounts = new Map<RoleFamily, number>();
    const bandCounts = new Map<string, number>();

    for (const d of eligible) {
      for (const raw of d.declaredSkills.value) {
        const skill = raw.trim().toLowerCase();
        if (skill) skillCounts.set(skill, (skillCounts.get(skill) ?? 0) + 1);
      }
      for (const lang of d.evidence.workingLanguages.value) {
        languageCounts.set(lang, (languageCounts.get(lang) ?? 0) + 1);
      }
      const family = d.roleFamily.value;
      familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
      const years = d.yearsExperience.value;
      const band = years <= 1 ? "0–1 yrs" : years <= 3 ? "2–3 yrs" : years <= 6 ? "4–6 yrs" : "7+ yrs";
      bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    }

    const byCountDesc = <T>(m: Map<T, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);

    const value: PoolSnapshot = {
      hasPool: eligible.length > 0,
      stage: gate.cohorts[0]?.stage ?? null,
      cohortNames: [...new Set(gate.cohorts.map((c) => c.name))],
      cohortDay: eligible[0]
        ? (set.cohortDayByMember.get(eligible[0].programMemberId ?? "") ?? null)
        : null,
      ofDays: eligible[0]?.evidence.cohortProgress.value.ofDays ?? 31,
      eligibleCount: eligible.length,
      belowFloorCount: set.dossiers.length - eligible.length,
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
      coverageNote: eligible.length > 0
        ? set.coverage.note
        : "No candidate has cleared the evidence bar yet.",
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

/**
 * The opening line — only when there is something true and useful to say.
 *
 * Returns null on a thin or unreadable pool, and the chat falls back to simply
 * asking for the role. Two reasons it must not announce an empty pool:
 *
 * 1. It is bad business copy. Opening with "no one has cleared the bar" ends
 *    the conversation before the requirement is captured, and capturing the
 *    requirement is the part that has value on day one.
 * 2. It is not even reliably true. `poolSnapshot` returns the empty snapshot on
 *    a query failure, so a missing table would have had Scout telling every
 *    recruiter the platform has no talent.
 *
 * Honesty about a thin pool belongs after the search, where the gap report can
 * give the actual numbers and the reason — see `buildOverallGap`.
 */
export function describePool(snap: PoolSnapshot): string | null {
  if (!snap.hasPool || snap.eligibleCount === 0) return null;

  const skills = snap.topSkills
    .slice(0, 3)
    .map((s) => s.skill)
    .join(", ");
  const where =
    snap.stage === "OPEN_MIDCOHORT" && snap.cohortDay
      ? ` (cohort day ${snap.cohortDay} of ${snap.ofDays}, so I rank on evidence so far)`
      : "";

  return `I'm Scout. Right now I can search ${snap.eligibleCount} ${
    snap.eligibleCount === 1 ? "person" : "people"
  } who opted in and have verified work${where}${
    skills ? `, strongest in ${skills}` : ""
  }. Tell me the role you're filling — I match on what people did here, not on résumés.`;
}
