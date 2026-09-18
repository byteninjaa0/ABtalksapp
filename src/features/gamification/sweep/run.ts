/**
 * Plan 151 §31.4 — daily sweep: derive → process → reconcile → caches.
 * Time-boxed to 50 s so Vercel can finish.
 */
import "server-only";

import { GamificationEventStatus } from "@prisma/client";
import { writeClient } from "@/lib/db";
import { logger } from "@/lib/logger";
import { isGamificationEventsEnabled } from "@/lib/feature-flags";
import { processEvent } from "../process-event";
import { deriveAll } from "./derive";
import { reconcileDisqualified } from "./reconcile";
import { measuredRarityBand } from "../badges/criteria";

const TIME_BUDGET_MS = 50_000;

export async function runGamificationSweep(opts?: {
  windowHours?: number;
  isBackfill?: boolean;
}): Promise<{
  derived: number;
  processed: number;
  reversed: number;
  dead: number;
}> {
  if (!isGamificationEventsEnabled() && !opts?.isBackfill) {
    return { derived: 0, processed: 0, reversed: 0, dead: 0 };
  }

  const started = Date.now();
  const hours = opts?.windowHours ?? 48;
  const since =
    opts?.isBackfill || hours <= 0
      ? null
      : new Date(Date.now() - hours * 60 * 60 * 1000);

  const derived = await deriveAll({
    since,
    isBackfill: opts?.isBackfill === true,
  });
  const derivedCount = Object.values(derived).reduce((a, b) => a + b, 0);

  const db = writeClient();
  const pending = await db.gamificationEvent.findMany({
    where: {
      status: {
        in: [GamificationEventStatus.PENDING, GamificationEventStatus.FAILED],
      },
      attempts: { lt: 5 },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  let processed = 0;
  for (const row of pending) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    await processEvent(row.id);
    processed += 1;
  }

  const reversed = await reconcileDisqualified(200);

  const eligibleActive = await db.gamificationEvent.groupBy({
    by: ["userId"],
    where: {
      type: "activity.passed",
      status: GamificationEventStatus.PROCESSED,
      occurredAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
    },
  });
  const denom = eligibleActive.length;
  const badges = await db.badgeDefinition.findMany({
    select: { id: true, earnedCount: true },
  });
  for (const badge of badges) {
    const holders = await db.userBadge.count({
      where: { badgeId: badge.id, revokedAt: null },
    });
    await db.badgeDefinition.update({
      where: { id: badge.id },
      data: {
        earnedCount: holders,
        measuredRarity: measuredRarityBand(holders, denom),
      },
      select: { id: true },
    });
  }

  const dead = await db.gamificationEvent.count({
    where: { status: GamificationEventStatus.DEAD },
  });

  logger.info(
    {
      event: "gamification.sweep.summary",
      derived: derivedCount,
      processed,
      reversed,
      dead,
      durationMs: Date.now() - started,
    },
    "gamification.sweep.summary",
  );

  return { derived: derivedCount, processed, reversed, dead };
}
