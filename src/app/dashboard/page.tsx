import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-hub/dashboard-shell";
import { HeroGreeting } from "@/components/dashboard-hub/hero-greeting";
import { DaySkySection } from "@/components/dashboard-hub/day-sky";
import { StreakCard } from "@/components/dashboard-hub/streak-card";
import { ActivityHeatmap } from "@/components/dashboard-hub/activity-heatmap";
import { ContinueJourney } from "@/components/dashboard-hub/continue-journey";
import { CareerGuidance } from "@/components/dashboard-hub/career-guidance";
import { getCareerGuidance } from "@/features/career-guidance/get-career-guidance";
import { OtherChallenges } from "@/components/dashboard-hub/other-challenges";
import { Roadmaps } from "@/components/dashboard-hub/roadmaps";
import { EventsSection } from "@/components/dashboard-hub/events-section";
import { FaqSection } from "@/components/dashboard-hub/faq-section";
import { HUB_CARD_HOVER_CLASS } from "@/components/dashboard-hub/nav-items";
import { getHubData } from "@/features/dashboard/get-hub-data";
import { registrationRedirect } from "@/features/registration/registration-gate";
import type { Domain } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { IST } from "@/lib/date-utils";

const TRACK_PATH: Record<Domain, string> = {
  AI: "/ai",
  DS: "/ds",
  SE: "/se",
  CLAUDE: "/claude",
};

const JOIN_ERROR_MESSAGE: Record<string, string> = {
  no_user: "Your session expired. Please sign in again.",
  no_challenge: "That track isn't open yet. Please try again later.",
  internal_error: "We couldn't add that track. Please try again.",
};

type PageProps = {
  searchParams: Promise<{ joinError?: string; joinBlocked?: string }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Signed in is not registered: OAuth creates the User row before any form is
  // reached, and Google's callback lands here directly. Before the hub is even
  // queried, a candidate with no StudentProfile goes and makes one.
  const needsRegistration = await registrationRedirect(
    session.user.id,
    "/dashboard",
  );
  if (needsRegistration) redirect(needsRegistration);

  const params = await searchParams;
  const data = await getHubData(session.user.id);
  if (!data.hasUser) {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  const guidance = await getCareerGuidance(session.user.id, []);

  const firstName =
    data.profile?.fullName.split(/\s+/)[0] ??
    session.user.name?.split(/\s+/)[0] ??
    null;
  const firstActive = data.enrollments.find((e) => e.status === "ACTIVE");
  const restartHref = firstActive
    ? TRACK_PATH[firstActive.domain]
    : "/challenges";
  const blockedDomain = params.joinBlocked?.trim().toUpperCase();
  const joinError = params.joinError?.trim();
  const notice =
    blockedDomain && ["AI", "DS", "SE", "CLAUDE"].includes(blockedDomain)
      ? `You were removed from the ${blockedDomain} track and can't re-join it.`
      : joinError
        ? JOIN_ERROR_MESSAGE[joinError] ?? null
        : null;

  const shellUser = {
    name: data.profile?.fullName ?? session.user.name ?? "",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
  };
  const isAdmin = session.user.isAdmin ?? false;
  // IST minute-of-day seeds the greeting sky so the first paint is correct.
  // Dev only: DASHBOARD_SKY_TIME="HH:mm" freezes the sky + greeting at that time;
  // DASHBOARD_SKY_TIME=cycle plays the whole day on a 10s loop.
  const skyDemo =
    process.env.NODE_ENV !== "production" &&
    process.env.DASHBOARD_SKY_TIME === "cycle";
  const skyOverride =
    process.env.NODE_ENV !== "production"
      ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(process.env.DASHBOARD_SKY_TIME ?? "")
      : null;
  const [istHour, istMin] = skyOverride
    ? [Number(skyOverride[1]), Number(skyOverride[2])]
    : formatInTimeZone(new Date(), IST, "H:m").split(":").map(Number);
  const istMinute = istHour * 60 + istMin;

  return (
    <DashboardShell user={shellUser} isAdmin={isAdmin} collapsible>
      <DaySkySection
        initialMinute={istMinute}
        frozen={skyOverride !== null}
        demo={skyDemo}
        className="px-4 py-8 sm:px-6"
      >
        <div className="w-full max-w-[1020px] lg:ml-5 2xl:mx-auto 2xl:max-w-[1600px]">
          <HeroGreeting firstName={firstName} istHour={istHour} />
          <div className="mt-4 grid min-w-0 gap-6 lg:grid-cols-[1fr_320px] lg:items-center lg:gap-8 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
            <div className="min-w-0 lg:pr-6">
              <ActivityHeatmap
                cells={data.heatmap.cells}
                totalSubmissions={data.heatmap.totalSubmissionsInWindow}
                embedded
              />
            </div>
            <div className="mt-2 lg:mt-0 lg:pl-5">
              <StreakCard streak={data.streak} restartHref={restartHref} />
            </div>
          </div>
        </div>
      </DaySkySection>

      {notice ? (
        <section className="px-4 py-2 sm:px-6 lg:ml-4">
          <div
            className={`rounded-2xl border border-[#E0E0E0] bg-white px-5 py-4 text-sm text-[#4B4B4B] ${HUB_CARD_HOVER_CLASS}`}
          >
            {notice}
          </div>
        </section>
      ) : null}

      <ContinueJourney enrollments={data.enrollments} />
      <CareerGuidance
        userId={session.user.id}
        istDay={guidance.istDay}
        istWeek={guidance.istWeek}
        items={guidance.items}
        targeting={guidance.targeting}
      />
      <OtherChallenges
        joinedDomains={data.joinedDomains}
        abandonedDomains={data.abandonedDomains}
      />
      <Roadmaps
        joinedDomains={data.joinedDomains}
        abandonedDomains={data.abandonedDomains}
        hasProgramMembership={data.hasProgramMembership}
        showDatabricks={data.hasDatabricksAccess}
        showDsArchitect={data.hasDsArchitectAccess}
        showPowerBi={data.hasPowerBiAccess}
        showSnowflake={data.hasSnowflakeAccess}
        showDatabricksAi={data.hasDatabricksAiAccess}
      />
      <EventsSection />
      
      <FaqSection />
    </DashboardShell>
  );
}
