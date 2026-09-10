import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { EVENT_TYPE_REGISTRY, isValidEventType } from "./event-types";
import { processEmailDelivery } from "./email-delivery";

type DispatchEvent = {
  eventType: string;
  recipientUserId: string;
  primaryEntityId: string;
  title: string;
  body?: string;
  href?: string;
  metadata?: Record<string, unknown>;
};

type DispatchResult =
  | { ok: true; notificationId: string; deduplicated: boolean }
  | { ok: false; message: string };

function buildDedupeKey(
  eventType: string,
  recipientUserId: string,
  primaryEntityId: string,
): string {
  return `${eventType}:${recipientUserId}:${primaryEntityId}`;
}

async function isEmailEnabled(
  userId: string,
  eventType: string,
): Promise<boolean> {
  const config = EVENT_TYPE_REGISTRY[eventType];
  if (!config) return false;
  if (config.priority !== "important") return false;
  if (config.emailExempt) return true;

  const pref = await prisma.notificationPreference.findUnique({
    where: {
      userId_eventType_channel: { userId, eventType, channel: "email" },
    },
    select: { enabled: true },
  });

  return pref?.enabled ?? true;
}

export async function dispatch(event: DispatchEvent): Promise<DispatchResult> {
  if (!isValidEventType(event.eventType)) {
    return { ok: false, message: "Unknown event type" };
  }

  const dedupeKey = buildDedupeKey(
    event.eventType,
    event.recipientUserId,
    event.primaryEntityId,
  );

  let notificationId: string;
  let emailDeliveryId: string | null = null;

  try {
    const emailEnabled = await isEmailEnabled(
      event.recipientUserId,
      event.eventType,
    );

    const notification = await prisma.$transaction(async (tx) => {
      let created;
      try {
        created = await tx.userNotification.create({
          data: {
            recipientUserId: event.recipientUserId,
            eventType: event.eventType,
            title: event.title,
            body: event.body ?? null,
            href: event.href ?? null,
            dedupeKey,
            primaryEntityId: event.primaryEntityId,
            metadata: event.metadata as Prisma.InputJsonValue | undefined,
          },
          select: { id: true },
        });
      } catch (err: unknown) {
        if (
          typeof err === "object" &&
          err !== null &&
          "code" in err &&
          (err as { code: string }).code === "P2002"
        ) {
          return null;
        }
        throw err;
      }

      await tx.notificationDelivery.create({
        data: {
          notificationId: created.id,
          channel: "in_app",
          state: "sent",
        },
      });

      if (emailEnabled) {
        const emailDel = await tx.notificationDelivery.create({
          data: {
            notificationId: created.id,
            channel: "email",
            state: "created",
          },
          select: { id: true },
        });
        return { id: created.id, emailDeliveryId: emailDel.id };
      }

      return { id: created.id, emailDeliveryId: null };
    });

    if (notification === null) {
      return { ok: true, notificationId: "", deduplicated: true };
    }

    notificationId = notification.id;
    emailDeliveryId = notification.emailDeliveryId;
  } catch (err) {
    logger.error("[notification-service] dispatch failed", {
      error: String(err),
      eventType: event.eventType,
      recipientUserId: event.recipientUserId,
    });
    return { ok: false, message: "Failed to create notification" };
  }

  if (emailDeliveryId) {
    try {
      await processEmailDelivery(emailDeliveryId);
    } catch (err) {
      logger.error("[notification-service] inline email delivery failed", {
        error: String(err),
        deliveryId: emailDeliveryId,
      });
    }
  }

  return { ok: true, notificationId, deduplicated: false };
}
