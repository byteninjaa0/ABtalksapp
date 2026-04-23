"use client";

import { parseCalendarKeyToUtcDate, formatDateIST } from "@/lib/date-utils";
import type { HeatmapCell } from "@/features/dashboard/get-heatmap-data";
import { cn } from "@/lib/utils";

type Props = {
  data: HeatmapCell[];
};

const STATUS_CLASS: Record<HeatmapCell["status"], string> = {
  on_time: "bg-green-500",
  late: "bg-yellow-500",
  missed: "bg-red-500",
  pending: "bg-gray-200 dark:bg-gray-700",
};

function tooltipLabel(cell: HeatmapCell): string {
  const displayDate = formatDateIST(parseCalendarKeyToUtcDate(cell.date));
  switch (cell.status) {
    case "on_time":
      return `Day ${cell.dayNumber} — On time on ${displayDate}`;
    case "late":
      return `Day ${cell.dayNumber} — Late on ${displayDate}`;
    case "missed":
      return `Day ${cell.dayNumber} — Missed on ${displayDate}`;
    case "pending":
    default:
      return `Day ${cell.dayNumber} — Unlocks on ${displayDate}`;
  }
}

export function SubmissionHeatmap({ data }: Props) {
  return (
    <div className="w-full min-w-0">
      <div className="overflow-x-auto pb-1">
        <div
          className="grid w-max max-w-full grid-cols-10 gap-1 sm:mx-auto"
          role="grid"
          aria-label="60-day submission heatmap"
        >
          {data.map((cell) => (
            <div
              key={cell.dayNumber}
              role="gridcell"
              title={tooltipLabel(cell)}
              className={cn(
                "size-6 shrink-0 rounded-sm md:size-8",
                STATUS_CLASS[cell.status],
              )}
            />
          ))}
        </div>
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span
            className="size-4 shrink-0 rounded-sm bg-green-500"
            aria-hidden
          />
          On time
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-4 shrink-0 rounded-sm bg-yellow-500"
            aria-hidden
          />
          Late
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-4 shrink-0 rounded-sm bg-red-500"
            aria-hidden
          />
          Missed
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-4 shrink-0 rounded-sm bg-gray-200 dark:bg-gray-700"
            aria-hidden
          />
          Pending
        </li>
      </ul>
    </div>
  );
}
