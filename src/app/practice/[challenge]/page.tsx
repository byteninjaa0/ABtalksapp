import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, Code2, ListChecks } from "lucide-react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { auth } from "@/auth";
import {
  PracticeDayList,
  type PracticeDayRow,
} from "@/components/coding-practice/practice-day-list";
import { PracticeStartButton } from "@/components/coding-practice/practice-start-button";
import { PILL_SOLID } from "@/components/dashboard-hub/stages/stage-ui";
import { CODE_LANGUAGES } from "@/features/code-runner/languages";
import {
  PRACTICE_BASE,
  PRACTICE_QUESTIONS_PER_DAY,
  PRACTICE_TZ,
} from "@/features/coding-practice/constants";
import {
  getPracticeChallenge,
  getPracticeDayIndex,
} from "@/features/coding-practice/content";
import {
  practiceDayState,
  unlockKeyForDay,
} from "@/features/coding-practice/progression";
import { isDayLockBypassEnabled } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { getPracticeProgress } from "@/repositories/coding-practice";

export const metadata: Metadata = { title: "DSA Practice | ABTalks" };

type Props = { params: Promise<{ challenge: string }> };

/** When a day's date begins, said the way a learner in India reads a clock. */
function opensAtLabel(startedAt: Date, day: number): string {
  const instant = fromZonedTime(
    `${unlockKeyForDay(startedAt, day)}T00:00:00`,
    PRACTICE_TZ,
  );
  return `${formatInTimeZone(instant, "Asia/Kolkata", "d MMM, h:mm a")} IST`;
}

export default async function PracticeChallengePage({ params }: Props) {
  const { challenge: slug } = await params;
  const challenge = getPracticeChallenge(slug);
  if (!challenge) notFound();

  const path = `${PRACTICE_BASE}/${slug}`;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?from=${encodeURIComponent(path)}`);

  const index = getPracticeDayIndex(slug);
  const progress = await getPracticeProgress(userId, slug);
  const solved = new Set(progress?.solvedActivityIds ?? []);
  const days = index.map((d) => ({
    day: d.day,
    activityIds: d.questions.map((q) => q.activityId),
  }));
  const now = new Date();
  const bypassLocks = isDayLockBypassEnabled();

  const rows: PracticeDayRow[] = Array.from(
    { length: challenge.totalDays },
    (_, i) => {
      const day = i + 1;
      const entry = index.find((d) => d.day === day) ?? null;
      if (!progress) {
        return { day, entry, state: "NOT_STARTED", lockNote: null };
      }
      if (!entry) {
        return {
          day,
          entry,
          state: "LOCKED_DATE",
          lockNote: "Questions for this day are coming soon.",
        };
      }
      const state = practiceDayState({
        day,
        startedAt: progress.startedAt,
        solved,
        days,
        now,
        bypassLocks,
      });
      const lockNote =
        state === "LOCKED_DATE"
          ? `Opens on ${opensAtLabel(progress.startedAt, day)}.`
          : state === "LOCKED_PREVIOUS"
            ? `Complete Day ${day - 1} to open this day.`
            : null;
      return { day, entry, state, lockNote };
    },
  );

  const totalQuestions = challenge.totalDays * PRACTICE_QUESTIONS_PER_DAY;
  const daysComplete = rows.filter((r) => r.state === "COMPLETE").length;
  const percent = Math.round((solved.size / totalQuestions) * 100);
  const finished = solved.size >= totalQuestions;

  // The next thing to do: the first unsolved question of the first open day.
  const openRow = rows.find((r) => r.state === "OPEN" && r.entry);
  const nextQuestion = openRow?.entry?.questions.find(
    (q) => !solved.has(q.activityId),
  );
  const nextLocked = rows.find(
    (r) => r.state === "LOCKED_DATE" || r.state === "LOCKED_PREVIOUS",
  );

  const facts = [
    {
      Icon: CalendarClock,
      text: `${challenge.totalDays} days, ${PRACTICE_QUESTIONS_PER_DAY} problems a day`,
    },
    {
      Icon: Code2,
      text: challenge.languages.map((l) => CODE_LANGUAGES[l].label).join(", "),
    }
  ];

  return (
    <main className="mx-auto w-full max-w-[920px] px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[#03535F] hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Dashboard
      </Link>

      <section className="mt-4 rounded-3xl border border-[#E6E9E9] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#03535F]">
          DSA practice
        </p>
        <h1 className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-black sm:text-[32px] sm:leading-tight">
          {challenge.title}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#4B4B4B]">
          {challenge.subtitle}
        </p>

        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
          {facts.map(({ Icon, text }) => (
            <li
              key={text}
              className="inline-flex items-center gap-2 text-sm text-[#4B4B4B]"
            >
              <Icon className="size-4 text-[#03535F]" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        {progress ? (
          <div className="mt-6 border-t border-[#F0F0F0] pt-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-heading text-2xl font-bold text-black">
                  {solved.size}
                  <span className="text-base font-semibold text-[#8F8F8F]">
                    {" "}
                    / {totalQuestions} solved
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-[#6B7280]">
                  {daysComplete} of {challenge.totalDays} days complete
                </p>
              </div>
              {nextQuestion && openRow ? (
                <Link
                  href={`${path}/${openRow.day}/${nextQuestion.slot}`}
                  className={cn(PILL_SOLID, "gap-1.5")}
                >
                  {solved.size === 0 ? "Start Day 1" : `Continue Day ${openRow.day}`}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#EEF2F2]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={totalQuestions}
              aria-valuenow={solved.size}
              aria-label="Questions solved"
            >
              <div
                className="h-full rounded-full bg-[#03535F] transition-[width] duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
            {finished ? (
              <p className="mt-3 text-sm font-medium text-emerald-700">
                You have solved every question in this challenge.
              </p>
            ) : !nextQuestion && nextLocked?.lockNote ? (
              <p className="mt-3 text-sm text-[#4B4B4B]">
                You are done for today. Day {nextLocked.day}:{" "}
                {nextLocked.lockNote.charAt(0).toLowerCase() +
                  nextLocked.lockNote.slice(1)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 border-t border-[#F0F0F0] pt-5">
            <p className="max-w-2xl text-sm leading-relaxed text-[#4B4B4B]">
              Day 1 opens as soon as you start. Solve both problems to complete
              a day. 
            </p>
            <div className="mt-4">
              <PracticeStartButton challenge={slug} />
            </div>
          </div>
        )}
      </section>

      <h2 className="mb-4 mt-8 font-heading text-lg font-bold text-black">
        Your {challenge.totalDays} days
      </h2>
      <PracticeDayList challenge={slug} rows={rows} solved={solved} />
    </main>
  );
}
