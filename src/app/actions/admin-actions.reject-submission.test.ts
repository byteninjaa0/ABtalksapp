import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const getCurrentDayNumber = vi.hoisted(() => vi.fn());
const computeStreakStats = vi.hoisted(() => vi.fn());

const findUniqueSubmission = vi.hoisted(() => vi.fn());
const findUniqueSynergyEvent = vi.hoisted(() => vi.fn());
const createSynergyEvent = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const findUniqueProfile = vi.hoisted(() => vi.fn());
const updateProfile = vi.hoisted(() => vi.fn());
const deleteSubmission = vi.hoisted(() => vi.fn());
const countSubmissions = vi.hoisted(() => vi.fn());
const findFirstSubmission = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/date-utils", () => ({ getCurrentDayNumber }));
vi.mock("@/features/submission/streak-utils", () => ({ computeStreakStats }));

import { rejectSubmissionAction } from "@/app/actions/admin-actions";

function tx() {
  return {
    submission: {
      findUnique: findUniqueSubmission,
      delete: deleteSubmission,
      count: countSubmissions,
      findFirst: findFirstSubmission,
    },
    synergyEvent: {
      findUnique: findUniqueSynergyEvent,
      create: createSynergyEvent,
    },
    user: { update: updateUser },
    studentProfile: {
      findUnique: findUniqueProfile,
      update: updateProfile,
    },
    enrollment: { update: updateEnrollment },
    adminAction: { create: createAdminAction },
  };
}

const enrollmentShape = {
  id: "enr-1",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  challenge: { startsAt: new Date("2026-01-01T00:00:00.000Z") },
};

const baseSubmission = {
  id: "sub-1",
  userId: "user-1",
  enrollmentId: "enr-1",
  dayNumber: 12,
  githubUrl: "https://github.com/org/repo/pull/1",
  enrollment: enrollmentShape,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
  getCurrentDayNumber.mockReturnValue(12);
  computeStreakStats.mockResolvedValue({ currentStreak: 3, longestStreak: 5 });
  countSubmissions.mockResolvedValue(11);
  findFirstSubmission.mockResolvedValue({ dayNumber: 11 });
  findUniqueProfile.mockResolvedValue({ synergyPoints: 40 });
  deleteSubmission.mockResolvedValue({});
  updateEnrollment.mockResolvedValue({});
  createAdminAction.mockResolvedValue({});
  createSynergyEvent.mockResolvedValue({});
  updateUser.mockResolvedValue({ synergyPoints: 40 });
  updateProfile.mockResolvedValue({});
});

describe("rejectSubmissionAction input validation", () => {
  it("rejects empty submissionId before opening a transaction", async () => {
    await expect(
      rejectSubmissionAction({ submissionId: "" }),
    ).resolves.toEqual({ ok: false, message: "Invalid input" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("rejectSubmissionAction debit clamp + ledger", () => {
  it("returns not-found when the submission is missing", async () => {
    findUniqueSubmission.mockResolvedValue(null);

    await expect(
      rejectSubmissionAction({ submissionId: "missing" }),
    ).resolves.toEqual({
      ok: false,
      message: "Submission not found",
    });
    expect(deleteSubmission).not.toHaveBeenCalled();
  });

  it("fully debits when wallet covers submission points (no reconciliation)", async () => {
    findUniqueSubmission.mockResolvedValue(baseSubmission);
    findUniqueSynergyEvent.mockResolvedValue({ points: 10 });
    // Lock read then unused second return if any
    updateUser
      .mockResolvedValueOnce({ synergyPoints: 40 })
      .mockResolvedValueOnce({ synergyPoints: 30 });
    findUniqueProfile.mockResolvedValue({ synergyPoints: 40 });

    await expect(
      rejectSubmissionAction({
        submissionId: "sub-1",
        reason: "Plagiarism",
      }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).toHaveBeenNthCalledWith(1, {
      where: { id: "user-1" },
      data: { synergyPoints: { increment: 0 } },
      select: { synergyPoints: true },
    });
    expect(updateUser).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1" },
      data: { synergyPoints: { decrement: 10 } },
    });
    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: 30 },
    });
    expect(createSynergyEvent).not.toHaveBeenCalled();
    expect(deleteSubmission).toHaveBeenCalledWith({ where: { id: "sub-1" } });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "user-1",
        actionType: "REJECT_SUBMISSION",
        metadata: {
          submissionId: "sub-1",
          dayNumber: 12,
          githubUrl: "https://github.com/org/repo/pull/1",
        },
        reason: "Plagiarism",
      },
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("clamps at zero and writes BALANCE_RECONCILIATION for already-spent points", async () => {
    findUniqueSubmission.mockResolvedValue(baseSubmission);
    findUniqueSynergyEvent.mockResolvedValue({ points: 25 });
    // Wallet only has 7 SP left (rest already redeemed)
    updateUser
      .mockResolvedValueOnce({ synergyPoints: 7 })
      .mockResolvedValueOnce({ synergyPoints: 0 });
    findUniqueProfile.mockResolvedValue({ synergyPoints: 7 });

    await expect(
      rejectSubmissionAction({ submissionId: "sub-1" }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).toHaveBeenNthCalledWith(2, {
      where: { id: "user-1" },
      data: { synergyPoints: { decrement: 7 } },
    });
    expect(updateProfile).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { synergyPoints: 0 },
    });
    expect(createSynergyEvent).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        points: 18,
        type: "BALANCE_RECONCILIATION",
        reason:
          "Clamped synergy to 0 after reject removed submission points that were already spent.",
      },
    });
  });

  it("skips debit and reconciliation when there is no submission synergy event", async () => {
    findUniqueSubmission.mockResolvedValue(baseSubmission);
    findUniqueSynergyEvent.mockResolvedValue(null);

    await expect(
      rejectSubmissionAction({ submissionId: "sub-1" }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).not.toHaveBeenCalled();
    expect(createSynergyEvent).not.toHaveBeenCalled();
    expect(deleteSubmission).toHaveBeenCalled();
  });

  it("skips debit when synergy event points are zero", async () => {
    findUniqueSubmission.mockResolvedValue(baseSubmission);
    findUniqueSynergyEvent.mockResolvedValue({ points: 0 });

    await expect(
      rejectSubmissionAction({ submissionId: "sub-1" }),
    ).resolves.toEqual({ ok: true });

    expect(updateUser).not.toHaveBeenCalled();
    expect(createSynergyEvent).not.toHaveBeenCalled();
  });

  it("recomputes enrollment counters and streaks after delete", async () => {
    findUniqueSubmission.mockResolvedValue(baseSubmission);
    findUniqueSynergyEvent.mockResolvedValue(null);
    countSubmissions.mockResolvedValue(11);
    findFirstSubmission.mockResolvedValue({ dayNumber: 11 });
    computeStreakStats.mockResolvedValue({
      currentStreak: 2,
      longestStreak: 8,
    });

    await expect(
      rejectSubmissionAction({ submissionId: "sub-1" }),
    ).resolves.toEqual({ ok: true });

    expect(updateEnrollment).toHaveBeenNthCalledWith(1, {
      where: { id: "enr-1" },
      data: {
        daysCompleted: 11,
        lastSubmittedDay: 11,
        status: "ACTIVE",
        completedAt: null,
      },
    });
    expect(getCurrentDayNumber).toHaveBeenCalledWith(
      enrollmentShape,
      enrollmentShape.challenge,
    );
    expect(computeStreakStats).toHaveBeenCalledWith(expect.anything(), {
      enrollmentId: "enr-1",
      endDay: 12,
    });
    expect(updateEnrollment).toHaveBeenNthCalledWith(2, {
      where: { id: "enr-1" },
      data: {
        currentStreak: 2,
        longestStreak: 8,
      },
    });
  });
});
