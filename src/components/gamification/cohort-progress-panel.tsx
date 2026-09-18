import { Check } from "lucide-react";
import type { CohortMilestone } from "@/features/gamification/loaders";
import { cn } from "@/lib/utils";

/**
 * Plan 151 §15 — a cohort as a journey. Rank is shown as a percentile band
 * rather than a raw position, so the bottom half is never told it is last.
 */
export function CohortProgressPanel({
  cohortName,
  completed,
  total,
  percentile,
  milestones,
  dayLabel,
}: {
  cohortName: string;
  completed: number;
  total: number;
  percentile: number | null;
  milestones: CohortMilestone[];
  dayLabel: string | null;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const topBand = percentile != null ? Math.max(1, 100 - percentile) : null;

  return (
    <section
      aria-label="Cohort progress"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
            Cohort
          </p>
          <p className="mt-0.5 truncate font-display text-lg font-semibold text-[#111111]">
            {cohortName}
          </p>
          {dayLabel ? (
            <p className="text-sm text-[#626262]">{dayLabel}</p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full border border-[#E0E0E0] bg-[#F4F4F4] px-2 py-0.5 text-xs font-semibold tabular-nums text-[#353535]">
          {pct}%
        </span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#E9E9E9]"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${completed} of ${total} activities complete`}
      >
        <div
          className="h-full rounded-full bg-[#03535F] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="relative mt-4 grid grid-cols-5">
        <span
          className="absolute inset-x-[10%] top-2 h-0.5 bg-[#E9E9E9]"
          aria-hidden
        />
        {milestones.map((m) => (
          <li key={m.key} className="relative flex flex-col items-center gap-1.5 text-center">
            <span
              className={cn(
                "grid size-[18px] place-items-center rounded-full border-2 bg-white",
                m.done ? "border-[#03535F] bg-[#03535F] text-white" : "border-[#CDD3D3] text-transparent",
              )}
              aria-hidden
            >
              <Check className="size-2.5" strokeWidth={4} />
            </span>
            <span
              className={cn(
                "text-[10px] leading-tight",
                m.done ? "text-[#353535]" : "text-[#8F8F8F]",
              )}
            >
              {m.label}
            </span>
            <span className="sr-only">{m.done ? "complete" : "not complete"}</span>
          </li>
        ))}
      </ol>

      {topBand != null ? (
        <p className="mt-3 inline-flex rounded-full border border-[#D4EBEC] bg-[#EEF6F6] px-2.5 py-1 text-xs font-semibold text-[#03535F]">
          Top {topBand}% of cohort
        </p>
      ) : null}
    </section>
  );
}
