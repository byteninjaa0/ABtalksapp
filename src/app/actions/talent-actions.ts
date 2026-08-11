"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  registerRecruiter,
} from "@/features/talent-pool/recruiter-registration";
import {
  toggleShortlist,
  updateShortlistNote,
} from "@/features/talent-pool/pool";
import {
  recruiterRegisterSchema,
  shortlistNoteSchema,
  shortlistToggleSchema,
} from "@/lib/validations/talent";

type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; message: string };

export async function registerRecruiterAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Please sign in to continue." };
  }

  const parsed = recruiterRegisterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please check the form and try again." };
  }

  const result = await registerRecruiter(session.user.id, {
    fullName: parsed.data.fullName,
    company: parsed.data.company,
    phone: parsed.data.phone || undefined,
  });
  if (!result.ok) return result;

  revalidatePath("/talent/register");
  revalidatePath("/talent/pending");
  return { ok: true };
}

export async function toggleShortlistAction(
  input: unknown,
): Promise<ActionResult<{ shortlisted: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Please sign in." };
  }

  const parsed = shortlistToggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid member." };

  const result = await toggleShortlist(
    session.user.id,
    parsed.data.memberId,
  );
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/talent");
  revalidatePath("/talent/shortlist");
  revalidatePath(`/talent/members/${parsed.data.memberId}`);
  revalidatePath("/hire");
  return { ok: true, data: { shortlisted: result.shortlisted } };
}

export async function updateShortlistNoteAction(
  input: unknown,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Please sign in." };
  }

  const parsed = shortlistNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid note." };

  const result = await updateShortlistNote(
    session.user.id,
    parsed.data.memberId,
    parsed.data.note,
  );
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/talent/shortlist");
  revalidatePath(`/talent/members/${parsed.data.memberId}`);
  return { ok: true };
}
