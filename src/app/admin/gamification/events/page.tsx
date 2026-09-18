import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";
import { replayEventAction } from "@/app/actions/admin-gamification-actions";
import { formatDateTimeIST } from "@/lib/date-utils";

export const metadata = { title: "Gamification events | Admin" };

export default async function AdminGamificationEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const events = await prisma.gamificationEvent.findMany({
    where: {
      ...(params.status
        ? { status: params.status as never }
        : {}),
      ...(params.type ? { type: params.type } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      userId: true,
      attempts: true,
      lastError: true,
      createdAt: true,
      isBackfill: true,
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Event log"
        description="Replay FAILED or DEAD events. Derivation from source tables heals dropped after() work."
      />
      <div className="overflow-hidden rounded-xl border border-[#E9E9E9] bg-white">
        {events.length === 0 ? (
          <p className="px-5 py-8 text-sm text-[#787878]">No events yet.</p>
        ) : (
          <ul className="divide-y divide-[#E9E9E9]">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-[#353535]">
                    {e.type} · {e.status}
                    {e.isBackfill ? " · backfill" : ""}
                  </p>
                  <p className="text-xs text-[#787878]">
                    {e.userId} · {formatDateTimeIST(e.createdAt)} · attempts {e.attempts}
                    {e.lastError ? ` · ${e.lastError}` : ""}
                  </p>
                </div>
                {(e.status === "FAILED" || e.status === "DEAD") && (
                  <form
                    action={async () => {
                      "use server";
                      await replayEventAction({ eventId: e.id });
                    }}
                  >
                    <button
                      type="submit"
                      className="h-9 rounded-lg border border-[#E0E0E0] px-3 text-xs font-medium"
                    >
                      Replay
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
