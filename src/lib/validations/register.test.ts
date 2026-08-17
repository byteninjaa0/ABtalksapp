import { describe, expect, it } from "vitest";
import { registerPayloadSchema, registerSchema } from "@/lib/validations/register";

const baseLegal = {
  acceptLegal: true,
  newsletterOptIn: false,
} as const;

describe("registerPayloadSchema", () => {
  it("accepts a student payload with India phone and legal acceptance", () => {
    const ok = registerPayloadSchema.safeParse({
      ...baseLegal,
      userType: "STUDENT",
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "AI",
      countryCode: "+91",
      phoneNumber: "9876543210",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects when legal acceptance is missing or false", () => {
    const missing = registerPayloadSchema.safeParse({
      userType: "STUDENT",
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "AI",
      countryCode: "+91",
      phoneNumber: "9876543210",
      newsletterOptIn: true,
    });
    expect(missing.success).toBe(false);

    const declined = registerPayloadSchema.safeParse({
      ...baseLegal,
      acceptLegal: false,
      userType: "STUDENT",
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "AI",
      countryCode: "+91",
      phoneNumber: "9876543210",
    });
    expect(declined.success).toBe(false);
  });

  it("requires a valid Indian mobile when countryCode is +91", () => {
    const empty = registerPayloadSchema.safeParse({
      ...baseLegal,
      userType: "STUDENT",
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "AI",
      countryCode: "+91",
      phoneNumber: "",
    });
    expect(empty.success).toBe(false);

    const bad = registerPayloadSchema.safeParse({
      ...baseLegal,
      userType: "STUDENT",
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "AI",
      countryCode: "+91",
      phoneNumber: "12345",
    });
    expect(bad.success).toBe(false);
  });

  it("accepts a professional payload without forcing India phone for other countries", () => {
    const ok = registerPayloadSchema.safeParse({
      ...baseLegal,
      userType: "PROFESSIONAL",
      fullName: "Grace Hopper",
      organization: "Navy",
      role: "Engineer",
      yearsExperience: 10,
      domain: "SE",
      countryCode: "+1",
      phoneNumber: "",
    });
    expect(ok.success).toBe(true);
  });
});

describe("registerSchema (legacy)", () => {
  it("accepts the flat student form shape without legal fields", () => {
    const ok = registerSchema.safeParse({
      fullName: "Ada Lovelace",
      college: "IIT Test",
      graduationYear: 2027,
      domain: "CLAUDE",
    });
    expect(ok.success).toBe(true);
  });
});
