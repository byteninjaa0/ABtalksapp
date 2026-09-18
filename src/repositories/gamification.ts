/**
 * Plan 151 — Prisma boundary for gamification (078-native).
 * Injectable store so unit/integration tests never need the production DB.
 */
import "server-only";

import {
  GamificationEventStatus,
  GamificationFlagSeverity,
  GamificationFlagStatus,
  Prisma,
  type GamificationRule,
  type UserProgress,
} from "@prisma/client";
import { prisma, writeClient } from "@/lib/db";

export const EVENT_SELECT = {
  id: true,
  userId: true,
  type: true,
  sourceType: true,
  sourceId: true,
  idempotencyKey: true,
  occurredAt: true,
  payload: true,
  status: true,
  attempts: true,
  lockedAt: true,
  lastError: true,
  isBackfill: true,
  processedAt: true,
  createdAt: true,
} as const;

export type EventRow = {
  id: string;
  userId: string;
  type: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  occurredAt: Date;
  payload: Prisma.JsonValue | null;
  status: GamificationEventStatus;
  attempts: number;
  lockedAt: Date | null;
  lastError: string | null;
  isBackfill: boolean;
  processedAt: Date | null;
  createdAt: Date;
};

export type InsertEventInput = {
  userId: string;
  type: string;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  occurredAt: Date;
  payload: Prisma.InputJsonValue | undefined;
  isBackfill?: boolean;
};

export type XpInsert = {
  userId: string;
  amount: number;
  category: "LEARNING" | "BUILDING" | "CAREER" | "COMPETITION" | "COMMUNITY";
  ruleKey: string;
  eventId: string | null;
  sourceType: string;
  sourceId: string;
  idempotencyKey: string;
  reversesId?: string | null;
  isBackfill?: boolean;
  reason?: string | null;
  createdByUserId?: string | null;
};

const CLAIM_SQL = Prisma.sql`
  UPDATE "GamificationEvent"
  SET status = 'PROCESSING',
      "lockedAt" = now(),
      attempts = attempts + 1
  WHERE id = $1
    AND (
      status IN ('PENDING', 'FAILED')
      OR (status = 'PROCESSING' AND "lockedAt" < now() - interval '10 minutes')
    )
  RETURNING id
`;

export type GamificationStore = {
  insertEventIfAbsent(input: InsertEventInput): Promise<EventRow | null>;
  getEventById(id: string): Promise<EventRow | null>;
  getEventByIdempotency(key: string): Promise<EventRow | null>;
  claimEvent(id: string): Promise<boolean>;
  markEvent(
    id: string,
    status: GamificationEventStatus,
    extra?: { lastError?: string | null; processedAt?: Date | null },
  ): Promise<void>;
  lockProgress(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<UserProgress>;
  insertXp(tx: Prisma.TransactionClient, row: XpInsert): Promise<boolean>;
  sumXp(tx: Prisma.TransactionClient, userId: string): Promise<number>;
  upsertPeriodScore(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      periodType: string;
      periodKey: string;
      amount: number;
      at: Date;
    },
  ): Promise<void>;
  listActiveRules(): Promise<GamificationRule[]>;
};

export function prismaGamificationStore(): GamificationStore {
  const db = () => writeClient();

  return {
    async insertEventIfAbsent(input) {
      await db().gamificationEvent.createMany({
        data: {
          userId: input.userId,
          type: input.type,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          idempotencyKey: input.idempotencyKey,
          occurredAt: input.occurredAt,
          payload: input.payload,
          isBackfill: input.isBackfill ?? false,
        },
        skipDuplicates: true,
      });
      return db().gamificationEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: EVENT_SELECT,
      });
    },

    async getEventById(id) {
      return db().gamificationEvent.findUnique({
        where: { id },
        select: EVENT_SELECT,
      });
    },

    async getEventByIdempotency(key) {
      return db().gamificationEvent.findUnique({
        where: { idempotencyKey: key },
        select: EVENT_SELECT,
      });
    },

    async claimEvent(id) {
      const rows = await db().$queryRaw<{ id: string }[]>`
        UPDATE "GamificationEvent"
        SET status = 'PROCESSING'::"GamificationEventStatus",
            "lockedAt" = now(),
            attempts = attempts + 1
        WHERE id = ${id}
          AND (
            status IN ('PENDING'::"GamificationEventStatus", 'FAILED'::"GamificationEventStatus")
            OR (
              status = 'PROCESSING'::"GamificationEventStatus"
              AND "lockedAt" < now() - interval '10 minutes'
            )
          )
        RETURNING id
      `;
      void CLAIM_SQL;
      return rows.length > 0;
    },

    async markEvent(id, status, extra) {
      await db().gamificationEvent.update({
        where: { id },
        data: {
          status,
          lastError: extra?.lastError ?? undefined,
          processedAt: extra?.processedAt ?? undefined,
          lockedAt: status === "PROCESSING" ? undefined : null,
        },
        select: { id: true },
      });
    },

    async lockProgress(tx, userId) {
      await tx.$executeRaw`
        INSERT INTO "UserProgress" ("userId", "updatedAt")
        VALUES (${userId}, now())
        ON CONFLICT ("userId") DO NOTHING
      `;
      const rows = await tx.$queryRaw<UserProgress[]>`
        SELECT * FROM "UserProgress" WHERE "userId" = ${userId} FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        throw new Error("UserProgress lock failed");
      }
      return row;
    },

    async insertXp(tx, row) {
      try {
        await tx.xpTransaction.create({
          data: {
            userId: row.userId,
            amount: row.amount,
            category: row.category,
            ruleKey: row.ruleKey,
            eventId: row.eventId,
            sourceType: row.sourceType,
            sourceId: row.sourceId,
            idempotencyKey: row.idempotencyKey,
            reversesId: row.reversesId ?? null,
            isBackfill: row.isBackfill ?? false,
            reason: row.reason ?? null,
            createdByUserId: row.createdByUserId ?? null,
          },
          select: { id: true },
        });
        return true;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          return false;
        }
        throw err;
      }
    },

    async sumXp(tx, userId) {
      const agg = await tx.xpTransaction.aggregate({
        where: { userId },
        _sum: { amount: true },
      });
      return agg._sum.amount ?? 0;
    },

    async upsertPeriodScore(tx, input) {
      await tx.xpPeriodScore.upsert({
        where: {
          userId_periodType_periodKey: {
            userId: input.userId,
            periodType: input.periodType,
            periodKey: input.periodKey,
          },
        },
        create: {
          userId: input.userId,
          periodType: input.periodType,
          periodKey: input.periodKey,
          xp: input.amount,
          lastXpAt: input.at,
        },
        update: {
          xp: { increment: input.amount },
          lastXpAt: input.at,
        },
        select: { id: true },
      });
    },

    async listActiveRules() {
      return db().gamificationRule.findMany({
        where: { isActive: true },
      });
    },
  };
}

export async function findUserStatus(userId: string): Promise<{
  disabled: boolean;
  deleted: boolean;
  phoneVerified: boolean;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      disabledAt: true,
      phoneVerification: { select: { verifiedAt: true } },
    },
  });
  if (!user) return null;
  return {
    disabled: user.disabledAt != null,
    deleted: user.deletedAt != null,
    phoneVerified: user.phoneVerification?.verifiedAt != null,
  };
}

export { GamificationEventStatus, GamificationFlagSeverity, GamificationFlagStatus };
