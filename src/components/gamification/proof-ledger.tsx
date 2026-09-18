import type { LedgerEntry } from "@/features/gamification/loaders";

/**
 * Plan 151 §0.2 — the ledger exists to make one promise visible: no reward
 * without a checked source. Each row names the event that paid it.
 */
export function ProofLedger({ entries }: { entries: LedgerEntry[] }) {
  return (
    <section
      aria-label="Proof ledger"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
        Proof ledger
      </p>
      <p className="mt-1 text-xs text-[#8F8F8F]">
        Every reward points at work the platform checked.
      </p>

      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-[#CDD3D3] p-4 text-sm text-[#626262]">
          Nothing yet. Rewards appear the moment your work is checked — logins
          and clicks earn nothing.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-xl border border-[#E9E9E9] bg-[#F4F4F4] px-3 py-2"
            >
              <p className="font-mono text-[11px] text-[#03535F]">{entry.eventType}</p>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-sm text-[#111111]">
                  {entry.label}
                </p>
                {entry.amount != null ? (
                  <p className="shrink-0 font-display text-sm font-bold tabular-nums text-[#111111]">
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount.toLocaleString("en-IN")}
                  </p>
                ) : entry.note ? (
                  <p className="shrink-0 text-xs text-[#8F8F8F]">{entry.note}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
