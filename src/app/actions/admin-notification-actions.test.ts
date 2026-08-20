import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

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
} from "@/app/actions/admin-notification-actions";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "admin-1", email: "admin@x.com" });
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
});
