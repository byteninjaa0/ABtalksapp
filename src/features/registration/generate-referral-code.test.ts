import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const random = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    studentProfile: { findUnique },
  },
}));

import { generateUniqueReferralCode } from "@/features/registration/generate-referral-code";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockImplementation(random);
  // Always pick alphabet index 0 → first char of REFERRAL_CHARS ("A")
  random.mockReturnValue(0);
});

describe("generateUniqueReferralCode", () => {
  it("returns a 6-char code when the first candidate is free", async () => {
    findUnique.mockResolvedValue(null);

    await expect(generateUniqueReferralCode()).resolves.toBe("AAAAAA");
    expect(findUnique).toHaveBeenCalledWith({
      where: { referralCode: "AAAAAA" },
      select: { id: true },
    });
  });

  it("retries on collisions and throws after 10 exhausted attempts", async () => {
    findUnique.mockResolvedValue({ id: "taken" });

    await expect(generateUniqueReferralCode()).rejects.toThrow(
      /unique referral code/,
    );
    expect(findUnique).toHaveBeenCalledTimes(10);
  });
});
