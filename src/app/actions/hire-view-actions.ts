"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { decodeCandidateRef } from "@/features/hire/candidate-ref";
import { resolveInspectorCandidate } from "@/features/hire/pool-policy";
import {
  hireViewSalt,
  istDayKey,
  recordDetailView,
  viewerKeyFor,
} from "@/features/profile/profile-events";
import { getVerifiedAccomplishments } from "@/features/profile/get-verified-accomplishments";
import { getVerifiedSkills, type VerifiedSkill } from "@/features/profile/get-verified-skills";
import {
  listPublicWorkHistory,
  listSelfReportedExternalLinks,
  type PublicWorkHistory,
  type SelfReportedExternalLink,
} from "@/repositories/candidate-detail";
import { resolveProgramRefs } from "@/repositories/hire";
import { logger } from "@/lib/logger";
import {
  deriveSkillStage,
  strengthBand,
  type SkillStage,
} from "@/features/profile/skill-stage";

const candidateRefSchema = z.string().trim().min(1).max(200);

/**
 * Fire-and-forget: a recruiter or guest opened a candidate's details on /hire.
 *
 * Works with no session. Always returns `{ ok: true }` — recording failures
 * must never surface in the UI.
 */
export async function recordCandidateViewAction(
  candidateRef: unknown,
): Promise<{ ok: true }> {
  try {
    const parsed = candidateRefSchema.safeParse(candidateRef);
    if (!parsed.success) return { ok: true };

    const raw = parsed.data;
    // SAMPLE: / virtual cards are not real candidates (decode rejects them).
    if (raw.startsWith("SAMPLE:")) return { ok: true };

    const ref = decodeCandidateRef(raw);
    if (!ref) return { ok: true };

    let candidateUserId: string;
    if (ref.source === "PROGRAM") {
      // PROGRAM refs carry ProgramMember.id, not User.id.
      const rows = await resolveProgramRefs([ref.id]);
      if (rows.length === 0) return { ok: true };
      candidateUserId = rows[0]!.userId;
    } else {
      candidateUserId = ref.id;
    }

    const session = await auth();
    const viewerUserId = session?.user?.id ?? null;

    // Self-views are not interest.
    if (viewerUserId && viewerUserId === candidateUserId) {
      return { ok: true };
    }

    const dayKey = istDayKey();
    let viewerKey: string;
    if (viewerUserId) {
      viewerKey = viewerKeyFor({ kind: "user", userId: viewerUserId });
    } else {
      const headersList = await headers();
      const ip =
        headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headersList.get("x-real-ip") ||
        "unknown";
      const userAgent = headersList.get("user-agent") ?? "";
      viewerKey = viewerKeyFor({
        kind: "guest",
        ip,
        userAgent,
        dayKey,
        salt: hireViewSalt(),
      });
    }

    await recordDetailView({ candidateUserId, viewerKey, dayKey });
  } catch (error) {
    logger.error("[hire] recordCandidateViewAction", { error: String(error) });
  }
  return { ok: true };
}

const workHistoryInputSchema = z.object({
  candidateRef: candidateRefSchema,
});

export type InspectorWorkHistory = PublicWorkHistory;

const EMPTY_WORK_HISTORY: InspectorWorkHistory = {
  hasNoWorkExperience: false,
  rows: [],
};

/**
 * Jobs the candidate typed or resume-merge wrote, for the Scout inspector.
 *
 * Work history is not protected contact, so this does not wait on an unlock.
 * It still re-tests the handle via {@link resolveInspectorCandidate} — a
 * guessed ref for someone who withdrew must not return their employers. Sample
 * and ineligible refs resolve to empty rather than an error, so the UI cannot
 * tell those cases apart.
 */
export async function loadInspectorWorkHistoryAction(
  input: unknown,
): Promise<
  { ok: true; data: InspectorWorkHistory } | { ok: false; message: string }
> {
  const parsed = workHistoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid candidate." };
  }

  const raw = parsed.data.candidateRef;
  if (raw.startsWith("SAMPLE:")) {
    return { ok: true, data: EMPTY_WORK_HISTORY };
  }
  if (!decodeCandidateRef(raw)) {
    return { ok: true, data: EMPTY_WORK_HISTORY };
  }

  try {
    const eligible = await resolveInspectorCandidate(raw);
    if (!eligible) {
      return { ok: true, data: EMPTY_WORK_HISTORY };
    }
    const data = await listPublicWorkHistory(eligible.userId);
    return { ok: true, data };
  } catch (error) {
    logger.error("[hire] loadInspectorWorkHistoryAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not load experience." };
  }
}

const externalLinksInputSchema = z.object({
  candidateRef: candidateRefSchema,
});

export type InspectorExternalLinks = {
  links: SelfReportedExternalLink[];
};

/**
 * Declared GitHub / LeetCode / CodeChef profile URLs for View Detail (T-216).
 *
 * Same addressability as work history ({@link resolveInspectorCandidate}).
 * Protected contact stays off this payload. UI must label every link
 * SELF-REPORTED — these are not verified.
 */
export async function loadInspectorExternalLinksAction(
  input: unknown,
): Promise<
  { ok: true; data: InspectorExternalLinks } | { ok: false; message: string }
> {
  const parsed = externalLinksInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid candidate." };
  }

  const raw = parsed.data.candidateRef;
  if (raw.startsWith("SAMPLE:")) {
    return { ok: true, data: { links: [] } };
  }
  if (!decodeCandidateRef(raw)) {
    return { ok: true, data: { links: [] } };
  }

  try {
    const eligible = await resolveInspectorCandidate(raw);
    if (!eligible) {
      return { ok: true, data: { links: [] } };
    }
    const links = await listSelfReportedExternalLinks(eligible.userId);
    return { ok: true, data: { links } };
  } catch (error) {
    logger.error("[hire] loadInspectorExternalLinksAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not load profile links." };
  }
}

const trackEvidenceInputSchema = z.object({
  candidateRef: candidateRefSchema,
});

export type InspectorTrackEvidenceItem = {
  key: string;
  title: string;
  detail: string | null;
  outcomeLabel: string;
  occurredAt: string | null;
};

export type InspectorTrackEvidence = {
  items: InspectorTrackEvidenceItem[];
};

const EMPTY_TRACK_EVIDENCE: InspectorTrackEvidence = { items: [] };

/**
 * Completed tracks and hackathon placements for the Scout inspector.
 *
 * Completions are not protected contact, so this does not wait on an unlock.
 * It still re-tests the handle via {@link resolveInspectorCandidate} — a
 * guessed ref for someone who withdrew must not return their wins. Sample and
 * ineligible refs resolve to empty rather than an error, so the UI cannot tell
 * those cases apart.
 */
export async function loadInspectorTrackEvidenceAction(
  input: unknown,
): Promise<
  { ok: true; data: InspectorTrackEvidence } | { ok: false; message: string }
> {
  const parsed = trackEvidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid candidate." };
  }

  const raw = parsed.data.candidateRef;
  if (raw.startsWith("SAMPLE:")) {
    return { ok: true, data: EMPTY_TRACK_EVIDENCE };
  }
  if (!decodeCandidateRef(raw)) {
    return { ok: true, data: EMPTY_TRACK_EVIDENCE };
  }

  try {
    const eligible = await resolveInspectorCandidate(raw);
    if (!eligible) {
      return { ok: true, data: EMPTY_TRACK_EVIDENCE };
    }
    const rows = await getVerifiedAccomplishments(eligible.userId, "wins-only");
    return {
      ok: true,
      data: {
        items: rows.map((row) => ({
          key: row.key,
          title: row.title,
          detail: row.detail,
          outcomeLabel: row.outcomeLabel,
          occurredAt: row.occurredAt ? row.occurredAt.toISOString() : null,
        })),
      },
    };
  } catch (error) {
    logger.error("[hire] loadInspectorTrackEvidenceAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not load evidence." };
  }
}

export type InspectorSkillEvidenceItem = {
  name: string;
  isEvidenceBacked: boolean;
  sources: string[];
  /**
   * Plan 151 §8/§19 — what the evidence supports, as a stage and a band. The
   * recruiter never sees XP, levels, streaks or badges: those measure
   * engagement, not proof.
   */
  stage: SkillStage | null;
  band: "Emerging" | "Established" | "Strong" | null;
};

export type InspectorSkillEvidence = {
  skills: InspectorSkillEvidenceItem[];
};

const EMPTY_SKILL_EVIDENCE: InspectorSkillEvidence = { skills: [] };

/**
 * T-241: Load skill provenance for a candidate in the Scout inspector.
 * Distinguishes self-declared skills from platform evidence-backed skills
 * (completed challenges/cohorts/assessments) and names their sources.
 */
export async function loadInspectorSkillEvidenceAction(
  input: unknown,
): Promise<
  { ok: true; data: InspectorSkillEvidence } | { ok: false; message: string }
> {
  const parsed = trackEvidenceInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid candidate." };
  }

  const raw = parsed.data.candidateRef;
  if (raw.startsWith("SAMPLE:")) {
    return { ok: true, data: EMPTY_SKILL_EVIDENCE };
  }
  if (!decodeCandidateRef(raw)) {
    return { ok: true, data: EMPTY_SKILL_EVIDENCE };
  }

  try {
    let userId: string | null = null;
    const eligible = await resolveInspectorCandidate(raw);
    if (eligible) {
      userId = eligible.userId;
    } else {
      const decoded = decodeCandidateRef(raw);
      if (decoded?.id) {
        // Many refs store user.id directly as id
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: { id: true },
        });
        if (user) userId = user.id;
      }
    }

    if (!userId) {
      return { ok: true, data: EMPTY_SKILL_EVIDENCE };
    }

    // Get verified skills with their source programs and candidate skill evidence
    const [verified, profileEvidence] = await Promise.all([
      getVerifiedSkills(userId),
      prisma.candidateSkill.findMany({
        where: { userId, evidence: { some: {} } },
        select: {
          skill: { select: { name: true } },
          evidenceScore: true,
          evidence: {
            select: {
              sourceLabel: true,
              sourceType: true,
              score: true,
              maxScore: true,
              weight: true,
              occurredAt: true,
            },
          },
        },
      }),
    ]);

    const verifiedMap = new Map<string, Set<string>>();
    for (const v of verified) {
      const key = v.name.trim().toLowerCase();
      if (!verifiedMap.has(key)) verifiedMap.set(key, new Set());
      for (const s of v.sources) verifiedMap.get(key)!.add(s);
    }

    // Stage and band come from the evidence rows themselves, so a skill that
    // was only ever claimed cannot present as proven.
    const stageMap = new Map<
      string,
      { stage: SkillStage; band: "Emerging" | "Established" | "Strong" }
    >();
    for (const row of profileEvidence) {
      const key = row.skill.name.trim().toLowerCase();
      stageMap.set(key, {
        stage: deriveSkillStage(
          row.evidence.map((e) => ({
            sourceType: e.sourceType,
            score: e.score,
            maxScore: e.maxScore,
            weight: e.weight,
            occurredAt: e.occurredAt,
          })),
        ),
        band: strengthBand(row.evidenceScore),
      });
      if (!verifiedMap.has(key)) verifiedMap.set(key, new Set());
      for (const ev of row.evidence) {
        if (ev.sourceLabel) {
          verifiedMap.get(key)!.add(ev.sourceLabel);
        } else if (ev.sourceType) {
          verifiedMap.get(key)!.add(ev.sourceType.replace(/_/g, " "));
        }
      }
    }

    const skillsResult: InspectorSkillEvidenceItem[] = [];
    for (const [nameKey, sourcesSet] of verifiedMap.entries()) {
      const derived = stageMap.get(nameKey) ?? null;
      skillsResult.push({
        name: nameKey,
        isEvidenceBacked: true,
        sources: Array.from(sourcesSet),
        stage: derived?.stage ?? null,
        band: derived?.band ?? null,
      });
    }

    return {
      ok: true,
      data: {
        skills: skillsResult,
      },
    };
  } catch (error) {
    logger.error("[hire] loadInspectorSkillEvidenceAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not load skill evidence." };
  }
}
