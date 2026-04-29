import { EnrollmentStatus } from "@prisma/client";
import { clearReferralCookie } from "@/app/actions/referral-actions";
import type { RegisterInput } from "@/lib/validations/register";
import { prisma } from "@/lib/db";
import { generateUniqueReferralCode } from "./generate-referral-code";

export type CompleteRegistrationResult =
  | { ok: true; profileId: string }
  | { ok: false; reason: "already_registered"; message: string }
  | { ok: false; reason: "internal_error"; message: string };

export async function completeRegistration(
  userId: string,
  input: RegisterInput,
): Promise<CompleteRegistrationResult> {
  const existingProfile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (existingProfile && existingEnrollment) {
    return {
      ok: false,
      reason: "already_registered",
      message: "You are already registered.",
    };
  }

  if (existingProfile && !existingEnrollment) {
    await prisma.studentProfile.delete({ where: { userId } });
  }

  let referrerId: string | null = null;
  if (input.referralCode) {
    const matchingReferrer = await prisma.studentProfile.findUnique({
      where: { referralCode: input.referralCode },
      select: { userId: true },
    });
    if (matchingReferrer && matchingReferrer.userId !== userId) {
      referrerId = matchingReferrer.userId;
    } else if (!matchingReferrer) {
      console.warn(
        "[registration] invalid referral code skipped:",
        input.referralCode,
      );
    }
  }

  let newReferralCode: string;
  try {
    newReferralCode = await generateUniqueReferralCode();
  } catch {
    return {
      ok: false,
      reason: "internal_error",
      message: "Could not assign a referral code. Try again.",
    };
  }

  const challenge = await prisma.challenge.findUnique({
    where: { domain: input.domain },
    select: { id: true },
  });
  if (!challenge) {
    return {
      ok: false,
      reason: "internal_error",
      message: "Challenge for this domain is not available.",
    };
  }

  const linkedinUrl =
    input.linkedinUrl === "" ? null : input.linkedinUrl;
  const githubUsername =
    input.githubUsername === "" ? null : input.githubUsername;
  const phone = input.phone === "" ? null : input.phone;

  try {
    const profileId = await prisma.$transaction(async (tx) => {
      const profile = await tx.studentProfile.create({
        data: {
          userId,
          fullName: input.fullName,
          college: input.college,
          graduationYear: input.graduationYear,
          domain: input.domain,
          skills: input.skills ?? [],
          linkedinUrl,
          phone,
          githubUsername,
          referralCode: newReferralCode,
        },
      });

      await tx.enrollment.create({
        data: {
          userId,
          challengeId: challenge.id,
          domain: input.domain,
          status: EnrollmentStatus.ACTIVE,
        },
      });

      if (referrerId) {
        await tx.referral.create({
          data: {
            referrerId,
            referredId: userId,
            rewardGiven: false,
          },
        });
      }

      return profile.id;
    });

    await clearReferralCookie();

    return { ok: true, profileId };
  } catch (e) {
    console.error("[registration] transaction failed:", e);
    return {
      ok: false,
      reason: "internal_error",
      message: "Something went wrong. Please try again.",
    };
  }
}
