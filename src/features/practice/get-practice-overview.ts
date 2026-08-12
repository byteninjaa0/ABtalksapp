import { prisma } from "@/lib/db";

export type PracticeProblemSummary = {
  id: string;
  slug: string;
  title: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  maxScore: number;
  sortOrder: number;
  solved: boolean;
  attempted: boolean;
  score: number;
};

export type PracticeTopicSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  earnedScore: number;
  maxScore: number;
  problems: PracticeProblemSummary[];
};

export type PracticeTrackSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  topics: PracticeTopicSummary[];
};

export type PracticeOverview = {
  tracks: PracticeTrackSummary[];
  practiceScore: number;
  practiceMaxScore: number;
};

export async function getPracticeOverview(
  userId: string,
): Promise<PracticeOverview> {
  const [tracks, solves, attempts] = await Promise.all([
    prisma.practiceTrack.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        sortOrder: true,
        topics: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            sortOrder: true,
            problems: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                slug: true,
                title: true,
                difficulty: true,
                maxScore: true,
                sortOrder: true,
              },
            },
          },
        },
      },
    }),
    prisma.practiceSolve.findMany({
      where: { userId },
      select: { problemId: true, score: true },
    }),
    prisma.practiceAttempt.findMany({
      where: { userId },
      select: { problemId: true },
      distinct: ["problemId"],
    }),
  ]);

  const solveByProblem = new Map(
    solves.map((s) => [s.problemId, s.score] as const),
  );
  const attemptedProblems = new Set(attempts.map((a) => a.problemId));

  let practiceScore = 0;
  let practiceMaxScore = 0;

  const resultTracks: PracticeTrackSummary[] = tracks.map((track) => ({
    id: track.id,
    slug: track.slug,
    title: track.title,
    description: track.description,
    sortOrder: track.sortOrder,
    topics: track.topics.map((topic) => {
      let earnedScore = 0;
      let maxScore = 0;
      const problems: PracticeProblemSummary[] = topic.problems.map((p) => {
        const score = solveByProblem.get(p.id) ?? 0;
        const solved = solveByProblem.has(p.id);
        earnedScore += score;
        maxScore += p.maxScore;
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          maxScore: p.maxScore,
          sortOrder: p.sortOrder,
          solved,
          attempted: attemptedProblems.has(p.id),
          score,
        };
      });
      practiceScore += earnedScore;
      practiceMaxScore += maxScore;
      return {
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        description: topic.description,
        sortOrder: topic.sortOrder,
        earnedScore,
        maxScore,
        problems,
      };
    }),
  }));

  return {
    tracks: resultTracks,
    practiceScore,
    practiceMaxScore,
  };
}
