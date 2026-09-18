import { cn } from "@/lib/utils";

type Row = {
  rank: number;
  displayName: string;
  isViewer: boolean;
  placement: string | null;
};

/**
 * Plan 151 §13 — published hackathon placements. Only what was actually
 * issued as a credential is shown; there are no judge, AI or peer columns
 * until a judging pipeline writes them.
 */
export function HackathonResultsBoard({
  rows,
  viewerRank,
}: {
  rows: Row[];
  viewerRank?: number | null;
}) {
  return (
    <section
      aria-label="Hackathon results"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
          Hackathon results
        </p>
        {viewerRank ? (
          <span className="shrink-0 rounded-full bg-[#03535F] px-2 py-0.5 text-xs font-semibold text-white">
            You · #{viewerRank}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#626262]">
          Results appear here once placements are published.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-[#E9E9E9]">
          {rows.map((row) => (
            <li
              key={`${row.rank}-${row.displayName}`}
              className={cn(
                "flex items-center gap-3 py-2 text-sm",
                row.isViewer && "-mx-2 rounded-xl bg-[#EEF6F6] px-2 shadow-[inset_0_0_0_1px_#D4EBEC]",
              )}
            >
              <span
                className={cn(
                  "w-6 shrink-0 font-display font-semibold tabular-nums",
                  row.isViewer ? "text-[#03535F]" : "text-[#8F8F8F]",
                )}
              >
                {row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-[#111111]">
                {row.displayName}
                {row.isViewer ? <span className="text-[#626262]"> · you</span> : null}
              </span>
              {row.placement ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    row.isViewer
                      ? "bg-[#03535F] text-white"
                      : "border border-[#D4EBEC] bg-[#EEF6F6] text-[#03535F]",
                  )}
                >
                  {row.placement}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
