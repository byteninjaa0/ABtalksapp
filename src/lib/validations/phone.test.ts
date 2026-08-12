import { describe, expect, it } from "vitest";
import {
  isIndianPhone,
  phoneSchema,
  requiredPhoneSchema,
  toE164,
  toWidgetMobile,
  indianMobileNumberSchema,
} from "@/lib/validations/phone";

describe("phoneSchema", () => {
  it("strips formatting and accepts E.164-sized numbers", () => {
    expect(phoneSchema.parse("+91 98765-43210")).toBe("+919876543210");
    expect(phoneSchema.parse("(415) 555-2671")).toBe("4155552671");
  });

  it("rejects too-short, too-long, or letter-containing values", () => {
    expect(phoneSchema.safeParse("12345").success).toBe(false);
    expect(phoneSchema.safeParse("+1" + "2".repeat(16)).success).toBe(false);
    expect(phoneSchema.safeParse("call-me").success).toBe(false);
  });
});

describe("requiredPhoneSchema", () => {
  it("rejects empty strings", () => {
    expect(requiredPhoneSchema.safeParse("").success).toBe(false);
  });
});

describe("indianMobileNumberSchema / helpers", () => {
  it("accepts 10-digit Indian mobiles starting 6-9", () => {
    expect(indianMobileNumberSchema.parse("98765 43210")).toBe("9876543210");
    expect(indianMobileNumberSchema.safeParse("5876543210").success).toBe(
      false,
    );
  });

  it("builds E.164 and detects Indian numbers for OTP", () => {
    expect(toE164("91", "9876543210")).toBe("+919876543210");
    expect(toE164("+1", "4155552671")).toBe("+14155552671");
    expect(isIndianPhone("+919876543210")).toBe(true);
    expect(isIndianPhone("+14155552671")).toBe(false);
    expect(isIndianPhone(null)).toBe(false);
    expect(toWidgetMobile("+919876543210")).toBe("919876543210");
  });
});
