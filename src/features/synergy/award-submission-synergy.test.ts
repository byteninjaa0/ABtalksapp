import { beforeEach, describe, expect, it, vi } from "vitest";
import { awardSubmissionSynergy } from "@/features/synergy/award-submission-synergy";
import {
  SYNERGY_BASE_SUBMISSION,
  SYNERGY_PROOF_GITHUB,
  SYNERGY_PROOF_LINKEDIN,
} from "@/features/synergy/scoring";

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

describe("awardSubmissionSynergy", () => {
  it("credits User + StudentProfile and records SUBMISSION for full proof", async () => {
    const points =
      SYNERGY_BASE_SUBMISSION + SYNERGY_PROOF_GITHUB + SYNERGY_PROOF_LINKEDIN;

    await expect(
      awardSubmissionSynergy(tx() as never, {
        userId: "u1",
        submissionId: "sub1",
        enrollmentId: "enr1",
        challengeId: "ch1",
        dayNumber: 7,
        hasGithub: true,
        hasLinkedin: true,
      }),
    ).resolves.toBe(points);

    expect(createEvent).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        points,
        type: "SUBMISSION",
        submissionId: "sub1",
        enrollmentId: "enr1",
        dayNumber: 7,
        rankAtAward: null,
      },
    });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { synergyPoints: { increment: points } },
    });
    expect(updateManyProfile).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { synergyPoints: { increment: points } },
    });
  });

  it("awards base-only when neither proof link is present", async () => {
    await expect(
      awardSubmissionSynergy(tx() as never, {
        userId: "u2",
        submissionId: "sub2",
        enrollmentId: "enr2",
        challengeId: "ch2",
        dayNumber: 1,
        hasGithub: false,
        hasLinkedin: false,
      }),
    ).resolves.toBe(SYNERGY_BASE_SUBMISSION);

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ points: SYNERGY_BASE_SUBMISSION }),
      }),
    );
  });
});
