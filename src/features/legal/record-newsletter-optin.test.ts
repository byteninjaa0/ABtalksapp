import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    newsletterSubscription: { upsert, updateMany },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

import { recordNewsletterOptIn } from "@/features/legal/record-newsletter-optin";

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ id: "sub_1" });
  updateMany.mockResolvedValue({ count: 1 });
});

describe("recordNewsletterOptIn", () => {
  it("no-ops when email is missing", async () => {
    await recordNewsletterOptIn({
      userId: "user_1",
      source: "oauth_signup",
      optIn: true,
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("upserts a subscribed row on opt-in (lowercased email)", async () => {
    await recordNewsletterOptIn({
      userId: "user_1",
      email: " Ada@Example.COM ",
      source: "oauth_signup",
      optIn: true,
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { email: "ada@example.com" },
      create: {
        email: "ada@example.com",
        userId: "user_1",
        source: "oauth_signup",
        subscribed: true,
      },
      update: {
        subscribed: true,
        unsubscribedAt: null,
        userId: "user_1",
      },
      select: { id: true },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("only unsubscribes existing rows on opt-out (never creates)", async () => {
    await recordNewsletterOptIn({
      email: "ada@example.com",
      source: "workshop",
      optIn: false,
    });

    expect(upsert).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith({
      where: { email: "ada@example.com", subscribed: true },
      data: { subscribed: false, unsubscribedAt: expect.any(Date) },
    });
  });

  it("swallows DB errors so signup is not broken", async () => {
    upsert.mockRejectedValue(new Error("db down"));
    await expect(
      recordNewsletterOptIn({
        email: "ada@example.com",
        source: "oauth_signup",
        optIn: true,
      }),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});
