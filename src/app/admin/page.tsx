import Link from "next/link";
import {
  BarChart3,
  Briefcase,
  Clock,
  Coins,
  Globe2,
  LogIn,
  Mail,
  MousePointerClick,
  Send,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatCard } from "@/components/admin/stat-card";
import { ActivityTimeline } from "@/components/admin/activity-timeline";
import { PlatformActivityKpis } from "@/components/admin/platform-activity-kpis";
import { TrafficAnalyticsLoader } from "@/components/admin/traffic-analytics-loader";
import { getOverviewStats } from "@/features/admin/get-overview-stats";
import { getAdminGaTraffic } from "@/features/admin/get-ga-traffic";
import { learnersTrainedBaseline } from "@/lib/feature-flags";
import {
  formatCompactNumber,
  formatDuration,
  formatRatioAsPercent,
} from "@/lib/analytics/format";
import { cn } from "@/lib/utils";

function greetingIst(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function usdFromMinor(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

/**
 * Plan 154: default GA window for the overview page. Kept at 7 days to match
 * the "Last 7 days" framing of the candidates/recruiters bar chart directly
 * below — one window, one story.
 */
function ga7DayWindow(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: start.toISOString().slice(0, 10), end };
}

export default async function AdminHomePage() {
  const [admin, data, gaTraffic] = await Promise.all([
    requireAdmin(),
    getOverviewStats(),
    getAdminGaTraffic(ga7DayWindow()),
  ]);
  const firstName = (admin.name ?? "there").trim().split(/\s+/)[0];
  const ga = gaTraffic.data.available ? gaTraffic.data : null;
  const trainedBaseline = learnersTrainedBaseline();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`${greetingIst()}, ${firstName}`}
        description="Here's what's happening on Klymb AI today."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={trainedBaseline > 0 ? "Learners Trained" : "Total Candidates"}
          value={data.stats.totalStudents + trainedBaseline}
          delta={data.stats.totalStudentsDelta}
          accent="green"
          icon={<Users className="h-4 w-4" />}
          series={data.stats.totalStudentsSeries}
        />
        <StatCard
          label="Total Recruiters"
          value={data.stats.totalRecruiters}
          delta={data.stats.totalRecruitersDelta}
          accent="blue"
          icon={<UserPlus className="h-4 w-4" />}
          series={data.stats.totalRecruitersSeries}
        />
        <StatCard
          label="Credits Used"
          value={usdFromMinor(data.stats.creditsUsedMinor)}
          delta={Math.round(data.stats.creditsUsedDeltaMinor / 100)}
          deltaSuffix="USD this week"
          accent="orange"
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label="Emails Sent"
          value={data.stats.emailsSent}
          delta={data.stats.emailsSentThisWeek}
          deltaSuffix="this week"
          accent="green"
          icon={<Mail className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-[#E9E9E9] bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[#353535]">
              Platform Activity
            </h2>
            <p className="text-xs text-[#8F8F8F]">
              Live counts · deltas are this week vs last week (IST)
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8F8F8F]">
                  Traffic · from Google Analytics (last 7 days)
                </p>
                <Link
                  href="/admin/analytics"
                  className="text-[11px] font-medium text-[#03535F] hover:underline"
                >
                  Open full analytics →
                </Link>
              </div>
              {ga ? (
                <PlatformActivityKpis
                  tiles={[
                    {
                      label: "Sessions",
                      value: formatCompactNumber(ga.summary.sessions),
                      hint: `${formatCompactNumber(ga.summary.activeUsers)} active users`,
                      icon: <BarChart3 className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "New users",
                      value: formatCompactNumber(ga.summary.newUsers),
                      hint: "First-time visitors",
                      icon: <UserPlus className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Pageviews",
                      value: formatCompactNumber(ga.summary.screenPageViews),
                      hint: `${formatCompactNumber(ga.topPages[0]?.pageviews ?? 0)} on top page`,
                      icon: <MousePointerClick className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Avg. session",
                      value: formatDuration(ga.summary.averageSessionDurationSec),
                      hint: "Time on site",
                      icon: <Clock className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Engagement rate",
                      value: formatRatioAsPercent(ga.summary.engagementRate),
                      hint: "Sessions with real interaction",
                      icon: <Sparkles className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Recruiter sign-ins",
                      value: formatCompactNumber(
                        ga.eventCounts.recruiter_reg_submitted ?? 0,
                      ),
                      hint: "site event · last 7 days",
                      icon: <LogIn className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Top country",
                      value: ga.countries[0]?.country ?? "—",
                      hint: ga.countries[0]
                        ? `${formatCompactNumber(ga.countries[0].users)} users`
                        : undefined,
                      icon: <Globe2 className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                    {
                      label: "Top source",
                      value: ga.sources[0]?.source ?? "—",
                      hint: ga.sources[0]
                        ? `${formatCompactNumber(ga.sources[0].sessions)} sessions`
                        : undefined,
                      icon: <Globe2 className="size-3.5" aria-hidden />,
                      href: "/admin/analytics",
                    },
                  ]}
                />
              ) : (
                <Link
                  href="/admin/analytics"
                  className="block rounded-lg border border-dashed border-[#E9E9E9] bg-[#FAFAFA] p-4 text-center text-xs text-[#787878] hover:border-[#03535F]/40 hover:bg-[#EEF6F6]"
                >
                  Google Analytics is not configured for this environment.
                  Open <span className="underline">/admin/analytics</span> for
                  the full setup details.
                </Link>
              )}
            </div>

            <div className="border-t border-[#E9E9E9] pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#787878]">
                Traffic details
              </p>
              <TrafficAnalyticsLoader data={gaTraffic.data} />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[#E9E9E9] bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[#353535]">
              Recent Platform Events
            </h2>
            <Link href="/admin/actions" className="text-xs font-medium text-[#03535F] hover:underline">
              View all
            </Link>
          </div>
          <ActivityTimeline items={data.recentAdminActions} />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-[#E9E9E9] bg-white p-5 shadow-[var(--shadow-card)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-[#353535]">
              Flagged for Review
              {data.flagged.length > 0 ? (
                <span className="ml-2 rounded-full bg-[#D92D20]/10 px-2 py-0.5 text-xs font-medium text-[#D92D20]">
                  {data.flagged.length}
                </span>
              ) : null}
            </h2>
          </div>
          {data.flagged.length === 0 ? (
            <p className="text-sm text-[#787878]">Nothing flagged right now.</p>
          ) : (
            <ul className="divide-y divide-[#E9E9E9]">
              {data.flagged.map((row) => (
                <li key={row.id} className="py-3">
                  <Link href={row.href} className="block hover:underline">
                    <p className="text-sm font-medium text-[#353535]">{row.title}</p>
                    <p className="text-xs text-[#787878]">
                      {row.detail}
                      {row.when ? ` · ${row.when}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#E9E9E9] bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="mb-3 font-display text-lg font-semibold text-[#353535]">
            Quick Actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                href: "/admin/students",
                label: "View Candidates",
                hint: "Search and inspect profiles",
                icon: Users,
              },
              {
                href: "/admin/recruiters",
                label: "View Recruiters",
                hint: "Accounts and freeze controls",
                icon: UserPlus,
              },
              {
                href: "/admin/credits",
                label: "Credits & Plans",
                hint: "Starting grant and unlock cost",
                icon: Coins,
              },
              {
                href: "/admin/deliveries",
                label: "Failed Email",
                hint: `${data.stats.emailsFailedThisWeek} failed this week`,
                icon: Send,
              },
              {
                href: "/admin/jobs",
                label: "Jobs",
                hint: "Postings and applications",
                icon: Briefcase,
              },
              {
                href: "/admin/notifications",
                label: "Communications",
                hint: "In-app announcements",
                icon: Mail,
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-[#E9E9E9] p-3 hover:border-[#03535F]/40 hover:bg-[#EEF6F6]",
                )}
              >
                <item.icon className="mt-0.5 size-4 text-[#03535F]" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-[#353535]">
                    {item.label}
                  </span>
                  <span className="block text-xs text-[#787878]">{item.hint}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
