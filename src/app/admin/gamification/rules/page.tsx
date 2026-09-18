import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";
import { upsertGamificationRuleAction } from "@/app/actions/admin-gamification-actions";

export const metadata = { title: "Gamification rules | Admin" };

export default async function AdminGamificationRulesPage() {
  await requireAdmin();
  const rules = await prisma.gamificationRule.findMany({
    orderBy: { key: "asc" },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Rules"
        description="Forward-only. Changes apply to new events only. History is never rewritten."
      />
      <ul className="space-y-3">
        {rules.map((rule) => (
          <li key={rule.key} className="rounded-xl border border-[#E9E9E9] bg-white p-4 text-sm">
            <p className="font-medium text-[#353535]">
              {rule.key} · {rule.eventType} · {rule.category}
            </p>
            <p className="text-[#787878]">
              amount {rule.xpAmount ?? "formula"} · active {String(rule.isActive)}
            </p>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              action={async (formData) => {
                "use server";
                await upsertGamificationRuleAction({
                  key: rule.key,
                  eventType: rule.eventType,
                  category: rule.category,
                  xpAmount: rule.xpAmount,
                  multiplierBp: rule.multiplierBp,
                  dailyCap: rule.dailyCap,
                  weeklyCap: rule.weeklyCap,
                  lifetimeCap: rule.lifetimeCap,
                  isActive: formData.get("isActive") === "on",
                  reason: String(formData.get("reason") ?? ""),
                });
              }}
            >
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="isActive" defaultChecked={rule.isActive} />
                Active
              </label>
              <input
                name="reason"
                required
                minLength={10}
                placeholder="Reason (10+ chars)"
                className="h-9 rounded-lg border border-[#E0E0E0] px-2 text-xs"
              />
              <button type="submit" className="h-9 rounded-lg bg-[#03535F] px-3 text-xs font-semibold text-white">
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
