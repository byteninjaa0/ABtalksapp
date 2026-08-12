import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PracticeTrackSummary } from "@/features/practice/get-practice-overview";

type Props = {
  tracks: PracticeTrackSummary[];
};

function difficultyLabel(d: string): string {
  if (d === "MEDIUM") return "Medium";
  if (d === "HARD") return "Hard";
  return "Easy";
}

export function PracticeTrackList({ tracks }: Props) {
  if (tracks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No practice tracks available yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {tracks.map((track) => (
        <Card key={track.id} className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-display text-xl">{track.title}</CardTitle>
            <CardDescription>{track.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {track.topics.map((topic) => {
              const pct =
                topic.maxScore === 0
                  ? 0
                  : Math.min(
                      100,
                      Math.round((topic.earnedScore / topic.maxScore) * 100),
                    );
              return (
                <div key={topic.id} className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{topic.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {topic.description}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {topic.earnedScore} / {topic.maxScore} pts
                    </p>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-label={`${topic.title} progress`}
                    className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[width]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <ul className="divide-y rounded-lg border">
                    {topic.problems.map((problem) => (
                      <li key={problem.id}>
                        <Link
                          href={`/dashboard/practice/${problem.slug}`}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                        >
                          <span className="font-medium">{problem.title}</span>
                          <span className="flex items-center gap-2">
                            <Badge variant="outline">
                              {difficultyLabel(problem.difficulty)}
                            </Badge>
                            <span className="text-muted-foreground">
                              {problem.maxScore} pts
                            </span>
                            {problem.solved ? (
                              <Badge variant="secondary">Solved</Badge>
                            ) : problem.attempted ? (
                              <Badge variant="outline">Attempted</Badge>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
