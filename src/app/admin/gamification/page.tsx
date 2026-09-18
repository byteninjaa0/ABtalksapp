import { requireAdmin } from "@/lib/admin-auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StatCard } from "@/components/admin/stat-card";
import { prisma } from "@/lib/db";
import { GamificationEventStatus } from "@prisma/client";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Flag,
  Sparkles,
} from "lucide-react";

export const metadata = { title: "Gamification | Admin" };

export default async function AdminGamificationOverviewPage() {
  await requireAdmin();
  const since = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);
  const [pending, processed, failed, dead, flags, xpToday] = await Promise.all([
    prisma.gamificationEvent.count({
      where: { status: GamificationEventStatus.PENDING },
    }),
    prisma.gamificationEvent.count({
      where: { status: GamificationEventStatus.PROCESSED, createdAt: { gte: since } },
    }),
    prisma.gamificationEvent.count({
      where: { status: GamificationEventStatus.FAILED },
    }),
    prisma.gamificationEvent.count({
      where: { status: GamificationEventStatus.DEAD },
    }),
    prisma.gamificationFlag.count({ where: { status: "OPEN" } }),
    prisma.xpTransaction.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { amount: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Gamification"
        description="Shadow engine: events, XP ledger, badges and quests. XP is not Synergy Points."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Processed (24h)"
          value={processed}
          accent="green"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Pending"
          value={pending}
          accent="blue"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Failed / Dead"
          value={`${failed} / ${dead}`}
          accent="blue"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard
          label="XP issued (24h)"
          value={xpToday._sum.amount ?? 0}
          accent="green"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Open flags"
          value={flags}
          accent="blue"
          icon={<Flag className="h-4 w-4" />}
        />
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/gamification/events" className={buttonVariants({ variant: "outline" })}>
          Event log
        </Link>
        <Link href="/admin/gamification/rules" className={buttonVariants({ variant: "outline" })}>
          Rules
        </Link>
        <Link href="/admin/gamification/badges" className={buttonVariants({ variant: "outline" })}>
          Badges
        </Link>
        <Link href="/admin/gamification/quests" className={buttonVariants({ variant: "outline" })}>
          Quests
        </Link>
        <Link href="/admin/gamification/flags" className={buttonVariants({ variant: "outline" })}>
          Flags
        </Link>
      </nav>
    </div>
  );
}
