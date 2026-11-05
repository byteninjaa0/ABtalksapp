import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, Trophy } from "lucide-react";
import { auth } from "@/auth";
import { getAchievements } from "@/features/certificate/get-achievements";
import { getEarnedBadges } from "@/features/badges/get-earned-badges";
import { BadgeTrigger } from "@/components/badges/badge-trigger";
import { AchievementCard } from "@/components/certificate/achievement-card";
import { DashboardShell } from "@/components/dashboard-hub/dashboard-shell";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userExists = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });

  if (!userExists) {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  const userId = session.user.id;
  const shellUser = {
    name: session.user.name ?? session.user.email ?? "",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };

  const achievements = await getAchievements(userId);
  // After getAchievements on purpose: it may issue the Claude certificate,
  // which is what the Claude Challenge badge reads.
  const badges = await getEarnedBadges(userId);
  const earnedCount = achievements.filter((a) => a.status !== "REVOKED").length;

  const headersList = await headers();
  const host = headersList.get("host") ?? "app.klymb.ai";
  const protocol = host.includes("localhost") ? "http" : "https";
  const verifyBaseUrl = `${protocol}://${host}`;

  return (
    <DashboardShell
      user={shellUser}
      isAdmin={session.user.isAdmin ?? false}
      showSectionNav={false}
    >
      <main className="mx-auto w-full min-w-0 max-w-[1280px] flex-1 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-heading text-[13px] font-semibold uppercase tracking-[0.08em] text-[#03535F]">
              Achievements
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-black sm:text-[40px] sm:leading-[48px]">
              Your certificates
            </h1>
            
          </div>
          
        </header>

        {achievements.length === 0 ? (
          <section className="mt-8 flex flex-col items-center rounded-3xl border-[1.5px] border-dashed border-[#D5DEDE] bg-white px-6 py-12 text-center">
            <span
              className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-[#C7D6D6] bg-[#EEF5F5] text-[#03535F]"
              aria-hidden
            >
              <Trophy className="size-7" />
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold text-black">
              No certificates yet
            </h2>
            <p className="mt-1 max-w-md text-sm text-[#4B4B4B]">
              Finish a challenge, hackathon or cohort and your certificate will
              show up here.
            </p>
            <Link
              href="/dashboard"
              className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-[#03535F] px-5 text-sm font-semibold text-white shadow-[inset_0_-5px_14px_rgba(0,0,0,0.34)] transition-colors hover:bg-[#076573]"
            >
              Back to dashboard
            </Link>
          </section>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {achievements.map((achievement) => (
              <li key={achievement.key} className="flex min-w-0">
                <AchievementCard
                  achievement={achievement}
                  verifyBaseUrl={verifyBaseUrl}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Earned badges, derived from the same records as the certificates
            above. Quick Links on /profile links here. */}
        <section id="badges" className="mt-12 scroll-mt-24" aria-labelledby="badges-title">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2
                id="badges-title"
                className="font-display text-2xl font-bold tracking-tight text-black"
              >
                Badges
              </h2>
              <p className="mt-1 text-sm text-[#4B4B4B]">
                Earned for finishing challenges and cohorts, and for showing up
                day after day. Select a badge to see how it was earned.
              </p>
            </div>
            {badges.ok && badges.badges.length > 0 ? (
              <p className="flex shrink-0 items-baseline gap-2 text-[15px] text-[#4B4B4B]">
                <span className="font-heading text-4xl font-bold text-black">
                  {badges.badges.length}
                </span>
                {badges.badges.length === 1 ? "badge earned" : "badges earned"}
              </p>
            ) : null}
          </div>

          {!badges.ok ? (
            <p className="mt-6 rounded-2xl border border-[#E0E0E0] bg-white px-5 py-6 text-center text-sm text-[#4B4B4B]">
              Badges couldn&apos;t load right now. Refresh the page to try again.
            </p>
          ) : badges.badges.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-3xl border-[1.5px] border-dashed border-[#D5DEDE] bg-white px-6 py-10 text-center">
              <span
                className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-[#C7D6D6] bg-[#EEF5F5] text-[#03535F]"
                aria-hidden
              >
                <Award className="size-6" />
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold text-black">
                No badges yet
              </h3>
              <p className="mt-1 max-w-md text-sm text-[#4B4B4B]">
                Finish a challenge or cohort, or submit work 30 days in a row,
                to earn your first badge.
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid grid-cols-2 gap-2 rounded-3xl border border-[#E0E0E0] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.05)] sm:grid-cols-3 sm:p-4 lg:grid-cols-5">
              {badges.badges.map((badge) => (
                <li key={badge.key} className="flex min-w-0">
                  <BadgeTrigger badge={badge} variant="tile" size={104} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </DashboardShell>
  );
}
