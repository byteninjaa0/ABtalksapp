import { describe, expect, it } from "vitest";
import { otpVerifySchema } from "@/lib/validations/otp";

describe("otpVerifySchema", () => {
  it("accepts +91 with a valid mobile and accessToken", () => {
    const ok = otpVerifySchema.safeParse({
      countryCode: "+91",
      phoneNumber: "9876543210",
      accessToken: "jwt-token",
    });
    expect(ok.success).toBe(true);
  });

  it("accepts +91 with a 4-digit otp in place of accessToken", () => {
    const ok = otpVerifySchema.safeParse({
      countryCode: "+91",
      phoneNumber: "9876543210",
      otp: "1234",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects non-India country codes", () => {
    const bad = otpVerifySchema.safeParse({
      countryCode: "+1",
      phoneNumber: "9876543210",
      accessToken: "jwt-token",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects invalid mobiles or missing verification proof", () => {
    expect(
      otpVerifySchema.safeParse({
        countryCode: "+91",
        phoneNumber: "123",
        accessToken: "jwt-token",
      }).success,
    ).toBe(false);

    expect(
      otpVerifySchema.safeParse({
        countryCode: "+91",
        phoneNumber: "9876543210",
      }).success,
    ).toBe(false);
  });
});
