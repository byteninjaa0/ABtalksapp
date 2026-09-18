/**
 * Plan 151 §31.2 — claim → snapshot → evaluate → apply → release.
 * One transaction on writeClient(), no savepoints. UserProgress FOR UPDATE.
 */
import "server-only";

import {
  GamificationEventStatus,
  GamificationFlagSeverity,
  Prisma,
} from "@prisma/client";
import { writeClient } from "@/lib/db";
import { getIstDateKey, getIstWeekKey, IST } from "@/lib/date-utils";
import { formatInTimeZone } from "date-fns-tz";
import { istWeekStartUtc, nextWeekKey } from "./streak-weeks";
import { isSkillStagesEnabled, isGamificationNotificationsEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import {
  findUserStatus,
  prismaGamificationStore,
  type EventRow,
} from "@/repositories/gamification";
import {
  isGamificationEventType,
  type GamificationEventType,
} from "./event-types";
import {
  evaluate,
  type Effect,
  type EvaluateSnapshot,
  type RuleRow,
} from "./rules/evaluate";
import type { LevelGateSnapshot } from "./levels";
import { dispatch } from "@/features/notification/notification-service";

const MAX_ATTEMPTS = 5;

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function istMonthKey(at: Date): string {
  return formatInTimeZone(at, IST, "yyyy-MM");
}

function truncateError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.slice(0, 400);
}

async function loadSnapshot(
  userId: string,
  occurredAt: Date,
): Promise<EvaluateSnapshot | { skip: "missing" | "disabled" | "deleted" }> {
  const db = writeClient();
  const status = await findUserStatus(userId);
  if (!status) return { skip: "missing" };
  if (status.deleted) return { skip: "deleted" };
  if (status.disabled) return { skip: "disabled" };

  const dayKey = getIstDateKey(occurredAt);
  const weekKey = getIstWeekKey(occurredAt);
  const dayStart = new Date(`${dayKey}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = istWeekStartUtc(weekKey);
  const weekEnd = istWeekStartUtc(nextWeekKey(weekKey));

  const [
    xpTotalAgg,
    xpTodayAgg,
    activityXpTodayAgg,
    assessmentWeek,
    mockWeek,
    referralCount,
    profileXp,
    progress,
    rules,
    badges,
    heldBadges,
    quests,
    userQuests,
    events,
    passedCount,
    distinctDays,
    buildCount,
    completions,
    highFlag,
    submittedHackathon,
  ] = await Promise.all([
    db.xpTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
    db.xpTransaction.aggregate({
      where: { userId, createdAt: { gte: dayStart, lt: dayEnd }, isBackfill: false },
      _sum: { amount: true },
    }),
    db.xpTransaction.aggregate({
      where: {
        userId,
        ruleKey: { startsWith: "xp.activity.passed" },
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      _sum: { amount: true },
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "assessment.completed",
        status: GamificationEventStatus.PROCESSED,
        occurredAt: { gte: weekStart, lt: weekEnd },
      },
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "mock_interview.completed",
        status: GamificationEventStatus.PROCESSED,
        occurredAt: { gte: weekStart, lt: weekEnd },
      },
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "referral.qualified",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
    db.xpTransaction.findMany({
      where: { userId, ruleKey: { startsWith: "xp.profile." } },
      select: { amount: true, ruleKey: true },
    }),
    db.userProgress.findUnique({
      where: { userId },
      select: {
        xpTotal: true,
        level: true,
        weekStreak: true,
        longestWeekStreak: true,
        lastActiveWeekKey: true,
        streakFreezes: true,
        heldAt: true,
      },
    }),
    db.gamificationRule.findMany(),
    db.badgeDefinition.findMany({ where: { isActive: true } }),
    db.userBadge.findMany({
      where: { userId },
      select: { badge: { select: { slug: true } }, revokedAt: true },
    }),
    db.questDefinition.findMany({ where: { isActive: true } }),
    db.userQuest.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        id: true,
        questId: true,
        periodKey: true,
        status: true,
        startedAt: true,
        progress: true,
      },
    }),
    db.gamificationEvent.findMany({
      where: { userId, status: GamificationEventStatus.PROCESSED },
      select: { type: true, occurredAt: true, payload: true },
      orderBy: { occurredAt: "asc" },
      take: 2000,
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "activity.passed",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
    db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT to_char(("occurredAt" AT TIME ZONE 'UTC') + interval '5 hours 30 minutes', 'YYYY-MM-DD')) AS n
      FROM "GamificationEvent"
      WHERE "userId" = ${userId}
        AND type = 'activity.passed'
        AND status = 'PROCESSED'::"GamificationEventStatus"
    `,
    db.gamificationEvent.count({
      where: {
        userId,
        status: GamificationEventStatus.PROCESSED,
        OR: [
          { type: "hackathon.submitted" },
          {
            type: "activity.passed",
            payload: { path: ["activityType"], equals: "PROJECT" },
          },
        ],
      },
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "enrollment.completed",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
    db.gamificationFlag.findFirst({
      where: { userId, status: "OPEN", severity: GamificationFlagSeverity.HIGH },
      select: { id: true },
    }),
    db.gamificationEvent.count({
      where: {
        userId,
        type: "hackathon.submitted",
        status: GamificationEventStatus.PROCESSED,
      },
    }),
  ]);

  const profileSectionsAwarded = profileXp.map((r) =>
    r.ruleKey.replace("xp.profile.", ""),
  );
  const profileSectionXpLifetime = profileXp.reduce((s, r) => s + r.amount, 0);

  const distinctVerifiedDays = Number(distinctDays[0]?.n ?? 0);
  const levelGates: LevelGateSnapshot = {
    xpTotal: xpTotalAgg._sum.amount ?? 0,
    passedActivityCount: passedCount,
    distinctVerifiedDays,
    hasVerifiedBuild: buildCount + submittedHackathon > 0,
    programCompletions: completions,
    verifiedSkillCount: 0,
    verifiedSkillsInOneCategory: 0,
    hackathonTop25: false,
    advancedSkillCount: 0,
    hackathonTop10OrFinalist: false,
    activeWeeksLast52: progress?.weekStreak ?? 0,
  };

  const heldBadgeSlugs = new Set(
    heldBadges
      .filter((b) => b.revokedAt == null)
      .map((b) => b.badge.slug),
  );

  const snapshot: EvaluateSnapshot = {
    disabled: false,
    deleted: false,
    heldAt: progress?.heldAt ?? null,
    highFlagOpen: highFlag != null,
    phoneVerified: status.phoneVerified,
    xpTotal: xpTotalAgg._sum.amount ?? 0,
    xpToday: xpTodayAgg._sum.amount ?? 0,
    activityXpToday: activityXpTodayAgg._sum.amount ?? 0,
    assessmentCountThisWeek: assessmentWeek,
    mockCountThisWeek: mockWeek,
    referralLifetimeCount: referralCount,
    profileSectionXpLifetime,
    profileSectionsAwarded,
    enrollmentXpEarned: 0,
    levelGates,
    weekStreak: progress?.weekStreak ?? 0,
    events: events.map((e) => ({
      type: e.type,
      occurredAt: e.occurredAt,
      payload: jsonObject(e.payload),
    })),
    rules: rules as RuleRow[],
    badges: badges.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      criteria: b.criteria,
      criteriaVersion: b.criteriaVersion,
      xpReward: b.xpReward,
      isActive: b.isActive,
    })),
    heldBadgeSlugs,
    quests: quests.map((q) => ({
      id: q.id,
      slug: q.slug,
      name: q.name,
      cadence: q.cadence,
      segment: q.segment,
      tasks: q.tasks,
      xpReward: q.xpReward,
      badgeSlug: q.badgeSlug,
      isActive: q.isActive,
    })),
    userQuests,
    skillStagesEnabled: isSkillStagesEnabled(),
    completeness: 0,
    completedSections: profileSectionsAwarded,
  };
  return snapshot;
}

async function applyEffects(
  event: EventRow,
  effects: Effect[],
): Promise<{ xpAwarded: number; badges: string[]; levelTo: number | null }> {
  const db = writeClient();
  const store = prismaGamificationStore();
  let xpAwarded = 0;
  const badges: string[] = [];
  let levelTo: number | null = null;

  await db.$transaction(
    async (tx) => {
      const progress = await store.lockProgress(tx, event.userId);
      let xpTotal = progress.xpTotal;
      let level = progress.level;

      for (const effect of effects) {
        if (effect.kind === "skip") continue;
        if (effect.kind === "xp") {
          const inserted = await store.insertXp(tx, {
            userId: event.userId,
            amount: effect.amount,
            category: effect.category,
            ruleKey: effect.ruleKey,
            eventId: event.id,
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            idempotencyKey: effect.idempotencyKey,
            isBackfill: event.isBackfill,
          });
          if (inserted) {
            xpTotal += effect.amount;
            xpAwarded += effect.amount;
          }
        } else if (effect.kind === "periodScore") {
          await store.upsertPeriodScore(tx, {
            userId: event.userId,
            periodType: effect.periodType,
            periodKey: effect.periodKey,
            amount: effect.amount,
            at: event.occurredAt,
          });
        } else if (effect.kind === "badgeAward") {
          try {
            await tx.userBadge.create({
              data: {
                userId: event.userId,
                badgeId: effect.badgeId,
                criteriaVersion: effect.criteriaVersion,
                earnedAt: event.occurredAt,
                sourceEventId: event.id,
                evidence: {
                  sourceType: event.sourceType,
                  sourceId: event.sourceId,
                  label: effect.slug,
                  href: null,
                },
                seenAt: event.isBackfill ? event.occurredAt : null,
              },
              select: { id: true },
            });
            badges.push(effect.slug);
            if (effect.xpReward > 0) {
              const inserted = await store.insertXp(tx, {
                userId: event.userId,
                amount: effect.xpReward,
                category: "CAREER",
                ruleKey: `badge.${effect.slug}`,
                eventId: event.id,
                sourceType: "UserBadge",
                sourceId: effect.badgeId,
                idempotencyKey: `badge:${event.userId}:${effect.badgeId}`,
                isBackfill: event.isBackfill,
              });
              if (inserted) {
                xpTotal += effect.xpReward;
                xpAwarded += effect.xpReward;
              }
            }
          } catch (err) {
            if (
              !(
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === "P2002"
              )
            ) {
              throw err;
            }
          }
        } else if (effect.kind === "questAssign") {
          await tx.userQuest.createMany({
            data: [
              {
                userId: event.userId,
                questId: effect.questId,
                periodKey: effect.periodKey,
                progress: [],
              },
            ],
            skipDuplicates: true,
          });
        } else if (effect.kind === "questUpdate") {
          await tx.userQuest.update({
            where: { id: effect.userQuestId },
            data: {
              progress: effect.progress as Prisma.InputJsonValue,
              status: effect.completed ? "COMPLETED" : "ACTIVE",
              completedAt: effect.completed ? event.occurredAt : null,
            },
            select: { id: true },
          });
          if (effect.completed && effect.xpReward > 0) {
            const inserted = await store.insertXp(tx, {
              userId: event.userId,
              amount: effect.xpReward,
              category: "CAREER",
              ruleKey: `quest.${effect.questId}`,
              eventId: event.id,
              sourceType: "UserQuest",
              sourceId: effect.userQuestId,
              idempotencyKey: `quest:${effect.userQuestId}:complete`,
              isBackfill: event.isBackfill,
            });
            if (inserted) {
              xpTotal += effect.xpReward;
              xpAwarded += effect.xpReward;
            }
          }
        } else if (effect.kind === "levelChange") {
          level = effect.to;
          levelTo = effect.to;
        } else if (effect.kind === "flag") {
          await tx.gamificationFlag.create({
            data: {
              userId: event.userId,
              kind: effect.flagKind,
              severity: effect.severity,
              details: effect.details as Prisma.InputJsonValue,
              sourceEventId: event.id,
            },
            select: { id: true },
          });
        }
      }

      await tx.userProgress.update({
        where: { userId: event.userId },
        data: {
          xpTotal,
          level,
          levelReachedAt:
            levelTo != null ? event.occurredAt : progress.levelReachedAt,
          recomputedAt: new Date(),
        },
        select: { userId: true },
      });

      await tx.gamificationEvent.update({
        where: { id: event.id },
        data: {
          status: GamificationEventStatus.PROCESSED,
          processedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
        select: { id: true },
      });
    },
    { maxWait: 10000, timeout: 20000 },
  );

  return { xpAwarded, badges, levelTo };
}

async function notifyDigest(
  userId: string,
  event: EventRow,
  result: { xpAwarded: number; badges: string[]; levelTo: number | null },
): Promise<void> {
  if (!isGamificationNotificationsEnabled()) return;
  if (event.isBackfill) return;
  const istDay = getIstDateKey(event.occurredAt);
  const dedupeKey = `gamification.digest:${userId}:${istDay}`;
  const bits: string[] = [];
  if (result.xpAwarded > 0) bits.push(`+${result.xpAwarded} XP`);
  if (result.badges.length > 0) bits.push(`badge: ${result.badges.join(", ")}`);
  if (result.levelTo != null) bits.push(`reached level ${result.levelTo}`);
  if (bits.length === 0) return;

  const isPlacement =
    event.type === "hackathon.placed" ||
    (event.type === "credential.issued" &&
      jsonObject(event.payload).hackathonVariant != null);
  const eventType = isPlacement
    ? "hackathon.result_published"
    : "gamification.digest";

  await dispatch({
    eventType,
    recipientUserId: userId,
    primaryEntityId: event.id,
    title: "Progress update",
    body: bits.join(" · "),
    href: "/dashboard",
    dedupeKey: isPlacement ? undefined : dedupeKey,
  });
}

export async function processEvent(id: string): Promise<void> {
  const started = Date.now();
  const store = prismaGamificationStore();
  const claimed = await store.claimEvent(id);
  if (!claimed) return;

  const event = await store.getEventById(id);
  if (!event) return;

  try {
    if (!isGamificationEventType(event.type)) {
      await store.markEvent(id, GamificationEventStatus.SKIPPED, {
        lastError: "unknown type",
        processedAt: new Date(),
      });
      return;
    }
    const snapshot = await loadSnapshot(event.userId, event.occurredAt);
    if ("skip" in snapshot) {
      await store.markEvent(id, GamificationEventStatus.SKIPPED, {
        lastError: snapshot.skip,
        processedAt: new Date(),
      });
      return;
    }

    const effects = evaluate(
      {
        id: event.id,
        userId: event.userId,
        type: event.type as GamificationEventType,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        occurredAt: event.occurredAt,
        payload: jsonObject(event.payload),
        isBackfill: event.isBackfill,
      },
      snapshot,
      {
        weekKey: getIstWeekKey(event.occurredAt),
        monthKey: istMonthKey(event.occurredAt),
      },
    );

    const skip = effects.find((e) => e.kind === "skip");
    if (skip && skip.kind === "skip") {
      await store.markEvent(id, GamificationEventStatus.SKIPPED, {
        lastError: skip.reason,
        processedAt: new Date(),
      });
      return;
    }

    const result = await applyEffects(event, effects);

    if (!event.isBackfill) {
      try {
        await notifyDigest(event.userId, event, result);
      } catch (err) {
        logger.info(
          {
            event: "gamification.notify.failed",
            err: err instanceof Error ? err.message : "unknown",
          },
          "gamification notify failed",
        );
      }
    }

    logger.info(
      {
        event: "gamification.event.processed",
        type: event.type,
        xp: result.xpAwarded,
        durationMs: Date.now() - started,
      },
      "gamification.event.processed",
    );
  } catch (err) {
    const attempts = event.attempts;
    const status =
      attempts >= MAX_ATTEMPTS
        ? GamificationEventStatus.DEAD
        : GamificationEventStatus.FAILED;
    await store.markEvent(id, status, { lastError: truncateError(err) });
    logger.error(
      {
        event: "gamification.event.failed",
        type: event.type,
        err: truncateError(err),
      },
      "gamification.event.failed",
    );
  }
}
