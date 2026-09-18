/**
 * Plan 151 §31.1 — record a gamification event after the domain write commits.
 * Never throws. Flag-gated. Zod-validates payload. Insert-if-absent then process.
 */
import "server-only";

import { after } from "next/server";
import { isGamificationEventsEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import {
  buildIdempotencyKey,
  isGamificationEventType,
  parseEventPayload,
  type GamificationEventType,
} from "./event-types";
import { processEvent } from "./process-event";
import { prismaGamificationStore } from "@/repositories/gamification";
import type { Prisma } from "@prisma/client";

export type RecordGamificationEventInput = {
  type: GamificationEventType;
  userId: string;
  sourceType: string;
  sourceId: string;
  /** Smallest identity that must pay at most once. Combined as type:scope. */
  scopeKey: string;
  occurredAt: Date;
  payload?: unknown;
  isBackfill?: boolean;
};

/**
 * Fast-path recorder. Catch everything; log `gamification.record.failed`;
 * never rethrow. The daily sweep heals dropped after() work.
 */
export async function recordGamificationEvent(
  input: RecordGamificationEventInput,
): Promise<void> {
  try {
    if (!isGamificationEventsEnabled()) return;
    if (!input.userId) return;
    if (!isGamificationEventType(input.type)) return;
    const parsed = parseEventPayload(input.type, input.payload ?? {});
    if (!parsed.ok) {
      logger.info(
        { event: "gamification.record.failed", reason: "payload", type: input.type },
        "gamification payload rejected",
      );
      return;
    }
    const store = prismaGamificationStore();
    const row = await store.insertEventIfAbsent({
      userId: input.userId,
      type: input.type,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      idempotencyKey: buildIdempotencyKey(input.type, input.scopeKey),
      occurredAt: input.occurredAt,
      payload: parsed.data as Prisma.InputJsonValue,
      isBackfill: input.isBackfill,
    });
    if (!row) return;
    if (row.status === "PENDING" || row.status === "FAILED") {
      await processEvent(row.id);
    }
  } catch (err) {
    logger.error(
      {
        event: "gamification.record.failed",
        type: input.type,
        err: err instanceof Error ? err.message : "unknown",
      },
      "gamification.record.failed",
    );
  }
}

/**
 * Domain actions call this AFTER their transaction commits. It schedules
 * recording inside `after()` so a throw cannot fail the user's submit.
 */
export function scheduleGamificationEvent(
  input: RecordGamificationEventInput,
): void {
  try {
    after(() => {
      void recordGamificationEvent(input);
    });
  } catch (err) {
    logger.error(
      {
        event: "gamification.record.failed",
        type: input.type,
        err: err instanceof Error ? err.message : "unknown",
      },
      "gamification.schedule.failed",
    );
  }
}
