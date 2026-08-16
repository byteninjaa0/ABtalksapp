import { LegalDocument } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    legalConsent: { createMany },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-forwarded-for") return "203.0.113.10, 10.0.0.1";
      if (name === "user-agent") return "VitestAgent/1.0";
      return null;
    },
  })),
}));

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal-constants";
import { recordLegalConsents } from "@/features/legal/record-consent";

beforeEach(() => {
  vi.clearAllMocks();
  createMany.mockResolvedValue({ count: 2 });
});

describe("recordLegalConsents", () => {
  it("requires userId or email", async () => {
    await expect(
      recordLegalConsents({ source: "oauth_signup", captureRequestMeta: false }),
    ).rejects.toThrow(/userId or email/);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("writes TERMS + PRIVACY rows for current versions with request meta", async () => {
    await recordLegalConsents({
      userId: "user_1",
      email: " Ada@Example.COM ",
      source: "oauth_signup",
    });

    expect(createMany).toHaveBeenCalledOnce();
    expect(createMany.mock.calls[0][0]).toEqual({
      data: [
        {
          userId: "user_1",
          email: "ada@example.com",
          source: "oauth_signup",
          ip: "203.0.113.10",
          userAgent: "VitestAgent/1.0",
          document: LegalDocument.TERMS,
          version: TERMS_VERSION,
        },
        {
          userId: "user_1",
          email: "ada@example.com",
          source: "oauth_signup",
          ip: "203.0.113.10",
          userAgent: "VitestAgent/1.0",
          document: LegalDocument.PRIVACY,
          version: PRIVACY_VERSION,
        },
      ],
    });
  });

  it("skips header capture when captureRequestMeta is false", async () => {
    await recordLegalConsents({
      email: "solo@example.com",
      source: "workshop",
      captureRequestMeta: false,
    });

    expect(createMany.mock.calls[0][0].data[0]).toMatchObject({
      userId: null,
      email: "solo@example.com",
      source: "workshop",
      ip: null,
      userAgent: null,
      document: LegalDocument.TERMS,
    });
  });
});
