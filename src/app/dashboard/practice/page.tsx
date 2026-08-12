import { redirect } from "next/navigation";
import { Domain } from "@prisma/client";
import { auth } from "@/auth";
import { AppHeader } from "@/components/shared/app-header";
import { DashboardTabs } from "@/components/practice/dashboard-tabs";
import { PracticeTrackList } from "@/components/practice/practice-track-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPracticeOverview } from "@/features/practice/get-practice-overview";
import { getUserActiveEnrollments } from "@/features/enrollment/get-user-enrollments";
import { getUserWithProfile } from "@/features/user/get-user-with-profile";
import { isUserRegistered } from "@/features/hackathon/registration-status";

export default async function PracticeDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [user, allEnrollments, isHackathonRegistered, overview] =
    await Promise.all([
      getUserWithProfile(session.user.id),
      getUserActiveEnrollments(session.user.id),
      isUserRegistered(session.user.id),
      getPracticeOverview(session.user.id),
    ]);

  if (!user?.studentProfile) {
    redirect("/register");
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
        <Card className="shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-2xl">Practice</CardTitle>
            <CardDescription>
              Work through Python and problem-solving drills. Trailing whitespace
              is ignored when grading output.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Practice score:{" "}
              <span className="font-semibold">
                {overview.practiceScore} / {overview.practiceMaxScore}
              </span>
            </p>
          </CardContent>
        </Card>
        <PracticeTrackList tracks={overview.tracks} />
      </main>
    </div>
  );
}
