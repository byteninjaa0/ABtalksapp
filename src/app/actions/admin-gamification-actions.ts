"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  GamificationFlagStatus,
  Prisma,
  XpCategory,
} from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { writeAudit } from "@/features/admin/audit";
import { writeClient } from "@/lib/db";
import { prismaGamificationStore } from "@/repositories/gamification";
import { processEvent } from "@/features/gamification/process-event";
import { logger } from "@/lib/logger";
import { badgeCriterionSchema } from "@/features/gamification/badges/criteria";
import { questTasksSchema } from "@/features/gamification/quests/progress";

type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const reasonSchema = z.string().trim().min(10).max(500);

export async function adjustXpAction(raw: unknown): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      userId: z.string().min(1),
      amount: z.number().int().min(-5000).max(5000),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Amount must be ±5,000 with a reason of at least 10 characters." };
  }
  if (parsed.data.amount === 0) {
    return { ok: false, message: "Amount cannot be zero." };
  }
  const db = writeClient();
  const store = prismaGamificationStore();
  try {
    const id = await db.$transaction(async (tx) => {
      const progress = await store.lockProgress(tx, parsed.data.userId);
      const inserted = await store.insertXp(tx, {
        userId: parsed.data.userId,
        amount: parsed.data.amount,
        category: "LEARNING",
        ruleKey: "admin.adjust",
        eventId: null,
        sourceType: "AdminAction",
        sourceId: admin.userId,
        idempotencyKey: `admin.adjust:${parsed.data.userId}:${Date.now()}`,
        reason: parsed.data.reason,
        createdByUserId: admin.userId,
      });
      if (!inserted) throw new Error("idempotency collision");
      const xpTotal = progress.xpTotal + parsed.data.amount;
      await tx.userProgress.update({
        where: { userId: parsed.data.userId },
        data: { xpTotal, recomputedAt: new Date() },
        select: { userId: true },
      });
      const row = await tx.xpTransaction.findFirst({
        where: { userId: parsed.data.userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        targetUserId: parsed.data.userId,
        entityType: "XpTransaction",
        entityId: row?.id ?? parsed.data.userId,
        actionType: "xp.adjust",
        reason: parsed.data.reason,
        previousState: { xpTotal: progress.xpTotal, level: progress.level },
        newState: { xpTotal, level: progress.level },
      });
      return row?.id ?? "";
    });
    revalidatePath("/admin/gamification");
    return { ok: true, data: { id } };
  } catch (err) {
    logger.error("[admin] adjustXpAction", { error: String(err) });
    return { ok: false, message: "Could not adjust XP." };
  }
}

export async function reverseXpTransactionAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({ transactionId: z.string().min(1), reason: reasonSchema })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Reason of at least 10 characters is required." };
  }
  const db = writeClient();
  const store = prismaGamificationStore();
  try {
    const result = await db.$transaction(async (tx) => {
      const row = await tx.xpTransaction.findUnique({
        where: { id: parsed.data.transactionId },
        select: {
          id: true,
          userId: true,
          amount: true,
          category: true,
          ruleKey: true,
          eventId: true,
          sourceType: true,
          sourceId: true,
        },
      });
      if (!row) throw new Error("missing");
      const progress = await store.lockProgress(tx, row.userId);
      const inserted = await store.insertXp(tx, {
        userId: row.userId,
        amount: -row.amount,
        category: row.category,
        ruleKey: `${row.ruleKey}.reversal`,
        eventId: row.eventId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        idempotencyKey: `rev:${row.id}`,
        reversesId: row.id,
        reason: parsed.data.reason,
        createdByUserId: admin.userId,
      });
      if (!inserted) throw new Error("already reversed");
      const xpTotal = progress.xpTotal - row.amount;
      await tx.userProgress.update({
        where: { userId: row.userId },
        data: { xpTotal, recomputedAt: new Date() },
        select: { userId: true },
      });
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        targetUserId: row.userId,
        entityType: "XpTransaction",
        entityId: row.id,
        actionType: "xp.reverse",
        reason: parsed.data.reason,
        previousState: { xpTotal: progress.xpTotal, level: progress.level },
        newState: { xpTotal, level: progress.level },
      });
      return { id: row.id };
    });
    revalidatePath("/admin/gamification");
    return { ok: true, data: result };
  } catch (err) {
    logger.error("[admin] reverseXpTransactionAction", { error: String(err) });
    return { ok: false, message: "Could not reverse that transaction." };
  }
}

export async function revokeBadgeAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      userBadgeId: z.string().min(1),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Reason of at least 10 characters is required." };
  }
  const db = writeClient();
  const store = prismaGamificationStore();
  try {
    await db.$transaction(async (tx) => {
      const badge = await tx.userBadge.findUnique({
        where: { id: parsed.data.userBadgeId },
        select: {
          id: true,
          userId: true,
          badgeId: true,
          revokedAt: true,
          badge: { select: { xpReward: true, slug: true } },
        },
      });
      if (!badge || badge.revokedAt) throw new Error("missing");
      await tx.userBadge.update({
        where: { id: badge.id },
        data: {
          revokedAt: new Date(),
          revokedReason: parsed.data.reason,
        },
        select: { id: true },
      });
      if (badge.badge.xpReward > 0) {
        await store.lockProgress(tx, badge.userId);
        await store.insertXp(tx, {
          userId: badge.userId,
          amount: -badge.badge.xpReward,
          category: "CAREER",
          ruleKey: `badge.${badge.badge.slug}.revoke`,
          eventId: null,
          sourceType: "UserBadge",
          sourceId: badge.id,
          idempotencyKey: `badge-revoke:${badge.id}`,
          reason: parsed.data.reason,
          createdByUserId: admin.userId,
        });
      }
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        targetUserId: badge.userId,
        entityType: "UserBadge",
        entityId: badge.id,
        actionType: "badge.revoke",
        reason: parsed.data.reason,
        previousState: { revokedAt: null },
        newState: { revokedAt: new Date().toISOString() },
      });
    });
    revalidatePath("/admin/gamification");
    return { ok: true, data: { id: parsed.data.userBadgeId } };
  } catch (err) {
    logger.error("[admin] revokeBadgeAction", { error: String(err) });
    return { ok: false, message: "Could not revoke that badge." };
  }
}

export async function upsertGamificationRuleAction(
  raw: unknown,
): Promise<Result<{ key: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      key: z.string().min(1).max(80),
      eventType: z.string().min(1).max(80),
      category: z.nativeEnum(XpCategory),
      xpAmount: z.number().int().min(0).max(5000).nullable(),
      multiplierBp: z.number().int().min(0).max(20000),
      dailyCap: z.number().int().min(0).max(5000).nullable(),
      weeklyCap: z.number().int().min(0).max(20000).nullable(),
      lifetimeCap: z.number().int().min(0).max(100000).nullable(),
      isActive: z.boolean(),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Invalid rule." };
  }
  const db = writeClient();
  try {
    await db.$transaction(async (tx) => {
      const previous = await tx.gamificationRule.findUnique({
        where: { key: parsed.data.key },
      });
      await tx.gamificationRule.upsert({
        where: { key: parsed.data.key },
        create: {
          key: parsed.data.key,
          eventType: parsed.data.eventType,
          category: parsed.data.category,
          xpAmount: parsed.data.xpAmount,
          multiplierBp: parsed.data.multiplierBp,
          dailyCap: parsed.data.dailyCap,
          weeklyCap: parsed.data.weeklyCap,
          lifetimeCap: parsed.data.lifetimeCap,
          isActive: parsed.data.isActive,
          updatedByUserId: admin.userId,
        },
        update: {
          xpAmount: parsed.data.xpAmount,
          multiplierBp: parsed.data.multiplierBp,
          dailyCap: parsed.data.dailyCap,
          weeklyCap: parsed.data.weeklyCap,
          lifetimeCap: parsed.data.lifetimeCap,
          isActive: parsed.data.isActive,
          updatedByUserId: admin.userId,
        },
      });
      await writeAudit(tx, {
        actorUserId: admin.userId,
        adminUserId: admin.userId,
        entityType: "GamificationRule",
        entityId: parsed.data.key,
        actionType: "rule.upsert",
        reason: parsed.data.reason,
        previousState: previous
          ? { isActive: previous.isActive, xpAmount: previous.xpAmount }
          : null,
        newState: {
          isActive: parsed.data.isActive,
          xpAmount: parsed.data.xpAmount,
        },
      });
    });
    revalidatePath("/admin/gamification");
    return { ok: true, data: { key: parsed.data.key } };
  } catch (err) {
    logger.error("[admin] upsertGamificationRuleAction", { error: String(err) });
    return { ok: false, message: "Could not save the rule." };
  }
}

export async function replayEventAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = z.object({ eventId: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Missing event id." };
  const db = writeClient();
  await db.gamificationEvent.updateMany({
    where: {
      id: parsed.data.eventId,
      status: { in: ["FAILED", "DEAD"] },
    },
    data: { status: "FAILED", lastError: null },
  });
  await processEvent(parsed.data.eventId);
  await db.$transaction(async (tx) => {
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      entityType: "GamificationEvent",
      entityId: parsed.data.eventId,
      actionType: "event.replay",
      reason: "admin replay",
    });
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { id: parsed.data.eventId } };
}

export async function recomputeUserProgressAction(
  raw: unknown,
): Promise<Result<{ xpTotal: number }>> {
  const admin = await requireAdmin();
  const parsed = z.object({ userId: z.string().min(1) }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Missing user id." };
  const db = writeClient();
  const store = prismaGamificationStore();
  const xpTotal = await db.$transaction(async (tx) => {
    await store.lockProgress(tx, parsed.data.userId);
    const total = await store.sumXp(tx, parsed.data.userId);
    await tx.userProgress.update({
      where: { userId: parsed.data.userId },
      data: { xpTotal: total, recomputedAt: new Date() },
      select: { userId: true },
    });
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      targetUserId: parsed.data.userId,
      entityType: "UserProgress",
      entityId: parsed.data.userId,
      actionType: "progress.recompute",
      reason: "admin recompute",
      newState: { xpTotal: total },
    });
    return total;
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { xpTotal } };
}

export async function resolveFlagAction(
  raw: unknown,
): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      flagId: z.string().min(1),
      status: z.nativeEnum(GamificationFlagStatus),
      resolution: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Resolution of at least 10 characters is required." };
  }
  const db = writeClient();
  await db.$transaction(async (tx) => {
    const previous = await tx.gamificationFlag.findUnique({
      where: { id: parsed.data.flagId },
      select: { status: true, userId: true },
    });
    if (!previous) throw new Error("missing");
    await tx.gamificationFlag.update({
      where: { id: parsed.data.flagId },
      data: {
        status: parsed.data.status,
        resolution: parsed.data.resolution,
        reviewedByUserId: admin.userId,
        reviewedAt: new Date(),
      },
      select: { id: true },
    });
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      targetUserId: previous.userId,
      entityType: "GamificationFlag",
      entityId: parsed.data.flagId,
      actionType: "flag.resolve",
      reason: parsed.data.resolution,
      previousState: { status: previous.status },
      newState: { status: parsed.data.status },
    });
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { id: parsed.data.flagId } };
}

export async function holdUserAction(
  raw: unknown,
): Promise<Result<{ held: boolean }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      userId: z.string().min(1),
      hold: z.boolean(),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Reason of at least 10 characters is required." };
  }
  const db = writeClient();
  await db.$transaction(async (tx) => {
    const store = prismaGamificationStore();
    const progress = await store.lockProgress(tx, parsed.data.userId);
    await tx.userProgress.update({
      where: { userId: parsed.data.userId },
      data: { heldAt: parsed.data.hold ? new Date() : null },
      select: { userId: true },
    });
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      targetUserId: parsed.data.userId,
      entityType: "UserProgress",
      entityId: parsed.data.userId,
      actionType: parsed.data.hold ? "progress.hold" : "progress.unhold",
      reason: parsed.data.reason,
      previousState: { heldAt: progress.heldAt },
      newState: { heldAt: parsed.data.hold ? "now" : null },
    });
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { held: parsed.data.hold } };
}

export async function upsertBadgeAction(
  raw: unknown,
): Promise<Result<{ slug: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      slug: z.string().min(1).max(80),
      name: z.string().min(1).max(80),
      description: z.string().min(1).max(400),
      category: z.string().min(1).max(40),
      baseRarity: z.string().min(1).max(20),
      iconKey: z.string().min(1).max(40),
      criteria: z.unknown(),
      isActive: z.boolean(),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Invalid badge." };
  const criteria = badgeCriterionSchema.safeParse(parsed.data.criteria);
  if (!criteria.success) return { ok: false, message: "Invalid criteria." };
  const db = writeClient();
  await db.$transaction(async (tx) => {
    const previous = await tx.badgeDefinition.findUnique({
      where: { slug: parsed.data.slug },
      select: { criteriaVersion: true, criteria: true },
    });
    const bump =
      previous &&
      JSON.stringify(previous.criteria) !== JSON.stringify(parsed.data.criteria);
    await tx.badgeDefinition.upsert({
      where: { slug: parsed.data.slug },
      create: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        baseRarity: parsed.data.baseRarity,
        iconKey: parsed.data.iconKey,
        criteria: parsed.data.criteria as Prisma.InputJsonValue,
        isActive: parsed.data.isActive,
      },
      update: {
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        baseRarity: parsed.data.baseRarity,
        iconKey: parsed.data.iconKey,
        criteria: parsed.data.criteria as Prisma.InputJsonValue,
        isActive: parsed.data.isActive,
        criteriaVersion: bump
          ? { increment: 1 }
          : previous?.criteriaVersion,
      },
    });
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      entityType: "BadgeDefinition",
      entityId: parsed.data.slug,
      actionType: "badge.upsert",
      reason: parsed.data.reason,
    });
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { slug: parsed.data.slug } };
}

export async function previewBadgeCriteriaAction(
  raw: unknown,
): Promise<Result<{ count: number }>> {
  await requireAdmin();
  const parsed = z.object({ criteria: z.unknown() }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Invalid criteria." };
  const criteria = badgeCriterionSchema.safeParse(parsed.data.criteria);
  if (!criteria.success) return { ok: false, message: "Invalid criteria." };
  return { ok: true, data: { count: 0 } };
}

export async function upsertQuestAction(
  raw: unknown,
): Promise<Result<{ slug: string }>> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      slug: z.string().min(1).max(80),
      name: z.string().min(1).max(80),
      description: z.string().min(1).max(400),
      cadence: z.enum(["ONBOARDING", "WEEKLY", "MONTHLY", "CAREER"]),
      segment: z.string().max(40).nullable(),
      tasks: z.unknown(),
      xpReward: z.number().int().min(0).max(500),
      badgeSlug: z.string().max(80).nullable(),
      isActive: z.boolean(),
      reason: reasonSchema,
    })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Invalid quest." };
  const tasks = questTasksSchema.safeParse(parsed.data.tasks);
  if (!tasks.success) return { ok: false, message: "Invalid quest tasks." };
  const db = writeClient();
  await db.$transaction(async (tx) => {
    await tx.questDefinition.upsert({
      where: { slug: parsed.data.slug },
      create: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description,
        cadence: parsed.data.cadence,
        segment: parsed.data.segment,
        tasks: parsed.data.tasks as Prisma.InputJsonValue,
        xpReward: parsed.data.xpReward,
        badgeSlug: parsed.data.badgeSlug,
        isActive: parsed.data.isActive,
      },
      update: {
        name: parsed.data.name,
        description: parsed.data.description,
        cadence: parsed.data.cadence,
        segment: parsed.data.segment,
        tasks: parsed.data.tasks as Prisma.InputJsonValue,
        xpReward: parsed.data.xpReward,
        badgeSlug: parsed.data.badgeSlug,
        isActive: parsed.data.isActive,
      },
    });
    await writeAudit(tx, {
      actorUserId: admin.userId,
      adminUserId: admin.userId,
      entityType: "QuestDefinition",
      entityId: parsed.data.slug,
      actionType: "quest.upsert",
      reason: parsed.data.reason,
    });
  });
  revalidatePath("/admin/gamification");
  return { ok: true, data: { slug: parsed.data.slug } };
}
