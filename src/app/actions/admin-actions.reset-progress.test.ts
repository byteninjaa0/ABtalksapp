import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());
const sendChallengeResetEmail = vi.hoisted(() => vi.fn());
const findUniqueUser = vi.hoisted(() => vi.fn());

const findFirstEnrollment = vi.hoisted(() => vi.fn());
const aggregateSynergy = vi.hoisted(() => vi.fn());
const createSynergyEvent = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const findUniqueProfile = vi.hoisted(() => vi.fn());
const updateProfile = vi.hoisted(() => vi.fn());
const updateManyProfile = vi.hoisted(() => vi.fn());
const deleteManySubmission = vi.hoisted(() => vi.fn());
const updateEnrollment = vi.hoisted(() => vi.fn());
const createAdminAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin,
  isAdminEmail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
    user: { findUnique: findUniqueUser },
  },
  writeClient: () => ({ $transaction: transaction }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/features/email/challenge-reset-email", () => ({
  sendChallengeResetEmail,
}));

import { resetProgressAction } from "@/app/actions/admin-actions";

function tx() {
  return {
    enrollment: {
      findFirst: findFirstEnrollment,
      update: updateEnrollment,
    },
    synergyEvent: {
      aggregate: aggregateSynergy,
      create: createSynergyEvent,
    },
    user: { update: updateUser },
    studentProfile: {
      findUnique: findUniqueProfile,
      update: updateProfile,
      updateMany: updateManyProfile,
    },
    submission: { deleteMany: deleteManySubmission },
    adminAction: { create: createAdminAction },
  };
}

const enrollment = {
  id: "enr-1",
  domain: "AI",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
  // after() should run the callback immediately in tests
  after.mockImplementation((fn: () => unknown) => {
    void fn();
  });
  findFirstEnrollment.mockResolvedValue(enrollment);
  aggregateSynergy.mockResolvedValue({ _sum: { points: 0 } });
  updateUser.mockResolvedValue({ id: "user-1", synergyPoints: 0 });
  findUniqueProfile.mockResolvedValue({ synergyPoints: 0 });
  updateProfile.mockResolvedValue({});
  updateManyProfile.mockResolvedValue({ count: 1 });
  deleteManySubmission.mockResolvedValue({ count: 3 });
  updateEnrollment.mockResolvedValue({});
  createAdminAction.mockResolvedValue({});
  createSynergyEvent.mockResolvedValue({});
  findUniqueUser.mockResolvedValue(null);
  sendChallengeResetEmail.mockResolvedValue(undefined);
});

describe("resetProgressAction input validation", () => {
  it("rejects empty targetUserId before opening a transaction", async () => {
    await expect(resetProgressAction({ targetUserId: "" })).resolves.toEqual({
      ok: false,
      message: "Invalid input",
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("resetProgressAction debit clamp + ledger", () => {
  it("returns No enrollment when the student has none", async () => {
    findFirstEnrollment.mockResolvedValue(null);

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: false, message: "No enrollment" });
    expect(deleteManySubmission).not.toHaveBeenCalled();
  });

  it("serializes with a wallet lock even when no submission points exist", async () => {
    aggregateSynergy.mockResolvedValue({ _sum: { points: 0 } });

    await expect(
      resetProgressAction({ targetUserId: "user-1", reason: "Fresh start" }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { synergyPoints: { increment: 0 } },
      select: { id: true },
    });
    expect(createSynergyEvent).not.toHaveBeenCalled();
    expect(deleteManySubmission).toHaveBeenCalledWith({
      where: { enrollmentId: "enr-1" },
    });
    expect(updateEnrollment).toHaveBeenCalledWith({
      where: { id: "enr-1" },
      data: {
        daysCompleted: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastSubmittedDay: null,
        status: "ACTIVE",
        completedAt: null,
        startedAt: expect.any(Date),
      },
    });
    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { isReadyForInterview: false },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "user-1",
        actionType: "RESET_PROGRESS",
        reason: "Fresh start",
      },
    });
    expect(sendChallengeResetEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("fully debits when wallet covers aggregated submission points (no reconciliation)", async () => {
    aggregateSynergy.mockResolvedValue({ _sum: { points: 40 } });
    // 1) serialize lock (id), 2) debit lock (balance), 3) decrement
    updateUser
      .mockResolvedValueOnce({ id: "user-1" })
      .mockResolvedValueOnce({ synergyPoints: 55 })
      .mockResolvedValueOnce({ synergyPoints: 15 });
    findUniqueProfile.mockResolvedValue({ synergyPoints: 55 });

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: true });

    expect(aggregateSynergy).toHaveBeenCalledWith({
      where: {
        enrollmentId: "enr-1",
        type: "SUBMISSION",
      },
      _sum: { points: true },
    });
    expect(updateUser).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1" },
      data: { synergyPoints: { increment: 0 } },
      select: { synergyPoints: true },
    });
    expect(updateUser).toHaveBeenNthCalledWith(3, {
      where: { id: "user-1" },
      data: { synergyPoints: { decrement: 40 } },
    });
    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: 15 },
    });
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });

  it("clamps at zero and writes BALANCE_RECONCILIATION for already-spent submission points", async () => {
    aggregateSynergy.mockResolvedValue({ _sum: { points: 50 } });
    // Wallet only has 12 SP left (rest already redeemed)
    updateUser
      .mockResolvedValueOnce({ id: "user-1" })
      .mockResolvedValueOnce({ synergyPoints: 12 })
      .mockResolvedValueOnce({ synergyPoints: 0 });
    findUniqueProfile.mockResolvedValue({ synergyPoints: 12 });

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).toHaveBeenNthCalledWith(3, {
      where: { id: "user-1" },
      data: { synergyPoints: { decrement: 12 } },
    });
    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: 0 },
    });
    expect(createSynergyEvent).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        points: 38,
        type: "BALANCE_RECONCILIATION",
        reason:
          "Clamped synergy to 0 after reset removed submission points that were already spent.",
      },
      select: { id: true },
    });
  });

  it("skips debit and reconciliation when aggregate submission points are null", async () => {
    aggregateSynergy.mockResolvedValue({ _sum: { points: null } });

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: true });

    // Only the serialize lock — no debit path
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });
});

describe("resetProgressAction Claude reset email", () => {
  it("schedules a reset email for CLAUDE enrollments after the transaction", async () => {
    findFirstEnrollment.mockResolvedValue({ id: "enr-1", domain: "CLAUDE" });
    aggregateSynergy.mockResolvedValue({ _sum: { points: 0 } });
    findUniqueUser.mockResolvedValue({
      email: "student@example.com",
      studentProfile: { fullName: "Ada Lovelace" },
    });

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: true });

    expect(findUniqueUser).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: {
        email: true,
        studentProfile: { select: { fullName: true } },
      },
    });
    expect(after).toHaveBeenCalled();
    expect(sendChallengeResetEmail).toHaveBeenCalledWith({
      to: "student@example.com",
      firstName: "Ada",
      dashboardUrl: expect.stringMatching(/\/dashboard$/),
    });
  });

  it("does not schedule email when CLAUDE enrollee has no email", async () => {
    findFirstEnrollment.mockResolvedValue({ id: "enr-1", domain: "CLAUDE" });
    findUniqueUser.mockResolvedValue({
      email: null,
      studentProfile: { fullName: "No Mail" },
    });

    await expect(
      resetProgressAction({ targetUserId: "user-1" }),
    ).resolves.toEqual({ ok: true });

    expect(sendChallengeResetEmail).not.toHaveBeenCalled();
  });
});
