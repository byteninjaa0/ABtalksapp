"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import { parseCalendarKeyToUtcDate, formatDateIST } from "@/lib/date-utils";
import type { HeatmapCell } from "@/features/dashboard/get-heatmap-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Props = {
  data: HeatmapCell[];
  interactive?: boolean;
};

const STATUS_CLASS: Record<HeatmapCell["status"], string> = {
  on_time: "bg-emerald-500",
  late: "bg-amber-400",
  missed: "bg-red-500",
  pending:
    "border border-dotted border-muted-foreground/40 bg-muted/20 dark:bg-muted/30",
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

function isClickable(cell: HeatmapCell): boolean {
  return cell.status === "on_time" || cell.status === "late";
}

export function SubmissionHeatmap({ data, interactive = true }: Props) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<HeatmapCell | null>(null);

  function openCell(cell: HeatmapCell) {
    if (!isClickable(cell)) return;
    setActive(cell);
    setOpen(true);
  }

  const submittedLabel =
    active?.submittedAt != null
      ? formatDateIST(new Date(active.submittedAt))
      : "—";

  return (
    <div className="w-full min-w-0">
      <div className="overflow-x-auto pb-1">
        <div
          className="grid w-max max-w-full grid-cols-10 gap-1.5 sm:mx-auto sm:gap-2"
          role="grid"
          aria-label="60-day submission heatmap"
        >
          {data.map((cell, index) => {
            const clickable = interactive && isClickable(cell);
            return (
              <button
                key={cell.dayNumber}
                type="button"
                role="gridcell"
                title={tooltipLabel(cell)}
                disabled={!clickable}
                onClick={() => openCell(cell)}
                style={{ animationDelay: `${index * 22}ms` }}
                className={cn(
                  "size-7 shrink-0 rounded-md opacity-0 animate-heatmap-cell sm:size-9",
                  STATUS_CLASS[cell.status],
                  clickable &&
                    "cursor-pointer transition-[box-shadow,transform] hover:z-10 hover:ring-2 hover:ring-primary hover:ring-offset-2 hover:ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                  !clickable && "cursor-default",
                )}
              />
            );
          })}
        </div>
      </div>

      <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <span
            className="size-3.5 shrink-0 rounded-sm bg-emerald-500"
            aria-hidden
          />
          On time
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-3.5 shrink-0 rounded-sm bg-amber-400"
            aria-hidden
          />
          Late
        </li>
        <li className="flex items-center gap-2">
          <span
            className="size-3.5 shrink-0 rounded-sm bg-red-500"
            aria-hidden
          />
          Missed
        </li>
        <li className="flex items-center gap-2">
          <span
            className="inline-block size-3.5 shrink-0 rounded-sm border border-dotted border-muted-foreground/45 bg-muted/25 dark:bg-muted/35"
            aria-hidden
          />
          Pending
        </li>
      </ul>

      <Dialog open={interactive ? open : false} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(90vh,720px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          {active ? (
            <>
              <DialogHeader className="shrink-0 border-b border-border/60 px-5 pt-5 pb-3">
                <DialogTitle className="font-display text-lg leading-snug sm:text-xl">
                  Day {active.dayNumber}
                  {active.taskTitle ? ` — ${active.taskTitle}` : ""}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge
                    variant="secondary"
                    className={
                      active.status === "on_time"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                    }
                  >
                    {active.status === "on_time" ? "On time" : "Late"}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    Submitted {submittedLabel}
                  </p>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Problem
                  </h3>
                  <div className="max-w-none text-sm leading-relaxed text-foreground [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                    {active.problemStatement ? (
                      <ReactMarkdown>{active.problemStatement}</ReactMarkdown>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No problem statement on file for this day.
                      </p>
                    )}
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Your submission
                  </h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <span className="text-muted-foreground">GitHub: </span>
                      {active.githubUrl ? (
                        <a
                          href={active.githubUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {active.githubUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </li>
                    <li>
                      <span className="text-muted-foreground">LinkedIn: </span>
                      {active.linkedinUrl ? (
                        <a
                          href={active.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {active.linkedinUrl}
                        </a>
                      ) : (
                        "—"
                      )}
                    </li>
                  </ul>
                </section>
              </div>

              <div className="flex shrink-0 justify-center border-t border-border/60 bg-muted/30 px-5 py-4">
                <Button type="button" variant="default" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
