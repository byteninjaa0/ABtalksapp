import { beforeEach, describe, expect, it, vi } from "vitest";
import { awardReferralSynergy } from "@/features/synergy/award-referral-synergy";
import { SYNERGY_REFERRAL } from "@/features/synergy/scoring";

const createEvent = vi.fn();
const updateUser = vi.fn();
const updateManyProfile = vi.fn();

function tx() {
  return {
    synergyEvent: { create: createEvent },
    user: { update: updateUser },
    studentProfile: { updateMany: updateManyProfile },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("awardReferralSynergy", () => {
  it("credits referrer User + StudentProfile wallets with REFERRAL event", async () => {
    await expect(
      awardReferralSynergy(tx() as never, {
        referrerId: "ref-user",
        referralId: "referral-1",
        referredUserId: "new-user",
      }),
    ).resolves.toBe(SYNERGY_REFERRAL);

    expect(createEvent).toHaveBeenCalledWith({
      data: {
        userId: "ref-user",
        points: SYNERGY_REFERRAL,
        type: "REFERRAL",
        reason: "Referral signup (referralId=referral-1, referredUserId=new-user)",
      },
    });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "ref-user" },
      data: { synergyPoints: { increment: SYNERGY_REFERRAL } },
    });
    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "ref-user" },
      data: { synergyPoints: { increment: SYNERGY_REFERRAL } },
    });
  });
});
