import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Domain } from "@prisma/client";
import { auth } from "@/auth";
import { AppHeader } from "@/components/shared/app-header";
import { DashboardTabs } from "@/components/practice/dashboard-tabs";
import { PracticeProblemWorkspace } from "@/components/practice/practice-problem-workspace";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPracticeProblem } from "@/features/practice/get-practice-problem";
import { getUserActiveEnrollments } from "@/features/enrollment/get-user-enrollments";
import { getUserWithProfile } from "@/features/user/get-user-with-profile";
import { isUserRegistered } from "@/features/hackathon/registration-status";
import { cn } from "@/lib/utils";

export default async function PracticeProblemPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { slug } = await params;

  const [user, allEnrollments, isHackathonRegistered, problem] =
    await Promise.all([
      getUserWithProfile(session.user.id),
      getUserActiveEnrollments(session.user.id),
      isUserRegistered(session.user.id),
      getPracticeProblem(slug, session.user.id),
    ]);

  if (!user?.studentProfile) {
    redirect("/register");
  }

  if (!problem) {
    notFound();
  }

  const headerUser = {
    name: user.studentProfile.fullName || user.name,
    email: user.email,
    image: null as string | null,
    role: user.role,
    isAdmin: user.role === "ADMIN",
  };

  const activeEnrollment = allEnrollments[0] ?? null;

  return (
    <div className="relative flex min-h-svh flex-col bg-muted/30">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[360px] bg-gradient-to-b from-primary/20 via-violet-500/10 to-transparent sm:h-[440px]"
      />
      <AppHeader
        user={headerUser}
        userEnrollments={allEnrollments}
        activeEnrollmentId={activeEnrollment?.id}
        isHackathonRegistered={isHackathonRegistered}
        headerDomain={activeEnrollment?.domain}
        domain={user.studentProfile.domain as Domain}
      />
      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6">
        <DashboardTabs enrollmentId={activeEnrollment?.id ?? null} />
        <div>
          <Link
            href="/dashboard/practice"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2")}
          >
            ← All practice
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {problem.title}
          </h1>
          {problem.solve ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Solved {problem.solve.solvedAtLabel} · {problem.solve.score} pts
            </p>
          ) : problem.latestAttempt ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Last attempt {problem.latestAttempt.createdAtLabel}:{" "}
              {problem.latestAttempt.status} (
              {problem.latestAttempt.testsPassed}/
              {problem.latestAttempt.testsTotal})
            </p>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Problem</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {problem.statement}
                </ReactMarkdown>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Input format</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {problem.inputFormat}
                </ReactMarkdown>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Output format</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {problem.outputFormat}
                </ReactMarkdown>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Constraints</CardTitle>
              </CardHeader>
              <CardContent className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {problem.constraintsMd}
                </ReactMarkdown>
              </CardContent>
            </Card>
            {problem.testCases.some((c) => c.isSample) ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sample cases</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {problem.testCases
                    .filter((c) => c.isSample)
                    .map((c) => (
                      <div key={c.ordinal} className="space-y-1">
                        <p className="font-medium">Sample {c.ordinal}</p>
                        <pre className="overflow-auto rounded bg-muted p-2 text-xs">
                          {`Input:\n${c.input || "(empty)"}\n\nExpected:\n${c.expected}`}
                        </pre>
                        {c.explanation ? (
                          <p className="text-muted-foreground">{c.explanation}</p>
                        ) : null}
                      </div>
                    ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <PracticeProblemWorkspace
            problemId={problem.id}
            slug={problem.slug}
            title={problem.title}
            starterCode={problem.starterCode}
            maxScore={problem.maxScore}
            difficulty={problem.difficulty}
            testCases={problem.testCases}
          />
        </div>
      </main>
    </div>
  );
}
