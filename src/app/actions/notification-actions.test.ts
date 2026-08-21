import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const getNotificationsForUser = vi.hoisted(() => vi.fn());
const createMany = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("@/features/notification/get-notifications", () => ({
  getNotificationsForUser,
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    notificationRead: { createMany },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  getMyNotificationsAction,
  markNotificationsReadAction,
} from "@/app/actions/notification-actions";
import { EMPTY_FEED } from "@/features/notification/types";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getMyNotificationsAction", () => {
  it("returns an empty feed for signed-out callers (public surface)", async () => {
    auth.mockResolvedValue(null);
    await expect(getMyNotificationsAction()).resolves.toEqual({
      ok: true,
      data: EMPTY_FEED,
    });
    expect(getNotificationsForUser).not.toHaveBeenCalled();
  });

  it("loads the feed for the signed-in user", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    getNotificationsForUser.mockResolvedValue({
      items: [],
      unreadCount: 0,
    });
    await expect(getMyNotificationsAction()).resolves.toEqual({
      ok: true,
      data: { items: [], unreadCount: 0 },
    });
    expect(getNotificationsForUser).toHaveBeenCalledWith("u1");
  });
});

describe("markNotificationsReadAction", () => {
  it("rejects signed-out callers", async () => {
    auth.mockResolvedValue(null);
    await expect(markNotificationsReadAction(["a"])).resolves.toEqual({
      ok: false,
      message: "Not signed in",
    });
  });

  it("rejects oversized key batches and no-ops empty lists", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    const tooMany = Array.from({ length: 51 }, (_, i) => `k${i}`);
    await expect(markNotificationsReadAction(tooMany)).resolves.toEqual({
      ok: false,
      message: expect.any(String),
    });
    expect(createMany).not.toHaveBeenCalled();

    await expect(markNotificationsReadAction([])).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("upserts read keys with skipDuplicates", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    createMany.mockResolvedValue({ count: 2 });
    await expect(
      markNotificationsReadAction(["ann:1", "hackathon:kickoff"]),
    ).resolves.toEqual({ ok: true, data: null });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", notificationKey: "ann:1" },
        { userId: "u1", notificationKey: "hackathon:kickoff" },
      ],
      skipDuplicates: true,
    });
  });
});
