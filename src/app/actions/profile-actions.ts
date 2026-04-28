"use server";

import { auth } from "@/auth";
import { updateProfile } from "@/features/profile/update-profile";
import type { UpdateProfileResult } from "@/features/profile/update-profile";

function parseSkillsJson(raw: string | null): unknown {
  if (!raw || raw.trim() === "") return [];
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function updateProfileAction(
  formData: FormData,
): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const skillsParsed = parseSkillsJson(
    typeof formData.get("skills") === "string"
      ? (formData.get("skills") as string)
      : null,
  );
  if (skillsParsed === null) {
    return { ok: false, message: "Invalid skills data" };
  }

  return updateProfile(session.user.id, {
    fullName: String(formData.get("fullName") ?? ""),
    college: String(formData.get("college") ?? ""),
    graduationYear: formData.get("graduationYear") as string | number,
    skills: Array.isArray(skillsParsed)
      ? (skillsParsed as string[])
      : [],
    linkedinUrl: String(formData.get("linkedinUrl") ?? ""),
    resumeUrl: String(formData.get("resumeUrl") ?? ""),
    githubUsername: String(formData.get("githubUsername") ?? ""),
  });
}
