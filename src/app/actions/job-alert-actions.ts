"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { prismaJobAlertStore } from "@/features/job-alerts/prisma-store";
import {
  getMyAlert,
  setMyAlertEnabled,
  upsertMyAlert,
} from "@/features/job-alerts/service";
import type { JobAlertRow } from "@/features/job-alerts/types";
import {
  saveJobAlertSchema,
  toggleJobAlertSchema,
} from "@/lib/validations/job-alert";

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; message: string };
type ActionResult<T> = ActionOk<T> | ActionErr;

function deps() {
  return { alerts: prismaJobAlertStore() };
}

async function requireCandidate(): Promise<
  ActionResult<{ userId: string }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in to manage your job alerts." };
  }
  return { ok: true, data: { userId: session.user.id } };
}

export async function getMyJobAlertAction(): Promise<
  ActionResult<{ alert: JobAlertRow | null }>
> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  try {
    const result = await getMyAlert(deps(), gate.data.userId);
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, data: { alert: result.data } };
  } catch (error) {
    logger.error("[job-alert-actions] get", { error: String(error) });
    return { ok: false, message: "Could not load your job alert." };
  }
}

export async function saveMyJobAlertAction(
  input: unknown,
): Promise<ActionResult<{ alert: JobAlertRow }>> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  const parsed = saveJobAlertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  try {
    const result = await upsertMyAlert(deps(), gate.data.userId, parsed.data);
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: { alert: result.data } };
  } catch (error) {
    logger.error("[job-alert-actions] save", { error: String(error) });
    return { ok: false, message: "Could not save your job alert." };
  }
}

export async function toggleMyJobAlertAction(
  input: unknown,
): Promise<ActionResult<{ alert: JobAlertRow }>> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  const parsed = toggleJobAlertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  try {
    const result = await setMyAlertEnabled(
      deps(),
      gate.data.userId,
      parsed.data.enabled,
    );
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: { alert: result.data } };
  } catch (error) {
    logger.error("[job-alert-actions] toggle", { error: String(error) });
    return { ok: false, message: "Could not update your alert." };
  }
}
