import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { prisma } from "@/lib/db";
import {
  adjustXpAction,
  holdUserAction,
  recomputeUserProgressAction,
  revokeBadgeAction,
} from "@/app/actions/admin-gamification-actions";
import { notFound } from "next/navigation";

export const metadata = { title: "Gamification user | Admin" };

export default async function AdminGamificationUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, deletedAt: true, disabledAt: true },
  });
  if (!user) notFound();

  const [progress, ledger, badges, flags] = await Promise.all([
    prisma.userProgress.findUnique({ where: { userId } }),
    prisma.xpTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, amount: true, ruleKey: true, category: true, createdAt: true },
    }),
    prisma.userBadge.findMany({
      where: { userId },
      select: {
        id: true,
        revokedAt: true,
        badge: { select: { name: true, slug: true } },
      },
    }),
    prisma.gamificationFlag.findMany({
      where: { userId, status: "OPEN" },
      select: { id: true, kind: true, severity: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={user.name ?? user.email ?? userId}
        description={`Level ${progress?.level ?? 1} · ${progress?.xpTotal ?? 0} XP · ${progress?.heldAt ? "HELD" : "active"}`}
      />

      <form
        className="flex flex-wrap gap-2 rounded-xl border border-[#E9E9E9] bg-white p-4 text-sm"
        action={async (formData) => {
          "use server";
          await adjustXpAction({
            userId,
            amount: Number(formData.get("amount")),
            reason: String(formData.get("reason") ?? ""),
          });
        }}
      >
        <input name="amount" type="number" required className="h-9 w-24 rounded-lg border px-2" placeholder="±XP" />
        <input name="reason" required minLength={10} className="h-9 flex-1 rounded-lg border px-2" placeholder="Reason" />
        <button type="submit" className="h-9 rounded-lg bg-[#03535F] px-3 text-xs font-semibold text-white">
          Adjust XP
        </button>
      </form>

      <form
        action={async (formData) => {
          "use server";
          await holdUserAction({
            userId,
            hold: !progress?.heldAt,
            reason: String(formData.get("reason") ?? ""),
          });
        }}
        className="flex gap-2"
      >
        <input name="reason" required minLength={10} className="h-9 flex-1 rounded-lg border px-2 text-sm" placeholder="Hold reason" />
        <button type="submit" className="h-9 rounded-lg border px-3 text-xs">
          {progress?.heldAt ? "Unhold" : "Hold"}
        </button>
      </form>

      <form
        action={async () => {
          "use server";
          await recomputeUserProgressAction({ userId });
        }}
      >
        <button type="submit" className="h-9 rounded-lg border px-3 text-xs">
          Recompute progress
        </button>
      </form>

      <section className="rounded-xl border border-[#E9E9E9] bg-white">
        <h2 className="border-b px-5 py-3 font-display text-lg font-semibold">Ledger</h2>
        <ul className="divide-y">
          {ledger.map((row) => (
            <li key={row.id} className="px-5 py-2 text-sm">
              {row.amount > 0 ? "+" : ""}
              {row.amount} · {row.ruleKey} · {row.category}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[#E9E9E9] bg-white">
        <h2 className="border-b px-5 py-3 font-display text-lg font-semibold">Badges</h2>
        <ul className="divide-y">
          {badges.map((b) => (
            <li key={b.id} className="flex items-center justify-between px-5 py-2 text-sm">
              <span>
                {b.badge.name}
                {b.revokedAt ? " (revoked)" : ""}
              </span>
              {!b.revokedAt ? (
                <form
                  action={async (formData) => {
                    "use server";
                    await revokeBadgeAction({
                      userBadgeId: b.id,
                      reason: String(formData.get("reason") ?? ""),
                    });
                  }}
                >
                  <input name="reason" required minLength={10} className="mr-2 h-8 rounded border px-2 text-xs" />
                  <button type="submit" className="text-xs">Revoke</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {flags.length > 0 ? (
        <p className="text-sm text-[#AA821D]">
          Open flags: {flags.map((f) => `${f.kind}/${f.severity}`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
