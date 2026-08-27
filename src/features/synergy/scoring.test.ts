import { describe, expect, it } from "vitest";
import {
  SYNERGY_BASE_SUBMISSION,
  SYNERGY_PROOF_GITHUB,
  SYNERGY_PROOF_LINKEDIN,
  SYNERGY_REFERRAL,
  computeSubmissionSynergy,
} from "@/features/synergy/scoring";

describe("computeSubmissionSynergy", () => {
  it("awards base points with no proof links", () => {
    expect(computeSubmissionSynergy({ hasGithub: false, hasLinkedin: false })).toEqual({
      points: SYNERGY_BASE_SUBMISSION,
    });
  });

  it("adds GitHub and LinkedIn proof bonuses independently", () => {
    expect(computeSubmissionSynergy({ hasGithub: true, hasLinkedin: false })).toEqual({
      points: SYNERGY_BASE_SUBMISSION + SYNERGY_PROOF_GITHUB,
    });
    expect(computeSubmissionSynergy({ hasGithub: false, hasLinkedin: true })).toEqual({
      points: SYNERGY_BASE_SUBMISSION + SYNERGY_PROOF_LINKEDIN,
    });
    expect(computeSubmissionSynergy({ hasGithub: true, hasLinkedin: true })).toEqual({
      points: SYNERGY_BASE_SUBMISSION + SYNERGY_PROOF_GITHUB + SYNERGY_PROOF_LINKEDIN,
    });
  });

  it("keeps referral constant distinct from submission totals", () => {
    expect(SYNERGY_REFERRAL).toBe(3);
    expect(SYNERGY_REFERRAL).not.toBe(SYNERGY_BASE_SUBMISSION);
  });
});
