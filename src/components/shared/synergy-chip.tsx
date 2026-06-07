"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  Flame,
  GitCommit,
  Share2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSynergy } from "@/components/shared/synergy-provider";
import {
  SYNERGY_PROOF_GITHUB,
  SYNERGY_PROOF_LINKEDIN,
  SYNERGY_REFERRAL,
} from "@/features/synergy/scoring";

export function SynergyChip() {
  const { points } = useSynergy();
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const prevPoints = useRef(points);
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (reducedMotion || points == null) return;

    const id = requestAnimationFrame(() => {
      if (prevPoints.current != null && points > prevPoints.current) {
        setPulsing(true);
      }
      prevPoints.current = points;
    });

    return () => cancelAnimationFrame(id);
  }, [points, reducedMotion]);

  useEffect(() => {
    if (!pulsing) return;
    const t = window.setTimeout(() => setPulsing(false), 320);
    return () => window.clearTimeout(t);
  }, [pulsing]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="View your synergy"
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-violet-500/15 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm transition-colors hover:from-primary/25 hover:to-violet-500/25",
          pulsing && "spark-pulse",
        )}
      >
        <Flame
          className={cn(
            "size-3.5 transition-transform group-hover:scale-110",
            pulsing && "spark-pulse",
          )}
          aria-hidden
        />
        <span className="tabular-nums">{points ?? "…"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(90dvh,720px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <div className="shrink-0 rounded-t-lg bg-gradient-to-br from-primary to-violet-500 px-4 py-5 text-primary-foreground sm:px-6 sm:py-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-white/20 sm:size-12">
                <Flame className="size-6" aria-hidden />
              </div>
              <div>
                <p className="font-display text-3xl font-bold tabular-nums leading-none sm:text-4xl">
                  {points ?? "…"}
                </p>
                <p className="mt-1 text-sm text-primary-foreground/90">
                  Your community score. The more you contribute, the more
                  you&apos;re rewarded.
                </p>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:space-y-4 sm:p-6">
            <p className="text-sm font-semibold text-foreground">
              How you earn
            </p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3">
              <div className="rounded-xl border bg-card p-2.5 sm:p-3">
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <UserPlus className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p className="text-sm font-semibold">Refer a friend</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Share your referral link. When someone signs up using it, you
                  get +{SYNERGY_REFERRAL} synergy instantly.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 sm:p-3">
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <GitCommit className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm font-semibold">Attach your GitHub</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Link your commit or repo for +{SYNERGY_PROOF_GITHUB} synergy on
                  that day.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 sm:p-3">
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-sky-500/10">
                  <Share2 className="size-4 text-sky-600 dark:text-sky-400" />
                </div>
                <p className="text-sm font-semibold">Share on LinkedIn</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Post your progress and add the link for +{SYNERGY_PROOF_LINKEDIN}{" "}
                  synergy.
                </p>
              </div>
              <div className="rounded-xl border bg-card p-2.5 sm:p-3">
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg bg-violet-500/10">
                  <Users className="size-4 text-violet-600 dark:text-violet-400" />
                </div>
                <p className="text-sm font-semibold">Show up for the community</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Join weekly communication practice and other sessions. Those
                  earn synergy too.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
              <TrendingUp className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Members with high synergy get more visibility in the community
                and early access to job opportunities.
              </p>
            </div>
          </div>

          <div className="shrink-0 border-t border-border/60 p-4 pt-3 sm:p-6 sm:pt-4">
            <DialogClose
              className={cn(
                buttonVariants({ variant: "default" }),
                "w-full",
              )}
            >
              Got it
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
