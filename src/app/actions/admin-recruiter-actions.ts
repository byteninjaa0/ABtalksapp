"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/db";
import { adminRecruiterActionSchema } from "@/lib/validations/talent";

type ActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function approveRecruiterAction(
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = adminRecruiterActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid application." };

  const profile = await prisma.recruiterProfile.findUnique({
    where: { id: parsed.data.recruiterProfileId },
    select: {
      id: true,
      approved: true,
      fullName: true,
      company: true,
      user: { select: { id: true, email: true } },
    },
  });

  if (!profile) return { ok: false, message: "Application not found." };
  if (profile.approved) return { ok: false, message: "Already approved." };

  const email = profile.user.email?.trim().toLowerCase() ?? "";

  await prisma.$transaction(async (tx) => {
    await tx.recruiterProfile.update({
      where: { id: profile.id },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedByAdminId: admin.userId,
      },
    });
    if (email) {
      // Approving is the verification decision. Do not overwrite an existing
      // seat — that row may have been added by hand with different notes.
      await tx.verifiedRecruiterSeat.upsert({
        where: { email },
        create: {
          email,
          company: profile.company,
          contactName: profile.fullName,
          active: true,
          verifiedByAdminId: admin.userId,
          notes: "Created when the application was approved.",
        },
        update: {},
      });
    }
    await tx.adminAction.create({
      data: {
        adminUserId: admin.userId,
        targetUserId: profile.user.id,
        actionType: "PROGRAM_APPROVE_RECRUITER",
        metadata: { recruiterProfileId: profile.id },
      },
    });
  });

  if (email) {
    const appUrl =
      process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "https://abtalks.in";
    await sendEmail({
      to: email,
      subject: "Your ABTalks recruiter access is approved",
      html: `<p>Hi ${profile.fullName},</p><p>Your recruiter application has been approved. Sign in at <a href="${appUrl}/talent/login">${appUrl}/talent/login</a> and open <a href="${appUrl}/hire">${appUrl}/hire</a>.</p><p>— ABTalks</p>`,
      text: `Hi ${profile.fullName},\n\nYour recruiter application has been approved. Sign in at ${appUrl}/talent/login and open ${appUrl}/hire.\n\n— ABTalks`,
    });
  }

  revalidatePath("/admin/program/recruiters");
  revalidatePath("/admin/recruiters");
  revalidatePath("/admin/recruiter-seats");
  revalidatePath("/admin");
  revalidatePath("/hire");
  return { ok: true };
}

export async function rejectRecruiterAction(
  input: unknown,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminRecruiterActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid application." };

  const profile = await prisma.recruiterProfile.findUnique({
    where: { id: parsed.data.recruiterProfileId },
    select: {
      id: true,
      approved: true,
      fullName: true,
      user: { select: { id: true, email: true } },
    },
  });

  if (!profile) return { ok: false, message: "Application not found." };
  if (profile.approved) {
    return { ok: false, message: "Cannot reject an approved recruiter." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.recruiterProfile.delete({ where: { id: profile.id } });
    await tx.user.update({
      where: { id: profile.user.id },
      data: { role: "STUDENT" },
    });
  });

  await sendEmail({
    to: profile.user.email,
    subject: "Update on your ABTalks recruiter application",
    html: `<p>Hi ${profile.fullName},</p><p>Thank you for your interest in recruiting through ABTalks. We are unable to approve your application at this time. You are welcome to re-apply later with an updated profile.</p><p>— ABTalks</p>`,
    text: `Hi ${profile.fullName},\n\nThank you for your interest. We are unable to approve your recruiter application at this time.\n\n— ABTalks`,
  });

  revalidatePath("/admin/program/recruiters");
  revalidatePath("/admin/recruiters");
  revalidatePath("/admin");
  return { ok: true };
}
