/**
 * Plan 151 §31.4 — derive missing events from source tables.
 * One deriver per source. INSERT … ON CONFLICT DO NOTHING.
 * Window is createdAt/updatedAt ≥ now() - 48h for the daily sweep;
 * backfill passes window = all.
 */
import "server-only";

import { EnrollmentStatusV2 } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildIdempotencyKey,
  EVENT_SOURCE_TYPES,
} from "@/features/gamification/event-types";
import { prismaGamificationStore } from "@/repositories/gamification";
import type { Prisma } from "@prisma/client";

export type DeriveWindow = { since: Date | null; isBackfill: boolean };

const BATCH = 500;

async function insertMany(
  rows: Array<{
    userId: string;
    type: Parameters<typeof buildIdempotencyKey>[0];
    sourceType: string;
    sourceId: string;
    scopeKey: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    isBackfill: boolean;
  }>,
): Promise<number> {
  const store = prismaGamificationStore();
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await Promise.all(
      chunk.map(async (row) => {
        const inserted = await store.insertEventIfAbsent({
          userId: row.userId,
          type: row.type,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          idempotencyKey: buildIdempotencyKey(row.type, row.scopeKey),
          occurredAt: row.occurredAt,
          payload: row.payload as Prisma.InputJsonValue,
          isBackfill: row.isBackfill,
        });
        if (inserted) n += 1;
      }),
    );
  }
  return n;
}

function payloadHasGithub(payload: Prisma.JsonValue | null): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const github = (payload as Record<string, unknown>).githubUrl;
  return typeof github === "string" && github.length > 0;
}

function missionTypeFromTags(tags: string[]): string | null {
  const known = [
    "CODE_SPRINT",
    "DATA_ROOM",
    "PROMPT_FORGE",
    "SHIP_IT",
    "BOSS_BUILD",
    "CHALLENGE_DAY",
  ];
  return tags.find((t) => known.includes(t.toUpperCase())) ?? null;
}

export async function deriveActivityPassed(window: DeriveWindow): Promise<number> {
  const since = window.since;
  const evals = await prisma.activityEvaluation.findMany({
    where: {
      isAuthoritative: true,
      passed: true,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      attempt: {
        select: {
          activityId: true,
          enrollmentId: true,
          lateness: true,
          payload: true,
          submittedAt: true,
          enrollment: { select: { userId: true } },
          activity: {
            select: {
              type: true,
              estimatedMinutes: true,
              difficulty: true,
              tags: true,
            },
          },
        },
      },
    },
    take: 20_000,
  });

  return insertMany(
    evals.map((ev) => ({
      userId: ev.attempt.enrollment.userId,
      type: "activity.passed" as const,
      sourceType: EVENT_SOURCE_TYPES["activity.passed"],
      sourceId: ev.id,
      scopeKey: `${ev.attempt.enrollment.userId}:${ev.attempt.activityId}`,
      occurredAt: ev.attempt.submittedAt ?? ev.createdAt,
      payload: {
        activityId: ev.attempt.activityId,
        enrollmentId: ev.attempt.enrollmentId,
        activityType: ev.attempt.activity.type,
        estimatedMinutes: ev.attempt.activity.estimatedMinutes,
        difficulty: ev.attempt.activity.difficulty,
        lateness: ev.attempt.lateness,
        hasGithubProof: payloadHasGithub(ev.attempt.payload),
        missionType: missionTypeFromTags(ev.attempt.activity.tags),
      },
      isBackfill: window.isBackfill,
    })),
  );
}

export async function deriveEnrollmentEvents(
  window: DeriveWindow,
): Promise<number> {
  const since = window.since;
  const rows = await prisma.programEnrollment.findMany({
    where: since
      ? { OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] }
      : {},
    select: {
      id: true,
      userId: true,
      cohortId: true,
      status: true,
      enrolledAt: true,
      completedAt: true,
      createdAt: true,
      cohort: { select: { programVersion: { select: { programId: true } } } },
    },
    take: 20_000,
  });

  const started = rows.map((r) => ({
    userId: r.userId,
    type: "enrollment.started" as const,
    sourceType: EVENT_SOURCE_TYPES["enrollment.started"],
    sourceId: r.id,
    scopeKey: `${r.id}:started`,
    occurredAt: r.enrolledAt ?? r.createdAt,
    payload: {
      enrollmentId: r.id,
      cohortId: r.cohortId,
      programId: r.cohort.programVersion.programId,
    },
    isBackfill: window.isBackfill,
  }));

  const completed = rows
    .filter((r) => r.status === EnrollmentStatusV2.COMPLETED)
    .map((r) => ({
      userId: r.userId,
      type: "enrollment.completed" as const,
      sourceType: EVENT_SOURCE_TYPES["enrollment.completed"],
      sourceId: r.id,
      scopeKey: r.id,
      occurredAt: r.completedAt ?? r.createdAt,
      payload: {
        enrollmentId: r.id,
        cohortId: r.cohortId,
        programId: r.cohort.programVersion.programId,
      },
      isBackfill: window.isBackfill,
    }));

  return (await insertMany(started)) + (await insertMany(completed));
}

export async function deriveCredentials(window: DeriveWindow): Promise<number> {
  const since = window.since;
  const rows = await prisma.credential.findMany({
    where: {
      status: "ISSUED",
      ...(since ? { issuedAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      userId: true,
      type: true,
      sourceType: true,
      issuedAt: true,
      metadata: true,
    },
    take: 20_000,
  });

  return insertMany(
    rows.map((c) => {
      const meta =
        c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
          ? (c.metadata as Record<string, unknown>)
          : {};
      const variant =
        typeof meta.hackathonVariant === "string" ? meta.hackathonVariant : null;
      if (variant) {
        return {
          userId: c.userId,
          type: "hackathon.placed" as const,
          sourceType: EVENT_SOURCE_TYPES["hackathon.placed"],
          sourceId: c.id,
          scopeKey: `${c.id}`,
          occurredAt: c.issuedAt,
          payload: {
            eventId: "vicodathon-2026",
            variant,
          },
          isBackfill: window.isBackfill,
        };
      }
      return {
        userId: c.userId,
        type: "credential.issued" as const,
        sourceType: EVENT_SOURCE_TYPES["credential.issued"],
        sourceId: c.id,
        scopeKey: c.id,
        occurredAt: c.issuedAt,
        payload: {
          credentialId: c.id,
          credentialType: c.type,
          sourceType: c.sourceType,
          hackathonVariant: variant,
        },
        isBackfill: window.isBackfill,
      };
    }),
  );
}

export async function deriveHackathonRegistered(
  window: DeriveWindow,
): Promise<number> {
  const since = window.since;
  const rows = await prisma.hackathonParticipant.findMany({
    where: since ? { createdAt: { gte: since } } : {},
    select: { id: true, userId: true, teamId: true, createdAt: true },
    take: 20_000,
  });
  return insertMany(
    rows.map((p) => ({
      userId: p.userId,
      type: "hackathon.registered" as const,
      sourceType: EVENT_SOURCE_TYPES["hackathon.registered"],
      sourceId: p.id,
      scopeKey: p.id,
      occurredAt: p.createdAt,
      payload: { eventId: "vicodathon-2026", teamId: p.teamId },
      isBackfill: window.isBackfill,
    })),
  );
}

function normalizeRepo(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, "").replace(/\.git$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export async function deriveHackathonSubmitted(
  window: DeriveWindow,
): Promise<number> {
  const since = window.since;
  const submissions = await prisma.hackathonSubmission.findMany({
    where: since ? { updatedAt: { gte: since } } : {},
    select: {
      id: true,
      teamId: true,
      repoUrl: true,
      liveUrl: true,
      updatedAt: true,
      createdAt: true,
      team: {
        select: {
          participants: { select: { userId: true, createdAt: true } },
        },
      },
    },
    take: 10_000,
  });

  const counts = new Map<string, number>();
  for (const s of submissions) {
    const key = normalizeRepo(s.repoUrl);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const rows: Parameters<typeof insertMany>[0] = [];
  for (const s of submissions) {
    const repoPublic = s.repoUrl.trim().length > 0;
    const liveOk = s.liveUrl.trim().length > 0;
    const duplicateRepo = (counts.get(normalizeRepo(s.repoUrl)) ?? 0) > 1;
    for (const m of s.team.participants) {
      rows.push({
        userId: m.userId,
        type: "hackathon.submitted",
        sourceType: EVENT_SOURCE_TYPES["hackathon.submitted"],
        sourceId: s.id,
        scopeKey: `vicodathon-2026:${s.teamId}:${m.userId}`,
        occurredAt: s.updatedAt,
        payload: {
          eventId: "vicodathon-2026",
          teamId: s.teamId,
          repoPublic,
          liveOk,
          duplicateRepo,
        },
        isBackfill: window.isBackfill,
      });
    }
  }
  return insertMany(rows);
}

export async function deriveReferrals(window: DeriveWindow): Promise<number> {
  const since = window.since;
  const rows = await prisma.referral.findMany({
    where: {
      rewardGiven: true,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      id: true,
      referrerId: true,
      createdAt: true,
    },
    take: 20_000,
  });
  return insertMany(
    rows.map((r) => ({
      userId: r.referrerId,
      type: "referral.qualified" as const,
      sourceType: EVENT_SOURCE_TYPES["referral.qualified"],
      sourceId: r.id,
      scopeKey: r.id,
      occurredAt: r.createdAt,
      payload: { referralId: r.id },
      isBackfill: window.isBackfill,
    })),
  );
}

export async function deriveAll(window: DeriveWindow): Promise<{
  activity: number;
  enrollment: number;
  credential: number;
  hackathonReg: number;
  hackathonSub: number;
  referral: number;
}> {
  const activity = await deriveActivityPassed(window);
  const enrollment = await deriveEnrollmentEvents(window);
  const credential = await deriveCredentials(window);
  const hackathonReg = await deriveHackathonRegistered(window);
  const hackathonSub = await deriveHackathonSubmitted(window);
  const referral = await deriveReferrals(window);
  return {
    activity,
    enrollment,
    credential,
    hackathonReg,
    hackathonSub,
    referral,
  };
}
