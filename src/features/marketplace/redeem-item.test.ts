import { RedemptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  transaction,
  findUniqueItem,
  updateManyUser,
  findUniqueUser,
  updateManyProfile,
  createRedemption,
  findUniqueOrThrowUser,
  createSynergyEvent,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUniqueItem: vi.fn(),
  updateManyUser: vi.fn(),
  findUniqueUser: vi.fn(),
  updateManyProfile: vi.fn(),
  createRedemption: vi.fn(),
  findUniqueOrThrowUser: vi.fn(),
  createSynergyEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
  },
  writeClient: () => ({ $transaction: transaction }),
}));

import { redeemItem } from "@/features/marketplace/redeem-item";

function tx() {
  return {
    marketplaceItem: { findUnique: findUniqueItem },
    user: {
      updateMany: updateManyUser,
      findUnique: findUniqueUser,
      findUniqueOrThrow: findUniqueOrThrowUser,
    },
    studentProfile: { updateMany: updateManyProfile },
    redemption: { create: createRedemption },
    synergyEvent: { create: createSynergyEvent },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
});

const input = {
  userId: "user-1",
  itemId: "item-1",
  shippingAddress: "  12 Main St  ",
  recipientPhone: " 9999999999 ",
};

describe("redeemItem", () => {
  it("rejects missing, inactive, and zero-cost items before debiting", async () => {
    findUniqueItem.mockResolvedValueOnce(null);
    await expect(redeemItem(input)).resolves.toEqual({
      ok: false,
      reason: "not_found",
      message: "Item not found",
    });

    findUniqueItem.mockResolvedValueOnce({
      id: "item-1",
      title: "Sticker",
      costSP: 50,
      active: false,
    });
    await expect(redeemItem(input)).resolves.toEqual({
      ok: false,
      reason: "inactive",
      message: "Item is no longer available",
    });

    findUniqueItem.mockResolvedValueOnce({
      id: "item-1",
      title: "Soon",
      costSP: 0,
      active: true,
    });
    await expect(redeemItem(input)).resolves.toEqual({
      ok: false,
      reason: "inactive",
      message: "This item isn't available for redemption yet.",
    });

    expect(updateManyUser).not.toHaveBeenCalled();
  });

  it("uses conditional User.synergyPoints debit and reports insufficient balance", async () => {
    findUniqueItem.mockResolvedValue({
      id: "item-1",
      title: "Mug",
      costSP: 100,
      active: true,
    });
    updateManyUser.mockResolvedValue({ count: 0 });
    findUniqueUser.mockResolvedValue({ synergyPoints: 40 });

    await expect(redeemItem(input)).resolves.toEqual({
      ok: false,
      reason: "insufficient",
      message: "You need 60 more SP for this item.",
    });

    expect(updateManyUser).toHaveBeenCalledWith({
      where: { id: "user-1", synergyPoints: { gte: 100 } },
      data: { synergyPoints: { decrement: 100 } },
    });
    expect(createRedemption).not.toHaveBeenCalled();
  });

  it("debits the account wallet, mirrors StudentProfile, and writes a REDEEM ledger row", async () => {
    findUniqueItem.mockResolvedValue({
      id: "item-1",
      title: "Mug",
      costSP: 100,
      active: true,
    });
    updateManyUser.mockResolvedValue({ count: 1 });
    updateManyProfile.mockResolvedValue({ count: 1 });
    createRedemption.mockResolvedValue({ id: "red-1" });
    findUniqueOrThrowUser.mockResolvedValue({ synergyPoints: 25 });
    createSynergyEvent.mockResolvedValue({ id: "evt-1" });

    await expect(redeemItem(input)).resolves.toEqual({
      ok: true,
      redemptionId: "red-1",
      newBalance: 25,
    });

    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: { decrement: 100 } },
    });
    expect(createRedemption).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        itemId: "item-1",
        costSP: 100,
        itemTitle: "Mug",
        status: RedemptionStatus.PENDING,
        shippingAddress: "12 Main St",
        recipientPhone: "9999999999",
      }),
      select: { id: true },
    });
    expect(createSynergyEvent).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        points: -100,
        type: "REDEEM",
        reason: "Redeemed Mug (redemptionId=red-1)",
      },
    });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 10000,
    });
  });
});
