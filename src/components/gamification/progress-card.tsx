import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import type { ProgressView } from "@/features/gamification/loaders";
import { cn } from "@/lib/utils";

/**
 * Plan 151 §21 — level, XP and the gates that actually stand between the
 * candidate and the next level. Before the first verified activity there is no
 * bar at all: an empty 0 XP bar on day one reads as failure.
 */
export function ProgressCard({ progress }: { progress: ProgressView }) {
  const next = progress.next;
  const pct = next
    ? Math.min(100, Math.round((progress.xpTotal / Math.max(1, next.xpRequired)) * 100))
    : 100;
  // The XP shortfall is a step like any other, so the count matches the list.
  const xpShort = next ? progress.xpTotal < next.xpRequired : false;
  const steps = next ? next.gates.length + (xpShort ? 1 : 0) : 0;

  if (!progress.started) {
    return (
      <section
        aria-label="Your progress"
        className="rounded-2xl border border-[#03535F] bg-[#03535F] p-5 text-white shadow-[inset_0_-5px_14px_rgba(0,0,0,0.3)]"
      >
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#D4EBEC]">
          <Sparkles className="size-3.5" aria-hidden /> Start here
        </p>
        <p className="mt-2 font-display text-lg font-semibold leading-6">
          Your first quest is ready.
        </p>
        <p className="mt-1 text-sm text-[#D4EBEC]">
          Pass one checked activity to unlock your progress bar. Only verified work earns XP.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Your progress"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-lg font-semibold text-[#111111]">
          {progress.levelName}
          <span className="ml-2 rounded-full border border-[#D4EBEC] bg-[#EEF6F6] px-2 py-0.5 align-middle text-xs font-semibold text-[#03535F]">
            Level {progress.level}
          </span>
        </p>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-[#353535]">
          {progress.xpTotal.toLocaleString("en-IN")}
          {next ? (
            <span className="font-medium text-[#8F8F8F]">
              {" / "}
              {next.xpRequired.toLocaleString("en-IN")}
            </span>
          ) : null}
          <span className="ml-1 text-xs font-medium text-[#8F8F8F]">XP</span>
        </p>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#E9E9E9]"
        role="progressbar"
        aria-valuenow={progress.xpTotal}
        aria-valuemin={0}
        aria-valuemax={next?.xpRequired ?? progress.xpTotal}
        aria-valuetext={
          next
            ? `${progress.xpTotal.toLocaleString("en-IN")} of ${next.xpRequired.toLocaleString("en-IN")} XP toward ${next.name}`
            : `${progress.xpTotal.toLocaleString("en-IN")} XP`
        }
      >
        <div
          className="h-full rounded-full bg-[#03535F] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>

      {next ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#626262]">
            {steps === 0
              ? `${next.name} unlocks next`
              : `${steps} ${steps === 1 ? "step" : "steps"} to ${next.name}`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {next.gates.map((gate) => (
              <li key={gate.key} className="flex items-start gap-2 text-sm text-[#4B4B4B]">
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2",
                    gate.met
                      ? "border-[#197E23] bg-[#197E23] text-white"
                      : "border-[#CDD3D3] bg-white text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-2.5" strokeWidth={4} />
                </span>
                <span>{gate.label}</span>
              </li>
            ))}
            {xpShort ? (
              <li className="flex items-start gap-2 text-sm text-[#4B4B4B]">
                <span
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border-2 border-[#CDD3D3] bg-white"
                  aria-hidden
                />
                <span>
                  {(next.xpRequired - progress.xpTotal).toLocaleString("en-IN")} more XP
                </span>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}

      {progress.teaser ? (
        <p className="mt-3 text-xs text-[#8F8F8F]">{progress.teaser}</p>
      ) : null}

      <Link
        href="/profile"
        className="mt-4 inline-flex text-sm font-medium text-[#03535F] underline-offset-4 hover:underline"
      >
        View your profile
      </Link>
    </section>
  );
}
