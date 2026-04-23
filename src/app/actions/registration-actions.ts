"use server";

import { auth } from "@/auth";
import { completeRegistration } from "@/features/registration/complete-registration";
import { registerSchema } from "@/lib/validations/register";

export async function completeRegistrationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, message: "Not authenticated" };
  }

  const rawSkills = formData.get("skills") as string;
  const skills = rawSkills
    ? rawSkills.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const refRaw = formData.get("referralCode");
  const referralCode =
    typeof refRaw === "string"
      ? refRaw.trim().toUpperCase().slice(0, 6)
      : "";

  const yearRaw = formData.get("graduationYear");
  const graduationYear =
    typeof yearRaw === "string"
      ? Number.parseInt(yearRaw, 10)
      : Number(yearRaw);

  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    college: formData.get("college"),
    graduationYear,
    domain: formData.get("domain"),
    skills,
    linkedinUrl: formData.get("linkedinUrl") || "",
    githubUsername: formData.get("githubUsername") || "",
    referralCode,
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const result = await completeRegistration(session.user.id, parsed.data);
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  return { ok: true as const };
}
