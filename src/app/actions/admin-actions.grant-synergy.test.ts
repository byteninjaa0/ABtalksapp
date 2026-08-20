import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const isAdminEmail = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({ requireAdmin, isAdminEmail }));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: transaction },
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { grantSynergyAction } from "@/app/actions/admin-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
});

describe("grantSynergyAction input validation", () => {
  it("rejects points outside 1..3000 before writing", async () => {
    await expect(
      grantSynergyAction({ targetUserId: "u1", points: 0 }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    await expect(
      grantSynergyAction({ targetUserId: "u1", points: 3001 }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    await expect(
      grantSynergyAction({ targetUserId: "u1", points: 1.5 }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects empty targetUserId", async () => {
    await expect(
      grantSynergyAction({ targetUserId: "", points: 10 }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts the new 3000 cap and coerces string points", async () => {
    transaction.mockResolvedValue(undefined);
    await expect(
      grantSynergyAction({
        targetUserId: "u1",
        points: "3000" as unknown as number,
      }),
    ).resolves.toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
