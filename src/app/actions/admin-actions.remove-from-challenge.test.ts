import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

const findFirstEnrollment = vi.hoisted(() => vi.fn());
const updateEnrollment = vi.hoisted(() => vi.fn());
const createAdminAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin,
  isAdminEmail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: transaction },
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { removeFromChallengeAction } from "@/app/actions/admin-actions";

function tx() {
  return {
    enrollment: {
      findFirst: findFirstEnrollment,
      update: updateEnrollment,
    },
    adminAction: { create: createAdminAction },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
  findFirstEnrollment.mockResolvedValue({ id: "enr-1" });
  updateEnrollment.mockResolvedValue({});
  createAdminAction.mockResolvedValue({});
});

describe("removeFromChallengeAction", () => {
  it("rejects empty targetUserId before opening a transaction", async () => {
    await expect(
      removeFromChallengeAction({ targetUserId: "" }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns error when there is no ACTIVE enrollment", async () => {
    findFirstEnrollment.mockResolvedValue(null);

    await expect(
      removeFromChallengeAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: false, message: "No active enrollment" });
    expect(updateEnrollment).not.toHaveBeenCalled();
  });

  it("marks ACTIVE enrollment ABANDONED and records admin action", async () => {
    await expect(
      removeFromChallengeAction({
        targetUserId: "user-1",
        reason: "Inactive",
      }),
    ).resolves.toEqual({ ok: true });

    expect(findFirstEnrollment).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE" },
      select: { id: true },
    });
    expect(updateEnrollment).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: { status: "ABANDONED" },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "user-1",
        actionType: "REMOVE_FROM_CHALLENGE",
        reason: "Inactive",
      },
    });
    expect(revalidatePath).toHaveBeenCalled();
  });
});
