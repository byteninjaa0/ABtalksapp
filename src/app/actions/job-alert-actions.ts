"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logger } from "@/lib/logger";
import { prismaJobAlertStore } from "@/features/job-alerts/prisma-store";
import {
  createMyAlert,
  deleteMyAlert,
  listMyAlerts,
  setMyAlertEnabled,
  updateMyAlert,
} from "@/features/job-alerts/service";
import type { JobAlertRow } from "@/features/job-alerts/types";
import {
  createJobAlertSchema,
  deleteJobAlertSchema,
  toggleJobAlertSchema,
  updateJobAlertSchema,
} from "@/lib/validations/job-alert";

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; message: string; code?: string };
type ActionResult<T> = ActionOk<T> | ActionErr;

function deps() {
  return { alerts: prismaJobAlertStore() };
}

async function requireCandidate(): Promise<ActionResult<{ userId: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in to manage your job alerts." };
  }
  return { ok: true, data: { userId: session.user.id } };
}

export async function listMyJobAlertsAction(): Promise<
  ActionResult<{ alerts: JobAlertRow[] }>
> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  try {
    const res = await listMyAlerts(deps(), gate.data.userId);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: { alerts: res.data } };
  } catch (error) {
    logger.error("[job-alert-actions] list", { error: String(error) });
    return { ok: false, message: "Could not load your job alerts." };
  }
}

export async function createMyJobAlertAction(
  input: unknown,
): Promise<ActionResult<{ alert: JobAlertRow }>> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  const parsed = createJobAlertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  try {
    const res = await createMyAlert(deps(), gate.data.userId, parsed.data);
    if (!res.ok)
      return { ok: false, message: res.message, code: res.code };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: { alert: res.data } };
  } catch (error) {
    logger.error("[job-alert-actions] create", { error: String(error) });
    return { ok: false, message: "Could not create your job alert." };
  }
}

export async function updateMyJobAlertAction(
  input: unknown,
): Promise<ActionResult<{ alert: JobAlertRow }>> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  const parsed = updateJobAlertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  const { id, ...criteria } = parsed.data;
  try {
    const res = await updateMyAlert(deps(), gate.data.userId, id, criteria);
    if (!res.ok)
      return { ok: false, message: res.message, code: res.code };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: { alert: res.data } };
  } catch (error) {
    logger.error("[job-alert-actions] update", { error: String(error) });
    return { ok: false, message: "Could not update your job alert." };
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
    const res = await setMyAlertEnabled(
      deps(),
      gate.data.userId,
      parsed.data.id,
      parsed.data.enabled,
    );
    if (!res.ok)
      return { ok: false, message: res.message, code: res.code };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: { alert: res.data } };
  } catch (error) {
    logger.error("[job-alert-actions] toggle", { error: String(error) });
    return { ok: false, message: "Could not update your alert." };
  }
}

export async function deleteMyJobAlertAction(
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const gate = await requireCandidate();
  if (!gate.ok) return gate;
  const parsed = deleteJobAlertSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid input" };
  try {
    const res = await deleteMyAlert(deps(), gate.data.userId, parsed.data.id);
    if (!res.ok) return { ok: false, message: res.message };
    revalidatePath("/jobs/alerts");
    return { ok: true, data: res.data };
  } catch (error) {
    logger.error("[job-alert-actions] delete", { error: String(error) });
    return { ok: false, message: "Could not delete your job alert." };
  }
}
