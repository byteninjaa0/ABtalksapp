import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueStudent = vi.hoisted(() => vi.fn());
const findUniqueCandidate = vi.hoisted(() => vi.fn());
const random = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: {
    candidateProfile: { findUnique: findUniqueCandidate },
  },
}));

vi.mock("@/repositories/legacy/student-profile", () => ({
  studentProfile: { findUnique: findUniqueStudent },
}));

import { generateUniqueReferralCode } from "@/features/registration/generate-referral-code";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Math, "random").mockImplementation(random);
  // Always pick alphabet index 0 → first char of REFERRAL_CHARS ("A")
  random.mockReturnValue(0);
});

describe("generateUniqueReferralCode", () => {
  it("returns a 6-char code when both tables are free", async () => {
    findUniqueStudent.mockResolvedValue(null);
    findUniqueCandidate.mockResolvedValue(null);

    await expect(generateUniqueReferralCode()).resolves.toBe("AAAAAA");
    expect(findUniqueStudent).toHaveBeenCalledWith({
      where: { referralCode: "AAAAAA" },
      select: { id: true },
    });
    expect(findUniqueCandidate).toHaveBeenCalledWith({
      where: { referralCode: "AAAAAA" },
      select: { userId: true },
    });
  });

  it("retries when CandidateProfile already holds the code", async () => {
    findUniqueStudent.mockResolvedValue(null);
    findUniqueCandidate.mockResolvedValue({ userId: "other" });

    await expect(generateUniqueReferralCode()).rejects.toThrow(
      /unique referral code/,
    );
    expect(findUniqueStudent).toHaveBeenCalledTimes(10);
    expect(findUniqueCandidate).toHaveBeenCalledTimes(10);
  });

  it("retries on StudentProfile collisions and throws after 10 exhausted attempts", async () => {
    findUniqueStudent.mockResolvedValue({ id: "taken" });
    findUniqueCandidate.mockResolvedValue(null);

    await expect(generateUniqueReferralCode()).rejects.toThrow(
      /unique referral code/,
    );
    expect(findUniqueStudent).toHaveBeenCalledTimes(10);
  });
});
