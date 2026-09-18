import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";
import { resolveFlagAction } from "@/app/actions/admin-gamification-actions";
import { formatDateTimeIST } from "@/lib/date-utils";

export const metadata = { title: "Gamification flags | Admin" };

export default async function AdminGamificationFlagsPage() {
  await requireAdmin();
  const flags = await prisma.gamificationFlag.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      kind: true,
      severity: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Flags"
        description="HIGH pauses badge awards and board eligibility. XP still accrues on hold."
      />
      <ul className="divide-y divide-[#E9E9E9] overflow-hidden rounded-xl border border-[#E9E9E9] bg-white">
        {flags.length === 0 ? (
          <li className="px-5 py-8 text-sm text-[#787878]">No open flags.</li>
        ) : (
          flags.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-medium text-[#353535]">
                  {f.kind} · {f.severity}
                </p>
                <p className="text-xs text-[#787878]">
                  {f.userId} · {formatDateTimeIST(f.createdAt)}
                </p>
              </div>
              <form
                action={async (formData) => {
                  "use server";
                  await resolveFlagAction({
                    flagId: f.id,
                    status: "CLEARED",
                    resolution: String(formData.get("resolution") ?? ""),
                  });
                }}
              >
                <input
                  name="resolution"
                  required
                  minLength={10}
                  placeholder="Resolution (10+ chars)"
                  className="mr-2 h-9 rounded-lg border border-[#E0E0E0] px-2 text-xs"
                />
                <button type="submit" className="h-9 rounded-lg bg-[#03535F] px-3 text-xs font-semibold text-white">
                  Clear
                </button>
              </form>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
