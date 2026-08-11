import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { getDemandBoard } from "@/features/hire/demand-board";

export const metadata: Metadata = {
  title: "Hire demand | Admin",
};

export default async function AdminHireDemandPage() {
  await requireAdmin();
  const result = await getDemandBoard();

  if (!result.ok) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 p-6">
        <h1 className="font-display text-2xl font-bold">Hire demand</h1>
        <p className="text-sm text-muted-foreground">{result.message}</p>
      </div>
    );
  }

  const { rows, totalRequests, activeRequests, matchedRequests } = result.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Hire demand</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated from Scout requirements — use this to decide what to train
          next.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total requests" value={totalRequests} />
        <Stat label="Active / draft" value={activeRequests} />
        <Stat label="Matched" value={matchedRequests} />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Scout requirements yet. When recruiters use /hire, stacks appear
          here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Stack</th>
                <th className="px-3 py-2 font-medium">Requests</th>
                <th className="px-3 py-2 font-medium">Open</th>
                <th className="px-3 py-2 font-medium">Median salary</th>
                <th className="px-3 py-2 font-medium">Seniority</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.stackToken} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{r.stackToken}</td>
                  <td className="px-3 py-2 tabular-nums">{r.requestCount}</td>
                  <td className="px-3 py-2 tabular-nums">{r.activeCount}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.medianSalary != null
                      ? `₹${r.medianSalary.toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.seniorities.join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
