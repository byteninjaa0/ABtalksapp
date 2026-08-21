import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const updateNotification = vi.hoisted(() => vi.fn());
const deleteNotificationRow = vi.hoisted(() => vi.fn());
const createAdminAction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: transaction,
    notification: { findUnique },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import {
  createNotificationAction,
  deactivateNotificationAction,
  deleteNotificationAction,
} from "@/app/actions/admin-notification-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
  transaction.mockImplementation(
    async (
      fn: (client: {
        notification: {
          update: typeof updateNotification;
          delete: typeof deleteNotificationRow;
        };
        adminAction: { create: typeof createAdminAction };
      }) => unknown,
    ) =>
      fn({
        notification: {
          update: updateNotification,
          delete: deleteNotificationRow,
        },
        adminAction: { create: createAdminAction },
      }),
  );
});

describe("createNotificationAction validation", () => {
  it("rejects href that is not a relative path or https URL", async () => {
    await expect(
      createNotificationAction({
        title: "Hello",
        category: "GENERAL",
        audience: "ALL",
        href: "javascript:alert(1)",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Link must start with / or https://",
    });
    await expect(
      createNotificationAction({
        title: "Hello",
        category: "GENERAL",
        audience: "ALL",
        href: "http://insecure.example",
      }),
    ).resolves.toEqual({
      ok: false,
      message: "Link must start with / or https://",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects empty titles and unknown audience values", async () => {
    await expect(
      createNotificationAction({
        title: "   ",
        category: "GENERAL",
        audience: "ALL",
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      createNotificationAction({
        title: "Hello",
        category: "GENERAL",
        audience: "EVERYONE" as "ALL",
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts relative and https hrefs and persists the announcement", async () => {
    transaction.mockResolvedValue(undefined);

    await expect(
      createNotificationAction({
        title: "Workshop reminder",
        body: "See you soon",
        href: "/ai-workshop",
        category: "WORKSHOP",
        audience: "CHALLENGE",
      }),
    ).resolves.toEqual({ ok: true, data: null });

    await expect(
      createNotificationAction({
        title: "External",
        href: "https://abtalks.dev/blog",
        category: "GENERAL",
        audience: "ALL",
      }),
    ).resolves.toEqual({ ok: true, data: null });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/notifications");
  });
});

describe("deactivateNotificationAction", () => {
  it("rejects missing ids and unknown announcements", async () => {
    await expect(deactivateNotificationAction({ id: "" })).resolves.toEqual({
      ok: false,
      message: "Invalid input",
    });
    findUnique.mockResolvedValue(null);
    await expect(
      deactivateNotificationAction({ id: "missing" }),
    ).resolves.toEqual({ ok: false, message: "Announcement not found" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("soft-deactivates an announcement and audits the admin action", async () => {
    findUnique.mockResolvedValue({
      id: "n1",
      title: "Kickoff",
      isActive: true,
    });
    updateNotification.mockResolvedValue({ id: "n1" });
    createAdminAction.mockResolvedValue({ id: "a1" });

    await expect(
      deactivateNotificationAction({ id: "n1" }),
    ).resolves.toEqual({ ok: true, data: null });

    expect(updateNotification).toHaveBeenCalledWith({
      where: { id: "n1" },
      data: { isActive: false },
      select: { id: true },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "admin-1",
        actionType: "deactivateNotification",
        metadata: { notificationId: "n1", title: "Kickoff" },
      },
      select: { id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/notifications");
  });
});

describe("deleteNotificationAction", () => {
  it("rejects unknown announcements before deleting", async () => {
    findUnique.mockResolvedValue(null);
    await expect(deleteNotificationAction({ id: "missing" })).resolves.toEqual({
      ok: false,
      message: "Announcement not found",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("hard-deletes an announcement and audits the admin action", async () => {
    findUnique.mockResolvedValue({ id: "n2", title: "Old promo" });
    deleteNotificationRow.mockResolvedValue({ id: "n2" });
    createAdminAction.mockResolvedValue({ id: "a2" });

    await expect(deleteNotificationAction({ id: "n2" })).resolves.toEqual({
      ok: true,
      data: null,
    });

    expect(deleteNotificationRow).toHaveBeenCalledWith({
      where: { id: "n2" },
      select: { id: true },
    });
    expect(createAdminAction).toHaveBeenCalledWith({
      data: {
        adminUserId: "admin-1",
        targetUserId: "admin-1",
        actionType: "deleteNotification",
        metadata: { notificationId: "n2", title: "Old promo" },
      },
      select: { id: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/notifications");
  });
});
