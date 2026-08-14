"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  submittedDays: number;
  totalDays: number;
  children: ReactNode;
};

export function CollapsedHeatmap({
  submittedDays,
  totalDays,
  children,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-spark flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Grid3x3 className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Your 60-day grid</span>
          <span className="block text-xs text-muted-foreground">
            {submittedDays} of {totalDays} days submitted
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <div className="min-w-0 border-t px-5 py-4">{children}</div>
      ) : null}
    </div>
  );
}
