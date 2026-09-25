import Link from "next/link";
import type { Domain } from "@prisma/client";
import type { CSSProperties } from "react";
import { AlertCircle, ArrowRight, BarChart3, Code2, Flame, Network, Sparkles } from "lucide-react";
import type { SixtyDay } from "@/features/dashboard/get-stage-data";
import type { HubEnrollment } from "@/features/dashboard/get-hub-data";
import type { ActivityStreak, WeekDayTick } from "@/features/dashboard/compute-activity-streak";
import { JoinClaudeButton } from "@/components/dashboard-hub/join-claude-button";
import { cn } from "@/lib/utils";
import { STAGE_CARD } from "./stage-ui";
import "./stages.css";

/* Progress for an enrolled student: the 60-day grid, the streak box and a
   Continue learning card. Only rendered once they have a track. */

export const TRACK_META: Record<Domain, { name: string; blurb: string; path: string; Icon: typeof Code2 }> = {
  SE: { name: "Software Engineering", blurb: "Ship real software, one task a day", path: "/se", Icon: Code2 },
  AI: { name: "AI", blurb: "Build with models, agents and data", path: "/ai", Icon: Network },
  DS: { name: "Data Science", blurb: "Raw data into real insight", path: "/ds", Icon: BarChart3 },
  CLAUDE: { name: "Claude", blurb: "Master Claude AI in 60 days", path: "/claude", Icon: Sparkles },
};

/* ─── Grid squares ────────────────────────────────────────────
   Active: brand teal #008C94, opacity by intensity (0.2 → 1.0), a soft
   glassy highlight plus a dark inner shadow (bottom-right) and a light one
   (top-left). Missed: flat #D9D9DE. Future: white, 1px #D1D9DE inside. */

const ACTIVE_OPACITY = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

const ACTIVE_SQUARE: CSSProperties = {
  backgroundColor: "#008C94",
  backgroundImage:
    "linear-gradient(135deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0.08) 38%, rgba(255,255,255,0) 60%)",
  boxShadow: "inset -2px -2px 4px rgba(0,31,31,0.2), inset 2px 2px 5px rgba(255,255,255,0.25)",
};

function Square({ d }: { d: SixtyDay }) {
  if (d.status === "active") {
    return (
      <span
        className="aspect-square rounded-[5px]"
        style={{ ...ACTIVE_SQUARE, opacity: ACTIVE_OPACITY[d.level] }}
        title={`Day ${d.day} · done`}
      />
    );
  }
  if (d.status === "missed") {
    return <span className="aspect-square rounded-[5px] bg-[#D9D9DE]" title={`Day ${d.day} · missed`} />;
  }
  return (
    <span
      className="aspect-square rounded-[5px] bg-white shadow-[inset_0_0_0_1px_#D1D9DE]"
      title={`Day ${d.day}`}
    />
  );
}

export function SixtyDayGrid({
  sixty,
  primary,
  totalSubmissions,
}: {
  sixty: SixtyDay[];
  primary: HubEnrollment;
  totalSubmissions: number;
}) {
  const done = sixty.filter((d) => d.status === "active").length;
  return (
    <section aria-label="Your 60 days">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#008C94]">Your 60 days</p>
      <p className="mt-1.5 font-heading text-[32px] font-bold leading-none text-black">
        {done} <span className="font-medium text-[#6B7280]">of 60</span>
      </p>
      <p className="mt-1.5 text-sm text-[#1F1F1F]">In {TRACK_META[primary.domain].name}</p>

      <div
        className="sixty-grid mt-4 grid max-w-[560px] gap-1.5"
        role="img"
        aria-label={`${done} of 60 days done`}
      >
        {sixty.map((d) => (
          <Square key={d.day} d={d} />
        ))}
      </div>

      <div className="mt-3 flex max-w-[560px] flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[#4B4B4B]">
          {totalSubmissions} {totalSubmissions === 1 ? "submission" : "submissions"} in the last 6 months
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-[#4B4B4B]" aria-hidden="true">
          Less
          {ACTIVE_OPACITY.slice(1).map((o) => (
            <span key={o} className="size-3 rounded-[2px]" style={{ ...ACTIVE_SQUARE, opacity: o }} />
          ))}
          More
        </span>
      </div>
    </section>
  );
}

/** Grid and streak in one card, side by side on wide screens. */
export function ProgressCard({
  sixty,
  primary,
  totalSubmissions,
  streak,
}: {
  sixty: SixtyDay[];
  primary: HubEnrollment;
  totalSubmissions: number;
  streak: ActivityStreak;
}) {
  return (
    <div className={cn(STAGE_CARD, "p-5")}>
      <div className="progress-split grid gap-6 md:items-start md:gap-0">
      <div className="md:pr-6">
        <SixtyDayGrid sixty={sixty} primary={primary} totalSubmissions={totalSubmissions} />
      </div>
      <div className="border-t border-[#E9ECEC] pt-6 md:border-l md:border-t-0 md:pl-6 md:pt-0">
        <StreakBox streak={streak} />
      </div>
      </div>
    </div>
  );
}

/* ─── Streak tiers ───────────────────────────────────────────
   One metal per streak milestone. The badge wears the metal of the
   highest milestone reached; a week hexagon wears it on the day the
   milestone was hit. Below 3 days the badge is locked grey. */

type Tier = {
  name: string;
  /** Metallic gradient: light → deep → light. */
  a: string;
  b: string;
  c: string;
  rim: string;
  ink: string;
  wash: string;
  /** Multi-colour metal (rainbow) — overrides a/b/c in gradients. */
  stops?: string[];
};

const LOCKED: Tier = { name: "Locked", a: "#EEF1F3", b: "#CDD3D8", c: "#E5E9EC", rim: "#F7F9FA", ink: "#6B7280", wash: "rgba(200,206,212,0.18)" };

const RAINBOW = ["#FF6B6B", "#FFB84D", "#FFE45C", "#5EE08A", "#4DB8FF", "#8C7BFF", "#E27BFF"];

const TIERS: { min: number; tier: Tier }[] = [
  { min: 60, tier: { name: "Rainbow", a: "#FFE45C", b: "#8C7BFF", c: "#5EE08A", rim: "#FFFFFF", ink: "#5B3FB8", wash: "rgba(140,123,255,0.2)", stops: RAINBOW } },
  { min: 30, tier: { name: "Pink", a: "#FFD6EA", b: "#E94B97", c: "#FFB3D6", rim: "#FFF0F7", ink: "#8C1D55", wash: "rgba(233,75,151,0.2)" } },
  { min: 14, tier: { name: "Sky", a: "#DDF6FF", b: "#3FC0F0", c: "#BDEBFF", rim: "#EAFBFF", ink: "#0B6E93", wash: "rgba(63,192,240,0.22)" } },
  { min: 10, tier: { name: "Orange", a: "#FFE0C2", b: "#F2780C", c: "#FFB978", rim: "#FFF2E6", ink: "#8A3F00", wash: "rgba(242,120,12,0.2)" } },
  { min: 7, tier: { name: "Gold", a: "#FFE679", b: "#D7A312", c: "#FFE98A", rim: "#FFF6CF", ink: "#8A6100", wash: "rgba(245,196,40,0.24)" } },
  { min: 5, tier: { name: "Bronze", a: "#F3CFA8", b: "#A8612B", c: "#E0A06A", rim: "#FCE6D2", ink: "#6E380F", wash: "rgba(214,138,72,0.22)" } },
  { min: 3, tier: { name: "Silver", a: "#F6F8FA", b: "#8C96A1", c: "#D5DBE1", rim: "#FFFFFF", ink: "#56606B", wash: "rgba(160,170,182,0.24)" } },
];

/** Gradient stops for a tier's metal; the rainbow spreads its colours. */
function metalStops(t: Tier, shine: boolean): { offset: number; color: string }[] {
  if (t.stops) {
    return t.stops.map((color, i, all) => ({ offset: i / (all.length - 1), color }));
  }
  return shine
    ? [
        { offset: 0, color: t.c },
        { offset: 0.22, color: t.b },
        { offset: 0.42, color: "#FFFFFF" },
        { offset: 0.5, color: t.a },
        { offset: 0.7, color: t.b },
        { offset: 1, color: t.c },
      ]
    : [
        { offset: 0, color: t.a },
        { offset: 0.55, color: t.b },
        { offset: 1, color: t.c },
      ];
}

function tierOf(days: number): Tier {
  return TIERS.find((t) => days >= t.min)?.tier ?? LOCKED;
}

/** The tier whose milestone is exactly this streak day, if any. */
function milestoneTier(streakDay: number): Tier | null {
  return TIERS.find((t) => t.min === streakDay)?.tier ?? null;
}

/** Plain badge for an ordinary day — white body, black number. */
const PLAIN: Tier = { name: "Streak", a: "#FFFFFF", b: "#F2F4F5", c: "#FFFFFF", rim: "#E3E7EA", ink: "#111111", wash: "rgba(0,0,0,0)" };

function StreakBadge({ days, milestone }: { days: number; milestone: boolean }) {
  const t = milestone ? tierOf(days) : PLAIN;
  const id = `badge-${t.name}`;
  return (
    <svg
      viewBox="0 0 60 68"
      className="streak-badge shrink-0 drop-shadow-[0_5px_10px_rgba(0,0,0,0.14)]"
      role="img"
      aria-label={`${days}-day streak · ${t.name} badge`}
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          {metalStops(t, false).map((st) => (
            <stop key={st.offset} offset={st.offset} stopColor={st.color} />
          ))}
        </linearGradient>
      </defs>
      {/* Hexagon body with a light rim */}
      <polygon points="30,14 55,28 55,54 30,67 5,54 5,28" fill={`url(#${id}-fill)`} stroke={t.rim} strokeWidth="2.5" strokeLinejoin="round" />
      {/* Flame cresting the top point */}
      <path
        d="M30 1 C 36 9 42 13 42 21 C 42 28 36.5 32 30 32 C 23.5 32 18 28 18 21 C 18 16 21 13 23 11 C 23.5 15 25.5 17 27 17 C 26 11 28 6 30 1 Z"
        fill={`url(#${id}-fill)`}
        stroke={t.rim}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M30 17 C 33 21 35 23 35 26 C 35 29 32.5 31 30 31 C 27.5 31 25 29 25 26 C 25 23 27 21 30 17 Z" fill={t.rim} opacity="0.75" />
      {/* Number + label drawn inside the hexagon, so they can't drift out. */}
      <text x="30" y="46" textAnchor="middle" fontSize="15" fontWeight="800" fontStyle="italic" fill={t.ink} className="font-heading">
        {days}
      </text>
      <text x="30" y="54" textAnchor="middle" fontSize="5.5" fontWeight="800" fontStyle="italic" letterSpacing="0.6" fill={t.ink}>
        STREAK
      </text>
    </svg>
  );
}

/* ─── Week hexagons ──────────────────────────────────────────── */

/**
 * The streak count on each day of this week, for days in a run of completed
 * days (null otherwise). The run ending at the current streak uses the real
 * count; an earlier run inside the week is counted from where it starts.
 */
function weekStreakDays(week: WeekDayTick[], currentStreak: number): (number | null)[] {
  const out: (number | null)[] = week.map(() => null);
  const done = week.map((t) => t.status === "complete");
  const todayIdx = week.findIndex((t) => t.isToday);
  // Where the live streak ends: today if done, otherwise yesterday.
  const end = todayIdx >= 0 && done[todayIdx] ? todayIdx : todayIdx - 1;
  let i = end;
  let v = currentStreak;
  while (i >= 0 && done[i] && v > 0) {
    out[i] = v;
    i -= 1;
    v -= 1;
  }
  // Days after today: where the live streak lands if it keeps going.
  if (todayIdx >= 0) {
    // Today's own value, done or not yet, then one more per day after it.
    const atToday = done[todayIdx] ? currentStreak : currentStreak + 1;
    for (let j = todayIdx; j < week.length; j++) {
      if (j === todayIdx && done[j]) continue; // already set above
      out[j] = atToday + (j - todayIdx);
    }
  }
  // Earlier runs in the week (before a break): count up from their start.
  let run = 0;
  for (let j = 0; j < (todayIdx >= 0 ? todayIdx : week.length); j++) {
    if (out[j] !== null) break;
    run = done[j] ? run + 1 : 0;
    if (done[j]) out[j] = run;
  }
  return out;
}

/** Pointy-top hexagon; drawn stretched to the box, so heights can differ. */
const HEX = "50,1 99,26 99,74 50,99 1,74 1,26";

/** Four-point sparkle in a 10×10 box. */
const SPARKLE = "M5 0 Q5.6 4.4 10 5 Q5.6 5.6 5 10 Q4.4 5.6 0 5 Q4.4 4.4 5 0 Z";

function DayHex({ tick, streakDay }: { tick: WeekDayTick; streakDay: number | null }) {
  const d = new Date(`${tick.date}T12:00:00Z`);
  const date = d.toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  const today = tick.isToday;
  const metal = streakDay !== null ? milestoneTier(streakDay) : null;
  // Reached today → thick border + sparkles; otherwise a thin metal outline.
  const live = Boolean(metal) && today && tick.status === "complete";
  const gid = `hex-${tick.date}-${metal?.name ?? "plain"}`;
  // Green marks today only; a milestone day wears its metal instead.
  const stroke = metal ? `url(#${gid}-metal)` : today ? "#22C58B" : "#E5E7EB";
  const width = live ? 4 : metal ? 2 : today ? 2.5 : 1.5;
  return (
    <li className="flex flex-col items-center gap-1">
      <span className="relative block">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className={cn("block overflow-visible", today ? "week-hex-today" : "week-hex")}
          aria-hidden="true"
        >
          {metal ? (
            <defs>
              {/* Banded metal: light → deep → bright → deep → light. */}
              <linearGradient id={`${gid}-metal`} x1="0" y1="0" x2="1" y2="1">
                {metalStops(metal, true).map((st) => (
                  <stop key={st.offset} offset={st.offset} stopColor={st.color} />
                ))}
              </linearGradient>
            </defs>
          ) : null}
          <polygon
            points={HEX}
            fill="#fff"
            stroke={stroke}
            strokeWidth={width}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {live && metal ? (
            /* Thin inner highlight line — reads as a polished bevel. */
            <polygon
              points="50,9 91,30 91,70 50,91 9,70 9,30"
              fill="none"
              stroke={metal.b}
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {metal ? (
            <text
              x="50"
              y="50"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={today ? 34 : 40}
              fontWeight="800"
              fontStyle="italic"
              fill={metal.ink}
              className="font-heading"
            >
              {streakDay}
            </text>
          ) : null}
        </svg>
        {live && metal ? (
          <>
            <svg viewBox="0 0 10 10" className="hex-sparkle -right-1.5 -top-1 size-3" aria-hidden="true">
              <path d={SPARKLE} fill={metal.b} />
            </svg>
            <svg viewBox="0 0 10 10" className="hex-sparkle hex-sparkle--2 -left-1.5 top-1/3 size-2" aria-hidden="true">
              <path d={SPARKLE} fill={metal.b} />
            </svg>
            <svg viewBox="0 0 10 10" className="hex-sparkle hex-sparkle--3 -bottom-1 right-0 size-2.5" aria-hidden="true">
              <path d={SPARKLE} fill={metal.a} stroke={metal.b} strokeWidth="0.6" />
            </svg>
          </>
        ) : null}
      </span>
      <span className="week-label whitespace-nowrap text-center leading-tight">
        <span className={cn("block font-semibold", today ? "text-black" : "text-[#1F1F1F]")}>{tick.label}</span>
        <span className="block text-[#6B7280]">{date}</span>
      </span>
      {metal ? <span className="sr-only">{`${streakDay}-day milestone, ${metal.name}`}</span> : null}
    </li>
  );
}

function plural(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

function milestoneCopy(s: ActivityStreak): string {
  if (s.state === "empty") return "Complete today's task to get started.";
  if (s.state === "broken") return "Every day is a new chance to improve.";
  if (!s.todayCompleted) return "Make a submission to keep your streak alive.";
  if (s.currentStreak === 1) return "Your streak starts today.";
  if (s.daysToMilestone === 0) return "You're on fire!";
  return `You're on fire! ${s.daysToMilestone === 1 ? "1 more day" : `${s.daysToMilestone} more days`} to your next milestone.`;
}

export function StreakBox({ streak }: { streak: ActivityStreak }) {
  const broken = streak.state === "broken";
  const streakDays = weekStreakDays(streak.week, streak.currentStreak);
  // A milestone is "live" only on the day it's reached.
  const milestoneToday =
    streak.todayCompleted && milestoneTier(streak.currentStreak) !== null;
  const headline =
    streak.state === "empty" ? "Start your streak." : broken ? "Streak lost." : "Keep showing up.";
  return (
    <section aria-label="Your streak" className="streak-box relative">
      {/* Faint wash of the badge's metal, like the badge-unlock screens. */}
      <span
        className="pointer-events-none absolute -inset-5 -z-0 rounded-3xl opacity-90"
        style={{ background: milestoneToday ? `radial-gradient(120% 90% at 100% 0%, ${tierOf(streak.currentStreak).wash} 0%, transparent 60%)` : "none" }}
        aria-hidden="true"
      />
      <div className="relative">
      <div className="flex items-start gap-4">
        <StreakBadge days={streak.currentStreak} milestone={milestoneToday} />
        <div className="min-w-0 flex-1 pt-1">
          <p
            className={cn(
              "flex flex-wrap items-center gap-x-1.5 font-heading text-base font-bold uppercase leading-tight",
              broken ? "text-[#E0532C]" : "text-[#03535F]",
            )}
          >
            {broken ? <AlertCircle className="size-5" strokeWidth={2.2} aria-hidden="true" /> : <Flame className="size-5" aria-hidden="true" />}
            {broken ? "Streak broken" : "Day streak"}
          </p>
          <p className="mt-0.5 text-sm text-[#6B7280]">{headline}</p>
          <Link
            href="/achievements"
            className="mt-2 flex w-fit rounded-full bg-[#03535F] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#076573]"
          >
            Achievements
          </Link>
        </div>
      </div>

      <ul className="mt-3.5 flex max-w-[420px] items-end justify-between" aria-label="This week">
        {streak.week.map((t, i) => (
          <DayHex key={t.date} tick={t} streakDay={streakDays[i]} />
        ))}
      </ul>

      {/* Stats beside the message, split by a vertical rule. */}
      <div className="mt-3.5 flex items-stretch gap-4">
        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[13px]">
          {[
            ["Current streak", plural(streak.currentStreak)],
            ["Longest streak", plural(streak.longestStreak)],
            ["Total active days", plural(streak.totalActiveDays)],
            ["Next milestone", plural(streak.nextMilestone)],
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[#4B4B4B]">{k}</dt>
              <dd className="text-[#4B4B4B]">{v}</dd>
            </div>
          ))}
        </dl>
        <span className="w-px shrink-0 bg-[#E3E7E7]" aria-hidden="true" />
        <p className="flex min-w-0 items-center font-heading text-[15px] font-semibold leading-snug text-[#03535F]">
          {milestoneCopy(streak)}
        </p>
      </div>
      </div>
    </section>
  );
}

/* ─── Continue learning ──────────────────────────────────────── */

export function ContinueLearning({
  enrollments,
  joinable,
}: {
  enrollments: HubEnrollment[];
  /** Tracks they can still join (not joined, not removed from). */
  joinable: Domain[];
}) {
  return (
    <section
      id="your-challenge"
      className="flex scroll-mt-24 flex-col rounded-3xl bg-[linear-gradient(170deg,#5C8C8F_0%,#467679_100%)] p-5 text-white shadow-[0_18px_40px_-22px_rgba(3,83,95,0.9)]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7CE8C8]">Continue learning</p>
      <h3 className="mt-2 font-heading text-2xl font-bold leading-tight">Pick up your track</h3>

      <ul className="mt-4 space-y-3">
        {enrollments.map((e) => {
          const { name, path, Icon } = TRACK_META[e.domain];
          const done = e.status === "COMPLETED";
          const pct = done ? 100 : Math.min(100, Math.round((e.daysCompleted / 60) * 100));
          return (
            <li key={e.id}>
              <Link
                href={path}
                className="group flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 p-3.5 text-white transition-colors hover:bg-white/15"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15" aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-heading font-bold leading-tight">{name}</span>
                  <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/80">
                    {done ? "Completed · 60 of 60" : `Day ${Math.min(60, e.daysCompleted + 1)} of 60`}
                    <span className="flex items-center gap-1 text-xs font-bold text-white">
                      {done ? "View" : "Continue"}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
                    <span className="block h-full rounded-full bg-[#2BD4A0]" style={{ width: `${pct}%` }} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {joinable.length > 0 ? (
        <div id="domains" className="mt-auto scroll-mt-24 pt-5">
          <p className="text-xs font-semibold text-white/75">Add another track</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {joinable.map((d) => {
              const { name, Icon } = TRACK_META[d];
              const chip =
                "inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20";
              return (
                <li key={d}>
                  {d === "CLAUDE" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 py-1.5 pl-3 pr-1 text-xs font-semibold text-white">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {name}
                      <JoinClaudeButton
                        withArrow
                        className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30 disabled:opacity-60"
                      />
                    </span>
                  ) : (
                    <Link href={`/register?domain=${d}`} className={chip}>
                      <Icon className="size-3.5" aria-hidden="true" />
                      {name}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
