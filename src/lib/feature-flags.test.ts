import { afterEach, describe, expect, it } from "vitest";
import {
  hireChallengePool,
  hireOpenCohortIds,
  isChatbotEnabled,
  isHackathonPreviewEnabled,
  isHireProPreviewEnabled,
  isOtpDevBypassEnabled,
  isOtpVerificationRequired,
  isRecruiterAuthEnabled,
  otpDevCode,
} from "@/lib/feature-flags";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("feature flags", () => {
  it("treats ENABLE_CHATBOT and HACKATHON_PREVIEW as explicit true only", () => {
    process.env.ENABLE_CHATBOT = "true";
    process.env.HACKATHON_PREVIEW = "true";
    expect(isChatbotEnabled()).toBe(true);
    expect(isHackathonPreviewEnabled()).toBe(true);

    process.env.ENABLE_CHATBOT = "1";
    process.env.HACKATHON_PREVIEW = "false";
    expect(isChatbotEnabled()).toBe(false);
    expect(isHackathonPreviewEnabled()).toBe(false);
  });

  it("gates OTP verification off only in development", () => {
    process.env.NODE_ENV = "development";
    expect(isOtpVerificationRequired()).toBe(false);
    process.env.NODE_ENV = "production";
    expect(isOtpVerificationRequired()).toBe(true);
  });

  it("exposes OTP dev bypass only when OTP_DEV_BYPASS=true", () => {
    delete process.env.OTP_DEV_BYPASS;
    expect(isOtpDevBypassEnabled()).toBe(false);
    process.env.OTP_DEV_BYPASS = "true";
    expect(isOtpDevBypassEnabled()).toBe(true);
    delete process.env.OTP_DEV_CODE;
    expect(otpDevCode()).toBe("1234");
    process.env.OTP_DEV_CODE = "9999";
    expect(otpDevCode()).toBe("9999");
  });

  it("keeps recruiter auth and hire Pro preview off unless explicitly true", () => {
    delete process.env.ENABLE_RECRUITER_AUTH;
    delete process.env.HIRE_PRO_PREVIEW;
    expect(isRecruiterAuthEnabled()).toBe(false);
    expect(isHireProPreviewEnabled()).toBe(false);

    process.env.ENABLE_RECRUITER_AUTH = "1";
    process.env.HIRE_PRO_PREVIEW = "yes";
    expect(isRecruiterAuthEnabled()).toBe(false);
    expect(isHireProPreviewEnabled()).toBe(false);

    process.env.ENABLE_RECRUITER_AUTH = "true";
    process.env.HIRE_PRO_PREVIEW = "true";
    expect(isRecruiterAuthEnabled()).toBe(true);
    expect(isHireProPreviewEnabled()).toBe(true);
  });

  it("parses hire open-cohort and challenge-pool env knobs", () => {
    delete process.env.HIRE_OPEN_COHORT_IDS;
    expect(hireOpenCohortIds()).toBeNull();
    process.env.HIRE_OPEN_COHORT_IDS = "all";
    expect(hireOpenCohortIds()).toBe("all");
    process.env.HIRE_OPEN_COHORT_IDS = " c1, c2 , ";
    expect(hireOpenCohortIds()).toEqual(["c1", "c2"]);

    delete process.env.HIRE_CHALLENGE_POOL;
    expect(hireChallengePool()).toEqual({ enabled: false, minDays: 10 });
    process.env.HIRE_CHALLENGE_POOL = "true";
    expect(hireChallengePool()).toEqual({ enabled: true, minDays: 10 });
    process.env.HIRE_CHALLENGE_POOL = "15";
    expect(hireChallengePool()).toEqual({ enabled: true, minDays: 15 });
    process.env.HIRE_CHALLENGE_POOL = "false";
    expect(hireChallengePool()).toEqual({ enabled: false, minDays: 10 });
  });
});
