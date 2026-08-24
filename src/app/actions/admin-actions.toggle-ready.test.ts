import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const isAdminEmail = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const findUniqueProfile = vi.hoisted(() => vi.fn());
const updateProfile = vi.hoisted(() => vi.fn());
const createAdminAction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({ requireAdmin, isAdminEmail }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
    studentProfile: { findUnique: findUniqueProfile },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { toggleReadyForInterviewAction } from "@/app/actions/admin-actions";

function tx() {
  return {
    studentProfile: { update: updateProfile },
    adminAction: { create: createAdminAction },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  isAdminEmail.mockResolvedValue(false);
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
});

describe("toggleReadyForInterviewAction", () => {
  it("rejects empty targetUserId before reading profile", async () => {
    await expect(
      toggleReadyForInterviewAction({ targetUserId: "" }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    expect(findUniqueProfile).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns Profile not found when student profile is missing", async () => {
    findUniqueProfile.mockResolvedValue(null);

    await expect(
      toggleReadyForInterviewAction({ targetUserId: "u1" }),
    ).resolves.toEqual({ ok: false, message: "Profile not found" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("flips false→true and audits TOGGLE_READY_FOR_INTERVIEW", async () => {
    findUniqueProfile.mockResolvedValue({ isReadyForInterview: false });

    await expect(
      toggleReadyForInterviewAction({
        targetUserId: "u1",
        reason: "Recruiter request",
      }),
    ).resolves.toEqual({ ok: true, newValue: true });

    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { isReadyForInterview: true },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "u1",
        actionType: "TOGGLE_READY_FOR_INTERVIEW",
        metadata: { newValue: true },
        reason: "Recruiter request",
      },
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("flips true→false when already ready", async () => {
    findUniqueProfile.mockResolvedValue({ isReadyForInterview: true });

    await expect(
      toggleReadyForInterviewAction({ targetUserId: "u2" }),
    ).resolves.toEqual({ ok: true, newValue: false });

    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "u2" },
      data: { isReadyForInterview: false },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { newValue: false },
      }),
    });
  });
});
