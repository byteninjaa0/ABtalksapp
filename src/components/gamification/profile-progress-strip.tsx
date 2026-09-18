import type { ProgressView } from "@/features/gamification/loaders";

/**
 * Plan 151 §18 — the profile strip: level, XP and what is still missing,
 * phrased as steps the candidate can take rather than a score.
 */
export function ProfileProgressStrip({ progress }: { progress: ProgressView }) {
  const next = progress.next;
  const pct = next
    ? Math.min(100, Math.round((progress.xpTotal / Math.max(1, next.xpRequired)) * 100))
    : 100;
  // The XP shortfall counts as a step, exactly like an unmet gate.
  const xpShort = next ? progress.xpTotal < next.xpRequired : false;
  const steps = next ? next.gates.length + (xpShort ? 1 : 0) : 0;

  return (
    <div className="rounded-2xl border border-[#E0E0E0] bg-white px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-lg font-semibold text-[#111111]">
          {progress.levelName}
          <span className="ml-2 rounded-full border border-[#D4EBEC] bg-[#EEF6F6] px-2 py-0.5 align-middle text-xs font-semibold text-[#03535F]">
            Level {progress.level}
          </span>
        </p>
        <p className="text-sm font-semibold tabular-nums text-[#353535]">
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
        <p className="mt-2 text-sm text-[#4B4B4B]">
          {steps > 0 ? (
            <>
              <span className="font-semibold text-[#111111]">
                {steps} {steps === 1 ? "step" : "steps"} to {next.name}:
              </span>{" "}
              {[
                ...next.gates.map((g) => g.label),
                ...(xpShort
                  ? [`${(next.xpRequired - progress.xpTotal).toLocaleString("en-IN")} more XP`]
                  : []),
              ].join(" · ")}
            </>
          ) : (
            <span className="font-semibold text-[#111111]">
              {next.name} unlocks next
            </span>
          )}
        </p>
      ) : null}

      {progress.teaser ? (
        <p className="mt-1 text-xs text-[#8F8F8F]">{progress.teaser}</p>
      ) : null}
    </div>
  );
}
