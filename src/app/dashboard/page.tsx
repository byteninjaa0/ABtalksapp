import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard-hub/dashboard-shell";
import { HeroGreeting } from "@/components/dashboard-hub/hero-greeting";
import { DaySkySection } from "@/components/dashboard-hub/day-sky";
import { CareerGuidance } from "@/components/dashboard-hub/career-guidance";
import { getCareerGuidance } from "@/features/career-guidance/get-career-guidance";
import { FaqSection } from "@/components/dashboard-hub/faq-section";
import {
  StageSwitcher,
  type StageKey,
  type StageSummary,
} from "@/components/dashboard-hub/stages/stage-switcher";
import { BuildSkillsPanel } from "@/components/dashboard-hub/stages/build-skills-panel";
import {
  TestSkillsPanel,
  testMilestones,
} from "@/components/dashboard-hub/stages/test-skills-panel";
import { GetHiredPanel } from "@/components/dashboard-hub/stages/get-hired-panel";
import { getStageData, type SixtyDay } from "@/features/dashboard/get-stage-data";
import "@/components/dashboard-hub/stages/stages.css";
import type { HubData } from "@/features/dashboard/get-hub-data";
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
  const loaded = await getHubData(session.user.id);
  if (!loaded.hasUser) {
    redirect("/api/auth/signout?callbackUrl=/login");
  }

  // Dev only: DASHBOARD_PREVIEW_ENROLLED=1 shows the enrolled layout with
  // sample progress when you have no track. Read-only; ignored in production.
  const previewEnrolled =
    process.env.NODE_ENV !== "production" &&
    process.env.DASHBOARD_PREVIEW_ENROLLED === "1" &&
    loaded.enrollments.length === 0;
  const data = previewEnrolled ? withPreviewEnrollment(loaded) : loaded;

  const [guidance, loadedStage] = await Promise.all([
    getCareerGuidance(session.user.id, []),
    getStageData(session.user.id, data.enrollments, data.heatmap.cells),
  ]);
  const stageData = previewEnrolled
    ? { ...loadedStage, sixty: PREVIEW_SIXTY }
    : loadedStage;

  const firstName =
    data.profile?.fullName.split(/\s+/)[0] ??
    session.user.name?.split(/\s+/)[0] ??
    null;
  const firstActive = data.enrollments.find((e) => e.status === "ACTIVE");
  const trackHref = firstActive
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
  // DASHBOARD_SKY_TIME=cycle plays the whole day on a 15s loop.
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
  const todayKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");

  // Three stages. Each shows a %, and the first unfinished one is "current".
  const primary = firstActive ?? data.enrollments[0] ?? null;
  const buildDays = primary
    ? primary.status === "COMPLETED" ? 60 : Math.min(60, primary.daysCompleted)
    : 0;
  const milestonesDone = testMilestones(stageData, Boolean(firstActive), trackHref)
    .filter((m) => m.done).length;
  const stages: StageSummary[] = [
    { key: "build", anchor: "build-skills", number: "01", kicker: null, first: "Build", accent: "skills", pct: Math.round((buildDays / 60) * 100), meta: `${buildDays} of 60 days` },
    { key: "test", anchor: "test-skills", number: "02", kicker: "then", first: "Test", accent: "skills", pct: Math.round((milestonesDone / 3) * 100), meta: `${milestonesDone} of 3 milestones` },
    { key: "hired", anchor: "get-hired", number: "03", kicker: "finally", first: "Get", accent: "hired", pct: stageData.profile.score, meta: "profile strength" },
  ];
  const currentStage: StageKey =
    stages.find((s) => s.pct < 100)?.key ?? "hired";

  return (
    <DashboardShell user={shellUser} isAdmin={isAdmin} collapsible>
      <DaySkySection
        initialMinute={istMinute}
        frozen={skyOverride !== null}
        demo={skyDemo}
        className="dash-main pb-4 pt-8"
      >
        <div className="mx-auto w-full max-w-[1360px]">
          <HeroGreeting
            firstName={firstName}
            istHour={istHour}
            synergyPoints={stageData.synergyPoints}
          />

          {notice ? (
            <div
              role="status"
              className={`mt-5 rounded-2xl border border-[#E6E9E9] bg-white px-5 py-4 text-sm text-[#4B4B4B] ${HUB_CARD_HOVER_CLASS}`}
            >
              {notice}
            </div>
          ) : null}

          <div className="mt-12">
            <StageSwitcher
              stages={stages}
              current={currentStage}
              panels={{
                build: (
                  <BuildSkillsPanel
                    sixty={stageData.sixty}
                    trackHref={trackHref}
                    enrollments={data.enrollments}
                    joinedDomains={data.joinedDomains}
                    abandonedDomains={data.abandonedDomains}
                    streak={data.streak}
                    heatmap={data.heatmap}
                    todayKey={todayKey}
                    hasProgramMembership={data.hasProgramMembership}
                    showDatabricks={data.hasDatabricksAccess}
                    showDsArchitect={data.hasDsArchitectAccess}
                    showPowerBi={data.hasPowerBiAccess}
                    showSnowflake={data.hasSnowflakeAccess}
                    showDatabricksAi={data.hasDatabricksAiAccess}
                  />
                ),
                test: (
                  <TestSkillsPanel
                    data={stageData}
                    hasActiveTrack={Boolean(firstActive)}
                    trackHref={trackHref}
                  />
                ),
                hired: (
                  <GetHiredPanel
                    profile={stageData.profile}
                    guidance={
                      <CareerGuidance
                        userId={session.user.id}
                        istDay={guidance.istDay}
                        istWeek={guidance.istWeek}
                        items={guidance.items}
                        targeting={guidance.targeting}
                      />
                    }
                  />
                ),
              }}
            />
          </div>

          <FaqSection />
        </div>
      </DaySkySection>
    </DashboardShell>
  );
}

/* ─── Dev preview: pretend to be enrolled (DASHBOARD_PREVIEW_ENROLLED=1) ── */

const PREVIEW_LEVELS = [5, 3, 1, 4, 1, 3, 1, 3, 3, 5, 4, 3, 3] as const;

const PREVIEW_SIXTY: SixtyDay[] = Array.from({ length: 60 }, (_, i): SixtyDay =>
  i < 13
    ? { day: i + 1, status: "active", level: PREVIEW_LEVELS[i] }
    : i === 13
      ? { day: 14, status: "missed" }
      : { day: i + 1, status: "future" },
);

function withPreviewEnrollment(data: HubData): HubData {
  return {
    ...data,
    enrollments: [
      {
        id: "preview",
        domain: "SE",
        status: "ACTIVE",
        challengeTitle: "Software Engineering",
        daysCompleted: 13,
        currentStreak: 0,
        startedAt: new Date(),
      },
    ],
    joinedDomains: ["SE"],
    // A normal day mid-streak: day 12 done today; 10 (orange) was earlier this
    // week and 14 (sky blue) lands on Sunday.
    streak: {
      ...data.streak,
      state: "active",
      todayCompleted: true,
      currentStreak: 12,
      longestStreak: 12,
      totalActiveDays: 13,
      nextMilestone: 14,
      daysToMilestone: 2,
      week: previewWeek(data.streak.week),
    },
    heatmap: { ...data.heatmap, totalSubmissionsInWindow: 18 },
  };
}

/** Every day of this week up to and including today marked done. */
function previewWeek(week: HubData["streak"]["week"]): HubData["streak"]["week"] {
  const today = week.findIndex((t) => t.isToday);
  return week.map((t, i) => (today >= 0 && i <= today ? { ...t, status: "complete" } : t));
}
