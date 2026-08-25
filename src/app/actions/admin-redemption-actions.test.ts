import { RedemptionStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const findUniqueRedemption = vi.hoisted(() => vi.fn());
const updateManyRedemption = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const updateManyProfile = vi.hoisted(() => vi.fn());
const createSynergyEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: transaction },
  writeClient: () => ({ $transaction: transaction }),
}));

import { updateRedemptionStatusAction } from "@/app/actions/admin-redemption-actions";

function tx() {
  return {
    redemption: {
      findUnique: findUniqueRedemption,
      updateMany: updateManyRedemption,
    },
    user: { update: updateUser },
    studentProfile: { updateMany: updateManyProfile },
    synergyEvent: { create: createSynergyEvent },
  };
}

const REDEMPTION_ID = "cm4redemption000000000001";

function form(data: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(data)) {
    fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
});

describe("updateRedemptionStatusAction", () => {
  it("rejects invalid form payloads before writing", async () => {
    await expect(
      updateRedemptionStatusAction(form({ redemptionId: "", nextStatus: "SHIPPED" })),
    ).resolves.toMatchObject({ ok: false });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("blocks illegal status transitions", async () => {
    findUniqueRedemption.mockResolvedValue({
      status: RedemptionStatus.FULFILLED,
      userId: "user-1",
      costSP: 100,
    });

    await expect(
      updateRedemptionStatusAction(
        form({
          redemptionId: REDEMPTION_ID,
          nextStatus: RedemptionStatus.CANCELLED,
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Cannot transition FULFILLED → CANCELLED",
    });
    expect(updateManyRedemption).not.toHaveBeenCalled();
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });

  it("returns a concurrency conflict when status raced away", async () => {
    findUniqueRedemption.mockResolvedValue({
      status: RedemptionStatus.PENDING,
      userId: "user-1",
      costSP: 50,
    });
    updateManyRedemption.mockResolvedValue({ count: 0 });

    await expect(
      updateRedemptionStatusAction(
        form({
          redemptionId: REDEMPTION_ID,
          nextStatus: RedemptionStatus.SHIPPED,
        }),
      ),
    ).resolves.toEqual({
      ok: false,
      message: "Redemption status changed; refresh and try again",
    });
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });

  it("refunds User + StudentProfile wallets and writes REDEEM_REFUND on cancel", async () => {
    findUniqueRedemption.mockResolvedValue({
      status: RedemptionStatus.PENDING,
      userId: "user-1",
      costSP: 120,
    });
    updateManyRedemption.mockResolvedValue({ count: 1 });
    updateUser.mockResolvedValue({});
    updateManyProfile.mockResolvedValue({ count: 1 });
    createSynergyEvent.mockResolvedValue({});

    await expect(
      updateRedemptionStatusAction(
        form({
          redemptionId: REDEMPTION_ID,
          nextStatus: RedemptionStatus.CANCELLED,
          trackingNote: "Out of stock",
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(updateManyRedemption).toHaveBeenCalledWith({
      where: { id: REDEMPTION_ID, status: RedemptionStatus.PENDING },
      data: {
        status: RedemptionStatus.CANCELLED,
        trackingNote: "Out of stock",
      },
    });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { synergyPoints: { increment: 120 } },
    });
    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: { increment: 120 } },
    });
    expect(createSynergyEvent).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        points: 120,
        type: "REDEEM_REFUND",
        reason: `Refund for cancelled redemption ${REDEMPTION_ID}`,
      },
    });
  });

  it("ships without refunding synergy", async () => {
    findUniqueRedemption.mockResolvedValue({
      status: RedemptionStatus.PENDING,
      userId: "user-1",
      costSP: 80,
    });
    updateManyRedemption.mockResolvedValue({ count: 1 });

    await expect(
      updateRedemptionStatusAction(
        form({
          redemptionId: REDEMPTION_ID,
          nextStatus: RedemptionStatus.SHIPPED,
        }),
      ),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).not.toHaveBeenCalled();
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });
});
