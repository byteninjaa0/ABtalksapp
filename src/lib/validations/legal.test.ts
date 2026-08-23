import { describe, expect, it } from "vitest";
import {
  cookieConsentSchema,
  dataRightsRequestSchema,
  legalAcceptanceSchema,
  resolveDataRightsRequestSchema,
} from "@/lib/validations/legal";

describe("legalAcceptanceSchema", () => {
  it("requires acceptLegal=true and accepts newsletter opt-out", () => {
    const ok = legalAcceptanceSchema.safeParse({
      acceptLegal: true,
      newsletterOptIn: false,
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.newsletterOptIn).toBe(false);
    }
  });

  it("rejects when Terms/Privacy are not accepted", () => {
    const bad = legalAcceptanceSchema.safeParse({
      acceptLegal: false,
      newsletterOptIn: true,
    });
    expect(bad.success).toBe(false);
  });

  it("rejects when newsletterOptIn is omitted (must be explicit)", () => {
    const bad = legalAcceptanceSchema.safeParse({ acceptLegal: true });
    expect(bad.success).toBe(false);
  });
});

describe("cookieConsentSchema", () => {
  it("accepts valid choices and optional attribution fields", () => {
    const ok = cookieConsentSchema.safeParse({
      choice: "limited",
      ref: "campus01",
      src: "linkedin",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects unknown choices and oversized attribution", () => {
    expect(
      cookieConsentSchema.safeParse({ choice: "tracking" }).success,
    ).toBe(false);
    expect(
      cookieConsentSchema.safeParse({
        choice: "all",
        ref: "x".repeat(33),
      }).success,
    ).toBe(false);
  });
});

describe("dataRightsRequestSchema", () => {
  it("normalizes email and accepts empty message", () => {
    const ok = dataRightsRequestSchema.safeParse({
      email: "  User@Example.COM ",
      type: "ERASURE",
      message: "",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.email).toBe("user@example.com");
    }
  });

  it("rejects invalid email or type", () => {
    expect(
      dataRightsRequestSchema.safeParse({
        email: "not-an-email",
        type: "ACCESS",
      }).success,
    ).toBe(false);
    expect(
      dataRightsRequestSchema.safeParse({
        email: "a@b.co",
        type: "DELETE_EVERYTHING",
      }).success,
    ).toBe(false);
  });
});

describe("resolveDataRightsRequestSchema", () => {
  it("accepts admin resolution statuses and rejects bad ids/status", () => {
    expect(
      resolveDataRightsRequestSchema.safeParse({
        id: "req_1",
        status: "DONE",
      }).success,
    ).toBe(true);
    expect(
      resolveDataRightsRequestSchema.safeParse({
        id: "",
        status: "DONE",
      }).success,
    ).toBe(false);
    expect(
      resolveDataRightsRequestSchema.safeParse({
        id: "req_1",
        status: "OPEN",
      }).success,
    ).toBe(false);
  });
});
