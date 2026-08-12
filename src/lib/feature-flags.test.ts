import { afterEach, describe, expect, it } from "vitest";
import {
  isChatbotEnabled,
  isHackathonPreviewEnabled,
  isOtpDevBypassEnabled,
  isOtpVerificationRequired,
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
});
