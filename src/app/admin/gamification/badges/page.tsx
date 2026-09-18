import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";

export const metadata = { title: "Gamification badges | Admin" };

export default async function AdminGamificationBadgesPage() {
  await requireAdmin();
  const badges = await prisma.badgeDefinition.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      name: true,
      category: true,
      baseRarity: true,
      earnedCount: true,
      isActive: true,
      criteriaVersion: true,
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Badges"
        description="Criteria are a closed Zod union. Changing criteria on a shipped badge bumps the version; existing holders keep it."
      />
      <div className="overflow-hidden rounded-xl border border-[#E9E9E9] bg-white">
        <ul className="divide-y divide-[#E9E9E9]">
          {badges.map((b) => (
            <li key={b.slug} className="px-5 py-3 text-sm">
              <p className="font-medium text-[#353535]">
                {b.name} · {b.slug}
              </p>
              <p className="text-xs text-[#787878]">
                {b.category} · {b.baseRarity} · v{b.criteriaVersion} · {b.earnedCount} holders ·{" "}
                {b.isActive ? "active" : "inactive"}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
