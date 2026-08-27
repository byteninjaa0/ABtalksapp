import { LegalDocument } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    legalConsent: { findFirst },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, info: vi.fn(), warn: vi.fn() },
}));

import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal-constants";
import { needsReconsent } from "@/features/legal/needs-reconsent";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("needsReconsent", () => {
  it("returns true when the user has no prior consent rows", async () => {
    findFirst.mockResolvedValue(null);

    await expect(needsReconsent("user_1")).resolves.toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("returns false when both documents match current versions", async () => {
    findFirst.mockImplementation(
      async ({ where }: { where: { document: LegalDocument } }) => {
        if (where.document === LegalDocument.TERMS) {
          return { version: TERMS_VERSION };
        }
        return { version: PRIVACY_VERSION };
      },
    );

    await expect(needsReconsent("user_1")).resolves.toBe(false);
  });

  it("returns true when either document version is stale", async () => {
    findFirst.mockImplementation(
      async ({ where }: { where: { document: LegalDocument } }) => {
        if (where.document === LegalDocument.TERMS) {
          return { version: "2020-01-01" };
        }
        return { version: PRIVACY_VERSION };
      },
    );

    await expect(needsReconsent("user_1")).resolves.toBe(true);
  });

  it("returns false (fail-open) when the consent query throws", async () => {
    findFirst.mockRejectedValue(new Error("relation missing"));

    await expect(needsReconsent("user_1")).resolves.toBe(false);
    expect(loggerError).toHaveBeenCalledOnce();
  });
});
