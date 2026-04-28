import { prisma } from "@/lib/db";
import { updateProfileSchema } from "@/lib/validations/profile";

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; message: string };

export async function updateProfile(
  userId: string,
  input: {
    fullName: string;
    college: string;
    graduationYear: unknown;
    skills: unknown;
    linkedinUrl?: string;
    resumeUrl?: string;
    githubUsername?: string;
  },
): Promise<UpdateProfileResult> {
  const skillsArr = Array.isArray(input.skills)
    ? input.skills.filter((x): x is string => typeof x === "string")
    : [];

  const parsed = updateProfileSchema.safeParse({
    fullName: input.fullName,
    college: input.college,
    graduationYear: input.graduationYear,
    skills: skillsArr,
    linkedinUrl: input.linkedinUrl ?? "",
    resumeUrl: input.resumeUrl ?? "",
    githubUsername: input.githubUsername ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const data = parsed.data;

  const existing = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    return { ok: false, message: "Profile not found" };
  }

  await prisma.studentProfile.update({
    where: { userId },
    data: {
      fullName: data.fullName,
      college: data.college,
      graduationYear: data.graduationYear,
      skills: data.skills,
      linkedinUrl: data.linkedinUrl ?? null,
      resumeUrl: data.resumeUrl === "" ? null : data.resumeUrl,
      githubUsername: data.githubUsername ?? null,
    },
  });

  return { ok: true };
}
