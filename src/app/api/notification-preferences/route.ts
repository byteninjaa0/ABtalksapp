import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  EVENT_TYPE_REGISTRY,
  EVENT_TYPES,
} from "@/features/notification/event-types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const rows = await prisma.notificationPreference.findMany({
    where: { userId },
    select: { eventType: true, channel: true, enabled: true },
  });

  const prefMap = new Map(
    rows.map((r) => [`${r.eventType}:${r.channel}`, r.enabled]),
  );

  const preferences = EVENT_TYPES.filter(
    (et) => EVENT_TYPE_REGISTRY[et].priority === "important",
  ).map((et) => {
    const config = EVENT_TYPE_REGISTRY[et];
    return {
      eventType: et,
      label: config.label,
      channel: "email" as const,
      enabled: prefMap.get(`${et}:email`) ?? config.defaultEmailEnabled,
      canDisable: !config.emailExempt,
    };
  });

  return NextResponse.json({ ok: true, data: preferences });
}

const putSchema = z.object({
  eventType: z.string(),
  channel: z.literal("email"),
  enabled: z.boolean(),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { eventType, channel, enabled } = parsed.data;

  if (!(eventType in EVENT_TYPE_REGISTRY)) {
    return NextResponse.json(
      { ok: false, message: "Unknown event type" },
      { status: 400 },
    );
  }

  if (channel !== "email") {
    return NextResponse.json(
      { ok: false, message: "In-app notifications cannot be disabled" },
      { status: 400 },
    );
  }

  const config = EVENT_TYPE_REGISTRY[eventType];
  if (config.emailExempt && !enabled) {
    return NextResponse.json(
      { ok: false, message: `${config.label} email cannot be disabled` },
      { status: 400 },
    );
  }

  await prisma.notificationPreference.upsert({
    where: {
      userId_eventType_channel: {
        userId: session.user.id,
        eventType,
        channel,
      },
    },
    update: { enabled },
    create: {
      userId: session.user.id,
      eventType,
      channel,
      enabled,
    },
  });

  return NextResponse.json({ ok: true });
}
