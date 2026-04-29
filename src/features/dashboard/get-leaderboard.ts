import { prisma } from "@/lib/db";

export type LeaderboardRow = {
  rank: number;
  userId: string;
  fullName: string;
  college: string;
  domain: "AI" | "DS" | "SE";
  daysCompleted: number;
  currentStreak: number;
  longestStreak: number;
  isReadyForInterview: boolean;
  isViewer: boolean;
};

export type LeaderboardResult = {
  rows: LeaderboardRow[];
  totalCount: number;
};

export async function getLeaderboard(
  input: {
    domain?: "AI" | "DS" | "SE" | "ALL";
    college?: string;
    search?: string;
    limit?: number;
    viewerUserId?: string;
  },
): Promise<LeaderboardResult> {
  const domain = input.domain ?? "ALL";
  const college = input.college?.trim() ?? "";
  const search = input.search?.trim() ?? "";
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200));

  const where = {
    status: { not: "ABANDONED" as const },
    ...(domain !== "ALL" ? { domain } : {}),
    ...(college
      ? {
          user: {
            studentProfile: {
              college: { contains: college, mode: "insensitive" as const },
            },
          },
        }
      : {}),
    ...(search
      ? {
          user: {
            studentProfile: {
              fullName: { contains: search, mode: "insensitive" as const },
            },
          },
        }
      : {}),
  };

  const [enrollments, totalCount] = await Promise.all([
    prisma.enrollment.findMany({
      where,
      orderBy: [
        { daysCompleted: "desc" },
        { currentStreak: "desc" },
        { longestStreak: "desc" },
        { startedAt: "asc" },
      ],
      take: limit,
      select: {
        userId: true,
        daysCompleted: true,
        currentStreak: true,
        longestStreak: true,
        user: {
          select: {
            studentProfile: {
              select: {
                fullName: true,
                college: true,
                domain: true,
                isReadyForInterview: true,
              },
            },
          },
        },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  const rows: LeaderboardRow[] = enrollments
    .filter((e) => !!e.user.studentProfile)
    .map((e, index) => ({
      rank: index + 1,
      userId: e.userId,
      fullName: e.user.studentProfile?.fullName ?? "Unknown",
      college: e.user.studentProfile?.college ?? "Unknown",
      domain: (e.user.studentProfile?.domain ?? "SE") as "AI" | "DS" | "SE",
      daysCompleted: e.daysCompleted,
      currentStreak: e.currentStreak,
      longestStreak: e.longestStreak,
      isReadyForInterview: e.user.studentProfile?.isReadyForInterview ?? false,
      isViewer: e.userId === input.viewerUserId,
    }));

  return { rows, totalCount };
}
