import { Check, Shield } from "lucide-react";
import type { StreakView } from "@/features/gamification/loaders";
import { cn } from "@/lib/utils";

/**
 * Plan 151 §10 — weekly, not daily. Two checked days keep the week alive, and
 * banked freezes cover a missed week. Copy never mourns a lost streak, and the
 * current week is never shown as broken while it is still running.
 */
export function WeekStreakCard({ streak }: { streak: StreakView }) {
  return (
    <section
      aria-label="Weekly building streak"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-semibold text-[#111111]">
          Week streak · {streak.weekStreak}
        </p>
        <span className="shrink-0 text-xs font-medium text-[#8F8F8F]">
          best {streak.longestWeekStreak}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-7 gap-1.5">
        {streak.days.map((day) => (
          <li key={day.dayKey} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid size-8 place-items-center rounded-[10px]",
                day.active
                  ? "bg-[#03535F] text-white shadow-[inset_0_-4px_10px_rgba(0,0,0,0.3)]"
                  : day.isFuture
                    ? "bg-[#F4F4F4] text-transparent"
                    : "bg-[#E9E9E9] text-transparent",
                day.isToday && "outline outline-2 outline-offset-2 outline-[#03535F]",
              )}
              aria-hidden
            >
              <Check className="size-3.5" strokeWidth={4} />
            </span>
            <span className="text-[11px] text-[#626262]">{day.label}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only">
        {streak.activeDays} of 7 days this week have checked work.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#8F8F8F]">
          Active week = checked work on 2+ days
        </p>
        {streak.weekActive ? (
          <span className="rounded-full bg-[#E4F2E5] px-2 py-0.5 text-xs font-semibold text-[#155F1B]">
            Active week ✓
          </span>
        ) : (
          <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5 text-xs font-medium text-[#626262]">
            {2 - streak.activeDays === 1 ? "1 more day" : "2 days"} to keep it
          </span>
        )}
      </div>

      {streak.streakFreezes > 0 ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#D4EBEC] bg-[#EEF6F6] px-2.5 py-1 text-xs font-medium text-[#03535F]">
          <Shield className="size-3.5" aria-hidden />
          {streak.streakFreezes === 1 ? "1 freeze banked" : `${streak.streakFreezes} freezes banked`}
        </p>
      ) : null}
    </section>
  );
}
