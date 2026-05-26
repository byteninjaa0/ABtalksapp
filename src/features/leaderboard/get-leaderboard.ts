import { unstable_cache } from "next/cache";
import { Domain } from "@prisma/client";
import { prisma } from "@/lib/db";

export type LeaderboardRow = {
  rank: number;
  enrollmentId: string;
  userId: string;
  fullName: string;
  college: string;
  domain: Domain;
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

type LeaderboardCacheInput = {
  domain: "AI" | "DS" | "SE" | "CLAUDE" | "ALL";
  search: string;
  limit: number;
  claudeLeaderboardEnabled: boolean;
};

type CachedLeaderboardRow = Omit<LeaderboardRow, "isViewer">;

async function fetchLeaderboardRows(
  input: LeaderboardCacheInput,
): Promise<{ rows: CachedLeaderboardRow[]; totalCount: number }> {
  const { domain, search, limit, claudeLeaderboardEnabled } = input;
  const hideClaudeFromAll = !claudeLeaderboardEnabled && domain === "ALL";

  const where = {
    status: { not: "ABANDONED" as const },
    ...(hideClaudeFromAll ? { domain: { not: Domain.CLAUDE } } : {}),
    ...(domain !== "ALL" ? { domain } : {}),
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
        id: true,
        userId: true,
        domain: true,
        daysCompleted: true,
        currentStreak: true,
        longestStreak: true,
        user: {
          select: {
            studentProfile: {
              select: {
                fullName: true,
                college: true,
                isReadyForInterview: true,
              },
            },
          },
        },
      },
    }),
    prisma.enrollment.count({ where }),
  ]);

  const rows: CachedLeaderboardRow[] = enrollments
    .filter((e) => !!e.user.studentProfile)
    .map((e, index) => ({
      rank: index + 1,
      enrollmentId: e.id,
      userId: e.userId,
      fullName: e.user.studentProfile?.fullName ?? "Unknown",
      college: e.user.studentProfile?.college || "Unknown",
      domain: e.domain,
      daysCompleted: e.daysCompleted,
      currentStreak: e.currentStreak,
      longestStreak: e.longestStreak,
      isReadyForInterview:
        e.user.studentProfile?.isReadyForInterview ?? false,
    }));

  return { rows, totalCount };
}

const getLeaderboardCached = unstable_cache(
  async (
    domain: LeaderboardCacheInput["domain"],
    search: string,
    limit: number,
    claudeLeaderboardEnabled: boolean,
  ) =>
    fetchLeaderboardRows({
      domain,
      search,
      limit,
      claudeLeaderboardEnabled,
    }),
  ["leaderboard"],
  {
    revalidate: 60,
    tags: ["leaderboard"],
  },
);

export async function getLeaderboard(
  input: {
    domain?: "AI" | "DS" | "SE" | "CLAUDE" | "ALL";
    search?: string;
    limit?: number;
    viewerUserId?: string;
    claudeLeaderboardEnabled?: boolean;
  },
): Promise<LeaderboardResult> {
  const domain = input.domain ?? "ALL";
  const search = input.search?.trim() ?? "";
  const limit = Math.max(1, Math.min(input.limit ?? 100, 200));
  const claudeLeaderboardEnabled = input.claudeLeaderboardEnabled ?? true;

  const { rows, totalCount } = await getLeaderboardCached(
    domain,
    search,
    limit,
    claudeLeaderboardEnabled,
  );

  return {
    totalCount,
    rows: rows.map((row) => ({
      ...row,
      isViewer: row.userId === input.viewerUserId,
    })),
  };
}
