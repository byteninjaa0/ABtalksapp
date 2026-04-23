import Link from "next/link";
import { redirect } from "next/navigation";
import type { Domain } from "@prisma/client";
import { CheckCircle2, Flame, Gift } from "lucide-react";
import { auth } from "@/auth";
import { AppHeader } from "@/components/shared/app-header";
import { SubmissionHeatmap } from "@/components/dashboard/submission-heatmap";
import { getDashboardData } from "@/features/dashboard/get-dashboard-data";
import { getHeatmapData } from "@/features/dashboard/get-heatmap-data";
import { getLeaderboard } from "@/features/dashboard/get-leaderboard";
import { getAvailableQuiz } from "@/features/quiz/get-available-quiz";
import { getQuizAttemptHistory } from "@/features/quiz/get-quiz-attempt-history";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Progress,
  ProgressIndicator,
  ProgressTrack,
} from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatDateIST } from "@/lib/date-utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const data = await getDashboardData(session.user.id);

  const headerUser = {
    name:
      data.hasEnrollment === true
        ? data.profile.fullName
        : (session.user.name ?? null),
    email: session.user.email ?? "",
    image: session.user.image ?? null,
    role: session.user.role ?? "STUDENT",
  };

  if (!data.hasEnrollment) {
    redirect("/register");
  }

  const [heatmapData, leaderboard, quizAvailability, quizHistory] =
    await Promise.all([
      getHeatmapData(data.enrollment.id),
      getLeaderboard(data.profile.domain as Domain, session.user.id),
      getAvailableQuiz(session.user.id, data.enrollment.id),
      getQuizAttemptHistory(session.user.id, data.enrollment.id),
    ]);

  const { enrollment, profile, todayTask, isTodayCompleted } = data;
  const progressPct = Math.min(
    100,
    Math.round((enrollment.currentDay / enrollment.totalDays) * 100),
  );
  const isChallengeComplete =
    enrollment.status === "COMPLETED" ||
    enrollment.daysCompleted >= enrollment.totalDays;

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <AppHeader user={headerUser} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Day {enrollment.currentDay} of {enrollment.totalDays}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={progressPct}>
                <ProgressTrack>
                  <ProgressIndicator />
                </ProgressTrack>
              </Progress>
              <p className="text-xs text-muted-foreground">
                Calendar progress (IST) from your start date
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Current streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Flame className="size-6 text-orange-500" aria-hidden />
                <span className="text-3xl font-semibold tabular-nums">
                  {enrollment.currentStreak}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Longest: {enrollment.longestStreak}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Days completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">
                {enrollment.daysCompleted}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Referrals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Gift className="size-5 text-muted-foreground" aria-hidden />
                <span className="text-3xl font-semibold tabular-nums">
                  {data.referralCount}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                Your code: {profile.referralCode}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Today&apos;s task</CardTitle>
                <CardDescription>
                  {profile.domain} challenge · IST day {enrollment.currentDay}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isChallengeComplete ? (
                  <div className="rounded-lg border border-dashed bg-muted/40 p-4 text-center">
                    <p className="text-base font-medium">
                      🎉 Challenge complete — you&apos;re ready for interview!
                    </p>
                    {profile.isReadyForInterview ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Your profile is marked ready for interview opportunities.
                      </p>
                    ) : null}
                  </div>
                ) : isTodayCompleted ? (
                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4 text-muted-foreground">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-500">
                      <CheckCircle2 className="size-5 shrink-0" aria-hidden />
                      <span className="font-medium">Completed</span>
                    </div>
                    <p className="text-sm">
                      You&apos;ve submitted for today (IST). Next task unlocks
                      on the next calendar day.
                    </p>
                  </div>
                ) : todayTask ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Day {todayTask.dayNumber}</Badge>
                      <Badge variant="outline">{todayTask.difficulty}</Badge>
                      <span className="text-sm text-muted-foreground">
                        ~{todayTask.estimatedMinutes} min
                      </span>
                    </div>
                    <h3 className="text-base font-semibold">{todayTask.title}</h3>
                    <Link
                      href="/challenge/today"
                      className={cn(
                        buttonVariants({ variant: "default" }),
                        "inline-flex w-full justify-center sm:w-auto",
                      )}
                    >
                      Start today&apos;s challenge
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No task found for this day. If this looks wrong, contact
                    support.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-base">
                  Leaderboard — top 10 ({profile.domain})
                </CardTitle>
                <CardDescription>
                  Sorted by progress in your domain (active enrollments only)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground">
                  <span>#</span>
                  <span>Name</span>
                  <span className="text-right">Days</span>
                  <span className="text-right">Streak</span>
                </div>
                <ul className="mt-2 divide-y rounded-md border">
                  {leaderboard.topTen.map((row) => (
                    <li
                      key={row.userId}
                      className={cn(
                        "grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-2 text-sm",
                        row.isCurrentUser && "bg-muted/80",
                      )}
                    >
                      <span className="tabular-nums text-muted-foreground">
                        {row.rank}
                      </span>
                      <span className="truncate font-medium">
                        {row.fullName}
                        {row.isCurrentUser ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (you)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right tabular-nums">
                        {row.daysCompleted}
                      </span>
                      <span className="text-right tabular-nums">
                        {row.currentStreak}
                      </span>
                    </li>
                  ))}
                </ul>
                {leaderboard.userRank ? (
                  <>
                    <div className="my-3 border-t" />
                    <div className="rounded-md bg-muted/50 px-2 py-2 text-sm">
                      <span className="font-medium">Your rank: </span>#
                      {leaderboard.userRank.rank}
                      <span className="ml-2 text-muted-foreground">
                        · {leaderboard.userRank.daysCompleted} days ·{" "}
                        {leaderboard.userRank.currentStreak} streak
                      </span>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        {quizAvailability.reason === "ready" && quizAvailability.quiz ? (
          <Card>
            <CardHeader>
              <CardTitle>
                Week {quizAvailability.quiz.weekNumber} quiz available!
              </CardTitle>
              <CardDescription>
                {quizAvailability.quiz.title} · {quizAvailability.quiz.domain}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/quiz/${quizAvailability.quiz.id}`}
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "inline-flex",
                )}
              >
                Take quiz
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {quizAvailability.reason === "already_attempted" &&
        quizAvailability.attempt?.quiz ? (
          <Card className="border-muted-foreground/20 bg-muted/40">
            <CardHeader>
              <CardTitle className="text-base text-muted-foreground">
                Week {quizAvailability.attempt.quiz.weekNumber} quiz — scored{" "}
                {quizAvailability.attempt.score}/10
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {quizAvailability.attempt.quiz.title}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href={`/quiz/${quizAvailability.attempt.quiz.id}`}
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "inline-flex text-muted-foreground",
                )}
              >
                View results
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {quizHistory.length > 0 ? (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Your quiz history</CardTitle>
              <CardDescription>
                Past attempts — open to review results (current week&apos;s quiz is
                above when applicable).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {quizHistory.map((row) => (
                  <li
                    key={row.attemptId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      Week {row.weekNumber} — scored {row.score}/10
                      <span className="ml-1 text-xs">· {row.title}</span>
                    </span>
                    <Link
                      href={`/quiz/${row.quizId}`}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "shrink-0",
                      )}
                    >
                      View results
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Your 60-Day Journey</CardTitle>
            <CardDescription>
              One cell per challenge day (IST). Hover a square for details.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <SubmissionHeatmap data={heatmapData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Last 7 submissions</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentSubmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No submissions yet. Complete Day 1 to get started.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentSubmissions.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">Day {s.dayNumber}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · completed on {formatDateIST(s.submittedAt)} ·{" "}
                    </span>
                    <span className="text-muted-foreground">
                      {s.status === "ON_TIME" ? "on time" : "late"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
