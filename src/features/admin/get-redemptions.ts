import { RedemptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AdminRedemptionRow = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  studentName: string;
  email: string;
  itemTitle: string;
  /** Null for items with no size, and for redemptions predating sizes. */
  selectedSize: string | null;
  costSP: number;
  status: RedemptionStatus;
  shippingAddress: string;
  recipientPhone: string;
  trackingNote: string | null;
};

export async function getRedemptions(filter: {
  status?: RedemptionStatus | "ALL";
}): Promise<AdminRedemptionRow[]> {
  const rows = await prisma.redemption.findMany({
    where:
      filter.status && filter.status !== "ALL"
        ? { status: filter.status }
        : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      costSP: true,
      itemTitle: true,
      selectedSize: true,
      status: true,
      shippingAddress: true,
      recipientPhone: true,
      trackingNote: true,
      user: {
        select: {
          email: true,
          studentProfile: { select: { fullName: true } },
        },
      },
    },
    take: 500,
  });

  return rows.map((r) => ({
    id: r.id,
    createdAtIso: r.createdAt.toISOString(),
    updatedAtIso: r.updatedAt.toISOString(),
    studentName: r.user.studentProfile?.fullName?.trim() || r.user.email,
    email: r.user.email,
    itemTitle: r.itemTitle,
    selectedSize: r.selectedSize,
    costSP: r.costSP,
    status: r.status,
    shippingAddress: r.shippingAddress,
    recipientPhone: r.recipientPhone,
    trackingNote: r.trackingNote,
  }));
}
