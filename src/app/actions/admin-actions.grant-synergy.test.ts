import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const isAdminEmail = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const findUniqueUser = vi.hoisted(() => vi.fn());
const createSynergyEvent = vi.hoisted(() => vi.fn());
const updateUser = vi.hoisted(() => vi.fn());
const updateManyProfile = vi.hoisted(() => vi.fn());
const createAdminAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({ requireAdmin, isAdminEmail }));
vi.mock("@/lib/db", () => ({
  prisma: { $transaction: transaction },
  writeClient: () => ({ $transaction: transaction }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));

import { grantSynergyAction } from "@/app/actions/admin-actions";

function tx() {
  return {
    user: { findUnique: findUniqueUser, update: updateUser },
    synergyEvent: { create: createSynergyEvent },
    studentProfile: { updateMany: updateManyProfile },
    adminAction: { create: createAdminAction },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  isAdminEmail.mockResolvedValue(false);
  createSynergyEvent.mockResolvedValue({ id: "grant-evt-1" });
  transaction.mockImplementation(async (fn: (client: ReturnType<typeof tx>) => unknown) =>
    fn(tx()),
  );
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
    findUniqueUser.mockResolvedValue({
      email: "student@abtalks.dev",
      role: Role.STUDENT,
      studentProfile: { id: "sp1" },
      hackathonParticipant: null,
    });
    await expect(
      grantSynergyAction({
        targetUserId: "u1",
        points: "3000" as unknown as number,
      }),
    ).resolves.toEqual({ ok: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { synergyPoints: { increment: 3000 } },
    });
  });
});

describe("grantSynergyAction write path", () => {
  it("credits User + StudentProfile wallets and records COMMUNITY_GRANT", async () => {
    findUniqueUser.mockResolvedValue({
      email: "student@abtalks.dev",
      role: Role.STUDENT,
      studentProfile: { id: "sp1" },
      hackathonParticipant: null,
    });

    await expect(
      grantSynergyAction({
        targetUserId: "u1",
        points: 250,
        reason: "Campus ambassador bonus",
      }),
    ).resolves.toEqual({ ok: true });

    expect(createSynergyEvent).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        points: 250,
        type: "COMMUNITY_GRANT",
        reason: "Campus ambassador bonus",
        createdByAdminId: "admin-1",
      },
      select: { id: true },
    });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { synergyPoints: { increment: 250 } },
    });
    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { synergyPoints: { increment: 250 } },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "u1",
        actionType: "GRANT_SYNERGY",
        metadata: { points: 250 },
        reason: "Campus ambassador bonus",
      },
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rejects missing students, admins, and non-registered targets", async () => {
    findUniqueUser.mockResolvedValueOnce(null);
    await expect(
      grantSynergyAction({ targetUserId: "missing", points: 10 }),
    ).resolves.toEqual({
      ok: false,
      message: "Registered student not found",
    });

    findUniqueUser.mockResolvedValueOnce({
      email: "admin-target@x.com",
      role: Role.STUDENT,
      studentProfile: { id: "sp1" },
      hackathonParticipant: null,
    });
    isAdminEmail.mockResolvedValueOnce(true);
    await expect(
      grantSynergyAction({ targetUserId: "admin-user", points: 10 }),
    ).resolves.toEqual({
      ok: false,
      message: "Registered student not found",
    });

    findUniqueUser.mockResolvedValueOnce({
      email: "bare@abtalks.dev",
      role: Role.STUDENT,
      studentProfile: null,
      hackathonParticipant: null,
    });
    await expect(
      grantSynergyAction({ targetUserId: "bare", points: 10 }),
    ).resolves.toEqual({
      ok: false,
      message: "Registered student not found",
    });

    expect(createSynergyEvent).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
