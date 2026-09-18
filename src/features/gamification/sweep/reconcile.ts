/**
 * Plan 151 §31.4 step 3 — reverse XP whose source no longer qualifies.
 * Reversal is a new negative ledger row; nothing is deleted.
 */
import "server-only";

import { GamificationEventStatus } from "@prisma/client";
import { writeClient } from "@/lib/db";
import { prismaGamificationStore } from "@/repositories/gamification";

export async function reconcileDisqualified(limit = 500): Promise<number> {
  const db = writeClient();
  const store = prismaGamificationStore();

  const txs = await db.xpTransaction.findMany({
    where: {
      amount: { gt: 0 },
      reversesId: null,
      eventId: { not: null },
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      category: true,
      ruleKey: true,
      eventId: true,
      sourceType: true,
      sourceId: true,
      idempotencyKey: true,
    },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  let reversed = 0;
  for (const row of txs) {
    const stillQualifies = await sourceStillQualifies(
      row.sourceType,
      row.sourceId,
    );
    if (stillQualifies) continue;

    const already = await db.xpTransaction.findUnique({
      where: { reversesId: row.id },
      select: { id: true },
    });
    if (already) continue;

    await db.$transaction(async (tx) => {
      await store.lockProgress(tx, row.userId);
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
        reason: "source no longer qualifies",
      });
      if (!inserted) return;
      const total = await store.sumXp(tx, row.userId);
      await tx.userProgress.update({
        where: { userId: row.userId },
        data: { xpTotal: total, recomputedAt: new Date() },
        select: { userId: true },
      });
      reversed += 1;
    });
    void GamificationEventStatus;
  }
  return reversed;
}

async function sourceStillQualifies(
  sourceType: string,
  sourceId: string,
): Promise<boolean> {
  const db = writeClient();
  if (sourceType === "ActivityEvaluation") {
    const row = await db.activityEvaluation.findUnique({
      where: { id: sourceId },
      select: { passed: true, isAuthoritative: true },
    });
    return row?.passed === true && row.isAuthoritative === true;
  }
  if (sourceType === "Credential") {
    const row = await db.credential.findUnique({
      where: { id: sourceId },
      select: { status: true },
    });
    return row?.status === "ISSUED";
  }
  if (sourceType === "ProgramEnrollment") {
    const row = await db.programEnrollment.findUnique({
      where: { id: sourceId },
      select: { status: true },
    });
    return row?.status === "COMPLETED";
  }
  if (sourceType === "HackathonSubmission") {
    const row = await db.hackathonSubmission.findUnique({
      where: { id: sourceId },
      select: { id: true },
    });
    return row != null;
  }
  if (sourceType === "Referral") {
    const row = await db.referral.findUnique({
      where: { id: sourceId },
      select: { rewardGiven: true },
    });
    return row?.rewardGiven === true;
  }
  return true;
}
