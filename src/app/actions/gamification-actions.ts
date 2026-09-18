"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isBadgesUiEnabled } from "@/lib/feature-flags";

type Result = { ok: true; data: { updated: number } } | { ok: false; message: string };

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export async function markBadgesSeenAction(
  raw: unknown,
): Promise<Result> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in required." };
  }
  if (!isBadgesUiEnabled()) {
    return { ok: false, message: "Badges are not enabled." };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Invalid badge ids." };
  }
  const updated = await prisma.userBadge.updateMany({
    where: {
      id: { in: parsed.data.ids },
      userId: session.user.id,
      seenAt: null,
      revokedAt: null,
    },
    data: { seenAt: new Date() },
  });
  return { ok: true, data: { updated: updated.count } };
}
