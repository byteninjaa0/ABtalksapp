import "server-only";
import { prisma } from "@/lib/db";

export type RecruiterState =
  | { status: "none" }
  | { status: "pending"; fullName: string; company: string }
  | { status: "approved"; fullName: string; company: string };

export async function getRecruiterState(userId: string): Promise<RecruiterState> {
  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId },
    select: { fullName: true, company: true, approved: true },
  });
  if (!profile) return { status: "none" };
  if (!profile.approved) {
    return {
      status: "pending",
      fullName: profile.fullName,
      company: profile.company,
    };
  }
  return {
    status: "approved",
    fullName: profile.fullName,
    company: profile.company,
  };
}

export async function registerRecruiter(
  userId: string,
  input: { fullName: string; company: string; phone?: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [user, studentProfile, existing] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    }),
    prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
    prisma.recruiterProfile.findUnique({
      where: { userId },
      select: { id: true, approved: true },
    }),
  ]);

  if (!user) return { ok: false, message: "Account not found." };
  if (studentProfile) {
    return {
      ok: false,
      message:
        "Student challenge accounts cannot register as recruiters. Use a separate Google account.",
    };
  }
  if (user.role !== "STUDENT" && user.role !== "RECRUITER") {
    return { ok: false, message: "This account cannot register as a recruiter." };
  }
  if (existing) {
    return {
      ok: false,
      message: existing.approved
        ? "You already have recruiter access."
        : "Your recruiter application is already pending review.",
    };
  }

  // Recruiter access is decided here, by a seat ABTalks verified out of band —
  // never by anything the person signing up submits. This is what stops a
  // candidate from filling in the form and becoming a recruiter: previously any
  // account that posted this form was switched to role RECRUITER (unapproved,
  // but a recruiter nonetheless).
  const email = user.email?.trim().toLowerCase();
  const seat = email
    ? await prisma.verifiedRecruiterSeat.findFirst({
        where: { email, active: true, revokedAt: null },
        select: { id: true, company: true },
      })
    : null;

  if (!seat) {
    return {
      ok: false,
      message:
        "This email isn't on our verified recruiter list. Write to team@abtalks.in from your work address and we'll verify your company.",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.recruiterProfile.create({
      data: {
        userId,
        fullName: input.fullName,
        // The verified company wins over whatever was typed in the form.
        company: seat.company || input.company,
        phone: input.phone || null,
        approved: true,
      },
    });
    await tx.user.update({
      where: { id: userId },
      data: { role: "RECRUITER" },
    });
  });

  return { ok: true };
}
