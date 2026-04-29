import { prisma } from "@/lib/db";

export async function getPublicProfile(userId: string): Promise<{
  fullName: string;
  domain: string;
  college: string;
  graduationYear: number;
  skills: string[];
  joinedAt: Date;
  daysCompleted: number;
  currentStreak: number;
  longestStreak: number;
  isReadyForInterview: boolean;
} | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      studentProfile: {
        select: {
          fullName: true,
          domain: true,
          college: true,
          graduationYear: true,
          skills: true,
          isReadyForInterview: true,
        },
      },
      enrollments: {
        where: { status: { not: "ABANDONED" } },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          daysCompleted: true,
          currentStreak: true,
          longestStreak: true,
        },
      },
    },
  });

  if (!user?.studentProfile) {
    return null;
  }

  const latestEnrollment = user.enrollments[0];

  return {
    fullName: user.studentProfile.fullName,
    domain: user.studentProfile.domain,
    college: user.studentProfile.college,
    graduationYear: user.studentProfile.graduationYear,
    skills: user.studentProfile.skills,
    joinedAt: user.createdAt,
    daysCompleted: latestEnrollment?.daysCompleted ?? 0,
    currentStreak: latestEnrollment?.currentStreak ?? 0,
    longestStreak: latestEnrollment?.longestStreak ?? 0,
    isReadyForInterview: user.studentProfile.isReadyForInterview,
  };
}

export async function getPublicEnrollmentId(userId: string): Promise<string | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, status: { not: "ABANDONED" } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  return enrollment?.id ?? null;
}
