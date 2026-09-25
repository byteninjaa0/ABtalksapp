import Link from "next/link";
import type { Domain } from "@prisma/client";
import { ArrowRight, BarChart3, Code2, Network, Sparkles } from "lucide-react";
import { isClaudeEnabled, isProgramEnabled } from "@/lib/feature-flags";
import { PROGRAM_AI_COHORT_BASE } from "@/features/program/constants";
import type { HubEnrollment } from "@/features/dashboard/get-hub-data";
import type { ActivityStreak } from "@/features/dashboard/compute-activity-streak";
import type { ActivityHeatmap as HeatmapData } from "@/features/dashboard/get-activity-heatmap";
import { upcomingEvents, type WorkshopEvent } from "@/components/workshop/events-data";
import type { SixtyDay } from "@/features/dashboard/get-stage-data";
import { ContinueLearning, ProgressCard } from "./build-progress";
import { JoinClaudeButton } from "@/components/dashboard-hub/join-claude-button";
import { cn } from "@/lib/utils";
import {
  Accent,
  ArrowLink,
  PanelSubhead,
  STAGE_CARD,
  StageHeader,
} from "./stage-ui";

const TRACKS: {
  domain: Domain;
  name: string;
  blurb: string;
  path: string;
  Icon: typeof Code2;
}[] = [
  { domain: "SE", name: "Software Engineering", blurb: "Ship real software, one task a day", path: "/se", Icon: Code2 },
  { domain: "AI", name: "AI", blurb: "Build with models, agents and data", path: "/ai", Icon: Network },
  { domain: "DS", name: "Data Science", blurb: "Raw data into real insight", path: "/ds", Icon: BarChart3 },
  { domain: "CLAUDE", name: "Claude", blurb: "Master Claude AI in 60 days", path: "/claude", Icon: Sparkles },
];

const TRACK_NAME: Record<Domain, string> = {
  SE: "Software Engineering",
  AI: "AI",
  DS: "Data Science",
  CLAUDE: "the Claude Challenge",
};

type Program = { title: string; blurb: string; days: number; href: string; cta: string };

type BuildSkillsPanelProps = {
  sixty: SixtyDay[];
  /** Primary track page (or /challenges) — Continue / Start again target. */
  trackHref: string;
  enrollments: HubEnrollment[];
  joinedDomains: Domain[];
  abandonedDomains: Domain[];
  streak: ActivityStreak;
  heatmap: HeatmapData;
  todayKey: string;
  hasProgramMembership: boolean;
  showDatabricks: boolean;
  showDsArchitect: boolean;
  showPowerBi: boolean;
  showSnowflake: boolean;
  showDatabricksAi: boolean;
};

/** Tracks still open to join: not joined, not removed, Claude only when live. */
function joinableTracks(p: BuildSkillsPanelProps): Domain[] {
  const taken = new Set([...p.joinedDomains, ...p.abandonedDomains]);
  return TRACKS.map((t) => t.domain).filter(
    (d) => !taken.has(d) && (d !== "CLAUDE" || isClaudeEnabled()),
  );
}

export function BuildSkillsPanel(props: BuildSkillsPanelProps) {
  const { enrollments, streak } = props;
  const primary = enrollments.find((e) => e.status === "ACTIVE") ?? enrollments[0] ?? null;

  return (
    <div className="space-y-6">
      <StageHeader
        title="Learn by"
        accent="doing."
        sub="One task a day for 60 days, shared on GitHub and LinkedIn. Every square you fill is proof of work."
        aside={<ArrowLink href="#test-skills">Next: Test skills</ArrowLink>}
      />

      {primary ? (
        <>
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_320px]">
            <ProgressCard
              sixty={props.sixty}
              primary={primary}
              totalSubmissions={props.heatmap.totalSubmissionsInWindow}
              streak={streak}
            />
            <ContinueLearning enrollments={enrollments} joinable={joinableTracks(props)} />
          </div>
        </>
      ) : (
        <NextMove {...props} primary={primary} />
      )}

      <MoreWays {...props} />
    </div>
  );
}

/* ─── Your next move ───────────────────────────────────────── */

function NextMove({
  enrollments,
  joinedDomains,
  abandonedDomains,
  streak,
  primary,
}: BuildSkillsPanelProps & { primary: HubEnrollment | null }) {
  const joined = new Set(joinedDomains);
  const abandoned = new Set(abandonedDomains);
  const byDomain = new Map(enrollments.map((e) => [e.domain, e]));
  const claudeOn = isClaudeEnabled();

  // Joined tracks lead; Claude only shows when the challenge is open (or joined).
  const tracks = TRACKS.filter((t) => t.domain !== "CLAUDE" || claudeOn || joined.has("CLAUDE")).sort(
    (a, b) => Number(joined.has(b.domain)) - Number(joined.has(a.domain)),
  );

  let title: { lead: string; accent: string };
  let sub: string;
  if (primary?.status === "ACTIVE") {
    title = streak.currentStreak > 0
      ? { lead: "Keep your", accent: "streak going." }
      : { lead: "Pick up", accent: "where you left off." };
    sub = `Day ${Math.min(60, primary.daysCompleted + 1)} of 60 in ${TRACK_NAME[primary.domain]} is waiting for you.`;
  } else if (primary) {
    title = { lead: "You finished", accent: "a track." };
    sub = "Start another, or move on to Test skills when you're ready.";
  } else {
    title = { lead: "Start your", accent: "first track." };
    sub = "Pick a 60-day track below. One task a day, and every day counts as proof.";
  }

  return (
    <section id="your-challenge" className={cn(STAGE_CARD, "scroll-mt-24 p-5 sm:p-7")}>
      <h3 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-black">
        {title.lead} <Accent>{title.accent}</Accent>
      </h3>
      <p className="mt-1.5 text-sm text-[#4B4B4B]">{sub}</p>

      <ul id="domains" className="mt-6 grid scroll-mt-24 grid-cols-2 gap-3 xl:grid-cols-4">
        {tracks.map(({ domain, name, blurb, path, Icon }) => {
          const e = byDomain.get(domain);
          if (e) {
            const done = e.status === "COMPLETED";
            const pct = done ? 100 : Math.min(100, Math.round((e.daysCompleted / 60) * 100));
            return (
              <li
                key={domain}
                className="flex min-h-[150px] flex-col rounded-2xl bg-[linear-gradient(160deg,#3F7579_0%,#2D5F63_100%)] p-4 text-white shadow-[0_10px_24px_-14px_rgba(3,83,95,0.8)]"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-white/15" aria-hidden="true">
                  <Icon className="size-[18px]" />
                </span>
                <p className="mt-auto pt-4 font-heading text-lg font-bold leading-tight">{name}</p>
                <p className="mt-0.5 text-[11px] text-white/80">
                  {done ? "Completed · 60 of 60" : `Day ${Math.min(60, e.daysCompleted + 1)} of 60`}
                </p>
                <span className="mt-2 h-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[#2BD4A0]" style={{ width: `${pct}%` }} />
                </span>
                <Link href={path} className="mt-3 inline-flex items-center gap-1 text-xs font-bold hover:underline">
                  {done ? "View" : "Continue"} <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </li>
            );
          }
          const isAbandoned = abandoned.has(domain);
          return (
            <li
              key={domain}
              className="flex min-h-[150px] flex-col rounded-2xl border border-[#E6E9E9] bg-white p-4 transition-shadow hover:shadow-[0_10px_24px_-16px_rgba(0,0,0,0.25)]"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-[#E7F2F3] text-[#03535F]" aria-hidden="true">
                <Icon className="size-[18px]" />
              </span>
              <p className="mt-auto pt-4 font-heading text-lg font-bold leading-tight text-black">{name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#4B4B4B]">{blurb}</p>
              {isAbandoned ? (
                <Link href={path} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#03535F] hover:underline">
                  View status <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : domain === "CLAUDE" ? (
                <JoinClaudeButton
                  withArrow
                  className="mt-3 inline-flex items-center gap-1 self-start text-xs font-bold text-[#03535F] hover:underline disabled:opacity-60"
                />
              ) : (
                <Link
                  href={`/register?domain=${domain}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#03535F] hover:underline"
                >
                  Join <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <ArrowLink href="/challenges" className="mt-6">
        Compare all tracks
      </ArrowLink>
    </section>
  );
}

/* ─── More ways to build skills (events + programs) ────────── */

function programsFor(p: BuildSkillsPanelProps): Program[] {
  const list: Program[] = [];
  if (isProgramEnabled()) {
    list.push({
      title: "31 Days AI Cohort",
      blurb: "Build and deploy a production-grade enterprise AI chatbot in 31 days.",
      days: 31,
      href: p.hasProgramMembership ? `${PROGRAM_AI_COHORT_BASE}/dashboard` : `${PROGRAM_AI_COHORT_BASE}/apply`,
      cta: p.hasProgramMembership ? "Continue" : "Apply",
    });
  }
  if (p.showDatabricks) list.push({ title: "31 Days Databricks", blurb: "Build a healthcare-claims Lakehouse on Databricks in 31 days.", days: 31, href: "/program/databricks", cta: "Open" });
  if (p.showDsArchitect) list.push({ title: "10 Days Data Solutions Architect", blurb: "Design AWS-first data and AI platforms in 10 days.", days: 10, href: "/program/ds-architect", cta: "Open" });
  if (p.showPowerBi) list.push({ title: "7 Days Power BI & Analytics", blurb: "Ship recruiter-grade Power BI dashboards in 7 days.", days: 7, href: "/program/powerbi", cta: "Open" });
  if (p.showSnowflake) list.push({ title: "15 Days Snowflake Data & AI", blurb: "Build a governed Data + AI lakehouse on Snowflake in 15 days.", days: 15, href: "/program/snowflake", cta: "Open" });
  if (p.showDatabricksAi) list.push({ title: "15 Days Databricks Data & AI", blurb: "Build a governed Data + AI lakehouse on Databricks in 15 days.", days: 15, href: "/program/databricks-ai", cta: "Open" });
  return list;
}

function MoreWays(props: BuildSkillsPanelProps) {
  const events = upcomingEvents(props.todayKey).slice(0, 2);
  const programs = programsFor(props);
  if (events.length === 0 && programs.length === 0) return null;

  return (
    <section className="space-y-4 pt-2">
      <PanelSubhead
        id="events"
        title="More ways to"
        accent="build skills"
        aside={<ArrowLink href="/workshop">All events</ArrowLink>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
        {programs.map((p, i) => (
          <ProgramCard key={p.title} program={p} id={i === 0 ? "prep-kit" : undefined} />
        ))}
      </div>
    </section>
  );
}

function EventCard({ event }: { event: WorkshopEvent }) {
  const d = new Date(`${event.date}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    d.toLocaleString("en-US", { timeZone: "UTC", ...o }).toUpperCase();
  const href = event.href ?? (event.register ? `/workshop/events#${event.id}` : "/workshop/events");
  const external = Boolean(event.href);

  return (
    <article className={cn(STAGE_CARD, "flex overflow-hidden")}>
      <div className="relative flex w-24 shrink-0 flex-col items-center justify-center border-r-2 border-dashed border-[#C5DEDF] bg-[#D8ECEC] py-5 text-[#03535F] sm:w-28">
        <span className="text-[11px] font-bold tracking-[0.14em]">{part({ weekday: "short" })}</span>
        <span className="font-heading text-4xl font-bold leading-none">{d.getUTCDate()}</span>
        <span className="text-[11px] font-bold tracking-[0.14em]">{part({ month: "short" })}</span>
        {/* Ticket notches */}
        <span className="absolute -right-2 -top-2 size-4 rounded-full bg-[#F4F4F4]" aria-hidden="true" />
        <span className="absolute -bottom-2 -right-2 size-4 rounded-full bg-[#F4F4F4]" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#03535F]">
          {event.time} · {event.location}
        </p>
        <h4 className="mt-2 font-heading text-lg font-bold leading-snug text-black">{event.title}</h4>
        <p className="mt-1 text-sm text-[#4B4B4B]">Hosted by {event.host}</p>
        <Link
          href={href}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#03535F] underline decoration-[1.5px] underline-offset-[6px]"
        >
          {event.ctaLabel ?? "View details"} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function ProgramCard({ program, id }: { program: Program; id?: string }) {
  return (
    <article id={id} className={cn(STAGE_CARD, "relative scroll-mt-24 overflow-hidden p-5 sm:p-6")}>
      <span
        className="pointer-events-none absolute -bottom-6 right-4 select-none font-heading text-[120px] font-bold leading-none text-[#EEF3F3]"
        aria-hidden="true"
      >
        {program.days}
      </span>
      <div className="relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#03535F]">Programs</p>
        <h4 className="mt-3 font-heading text-lg font-bold text-black">{program.title}</h4>
        <p className="mt-1 max-w-sm text-sm text-[#4B4B4B]">{program.blurb}</p>
        <Link
          href={program.href}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#03535F] underline decoration-[1.5px] underline-offset-[6px]"
        >
          {program.cta} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
