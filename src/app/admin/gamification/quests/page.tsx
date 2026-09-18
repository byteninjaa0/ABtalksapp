import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";

export const metadata = { title: "Gamification quests | Admin" };

export default async function AdminGamificationQuestsPage() {
  await requireAdmin();
  const quests = await prisma.questDefinition.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      name: true,
      cadence: true,
      segment: true,
      xpReward: true,
      isActive: true,
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Quests"
        description="V1: First Steps, Hackathon Arrival, Comeback. Tasks must map to a verifiable event."
      />
      <ul className="divide-y divide-[#E9E9E9] overflow-hidden rounded-xl border border-[#E9E9E9] bg-white">
        {quests.map((q) => (
          <li key={q.slug} className="px-5 py-3 text-sm">
            <p className="font-medium text-[#353535]">{q.name}</p>
            <p className="text-xs text-[#787878]">
              {q.cadence} · {q.segment ?? "everyone"} · +{q.xpReward} XP ·{" "}
              {q.isActive ? "active" : "inactive"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
