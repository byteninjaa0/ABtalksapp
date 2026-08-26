import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueAccount = vi.hoisted(() => vi.fn());
const findUniqueUser = vi.hoisted(() => vi.fn());
const isNewPointsRepoEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    pointsAccount: { findUnique: findUniqueAccount },
    user: { findUnique: findUniqueUser },
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  isNewPointsRepoEnabled,
}));

import { getBalance } from "@/repositories/points";

beforeEach(() => {
  vi.clearAllMocks();
  isNewPointsRepoEnabled.mockReturnValue(false);
});

afterEach(() => {
  isNewPointsRepoEnabled.mockReturnValue(false);
});

describe("getBalance", () => {
  it("reads User.synergyPoints when ENABLE_NEW_POINTS is off", async () => {
    findUniqueUser.mockResolvedValue({ synergyPoints: 125 });

    await expect(getBalance("user_1")).resolves.toBe(125);
    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { id: "user_1" },
      select: { synergyPoints: true },
    });
    expect(findUniqueAccount).not.toHaveBeenCalled();
  });

  it("returns 0 when the legacy user row is missing", async () => {
    findUniqueUser.mockResolvedValue(null);
    await expect(getBalance("missing")).resolves.toBe(0);
  });

  it("reads PointsAccount.balance when ENABLE_NEW_POINTS is on", async () => {
    isNewPointsRepoEnabled.mockReturnValue(true);
    findUniqueAccount.mockResolvedValue({ balance: 40 });

    await expect(getBalance("user_1")).resolves.toBe(40);
    expect(findUniqueAccount).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      select: { balance: true },
    });
    expect(findUniqueUser).not.toHaveBeenCalled();
  });

  it("returns 0 when the new points account is missing", async () => {
    isNewPointsRepoEnabled.mockReturnValue(true);
    findUniqueAccount.mockResolvedValue(null);
    await expect(getBalance("user_1")).resolves.toBe(0);
  });

  it("accepts a transaction client for redeem/admin paths", async () => {
    const tx = {
      pointsAccount: { findUnique: vi.fn() },
      user: {
        findUnique: vi.fn().mockResolvedValue({ synergyPoints: 7 }),
      },
    };

    await expect(getBalance("user_1", tx as never)).resolves.toBe(7);
    expect(tx.user.findUnique).toHaveBeenCalled();
    expect(findUniqueUser).not.toHaveBeenCalled();
  });
});
