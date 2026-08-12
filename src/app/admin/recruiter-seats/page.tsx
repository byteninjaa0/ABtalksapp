import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import {
  RecruiterSeatsPanel,
  type SeatRow,
} from "@/components/admin/recruiter-seats-panel";

export const metadata: Metadata = {
  title: "Recruiter seats | Admin",
};

export default async function AdminRecruiterSeatsPage() {
  await requireAdmin();

  const seats = await prisma.verifiedRecruiterSeat.findMany({
    orderBy: [{ active: "desc" }, { verifiedAt: "desc" }],
    take: 500,
    select: {
      id: true,
      email: true,
      company: true,
      contactName: true,
      active: true,
      notes: true,
      verifiedAt: true,
    },
  });

  // Which seats have actually signed up, so the list says who is waiting.
  const users = await prisma.user.findMany({
    where: { email: { in: seats.map((s) => s.email) } },
    select: { email: true },
  });
  const withAccount = new Set(users.map((u) => u.email));

  const rows: SeatRow[] = seats.map((s) => ({
    id: s.id,
    email: s.email,
    company: s.company,
    contactName: s.contactName,
    active: s.active,
    notes: s.notes,
    verifiedAt: s.verifiedAt.toISOString(),
    hasAccount: withAccount.has(s.email),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Recruiter seats
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recruiter access is granted by this list, not by anything someone
          types on the signup form. A candidate cannot register their way into
          the recruiter portal.
        </p>
      </div>
      <RecruiterSeatsPanel seats={rows} />
    </div>
  );
}
