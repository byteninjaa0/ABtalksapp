import { prisma } from "@/lib/db";

export async function getColleges(): Promise<string[]> {
  const profiles = await prisma.studentProfile.findMany({
    select: { college: true },
    distinct: ["college"],
    orderBy: { college: "asc" },
  });

  return profiles
    .map((p) => p.college.trim())
    .filter(Boolean);
}
