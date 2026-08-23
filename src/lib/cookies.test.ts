import { describe, expect, it } from "vitest";
import {
  allowsAttribution,
  parseConsentCookie,
} from "@/lib/cookies";
import { COOKIE_POLICY_VERSION } from "@/lib/legal-constants";

describe("allowsAttribution", () => {
  it("allows all and limited, rejects essential and null", () => {
    expect(allowsAttribution("all")).toBe(true);
    expect(allowsAttribution("limited")).toBe(true);
    expect(allowsAttribution("essential")).toBe(false);
    expect(allowsAttribution(null)).toBe(false);
  });
});

describe("parseConsentCookie", () => {
  it("returns the choice when version matches current policy", () => {
    expect(parseConsentCookie(`all.${COOKIE_POLICY_VERSION}`)).toBe("all");
    expect(parseConsentCookie(`limited.${COOKIE_POLICY_VERSION}`)).toBe(
      "limited",
    );
    expect(parseConsentCookie(`essential.${COOKIE_POLICY_VERSION}`)).toBe(
      "essential",
    );
  });

  it("returns null for missing, stale, or malformed cookies", () => {
    expect(parseConsentCookie(undefined)).toBeNull();
    expect(parseConsentCookie("")).toBeNull();
    expect(parseConsentCookie("all.1999-01-01")).toBeNull();
    expect(parseConsentCookie(`tracking.${COOKIE_POLICY_VERSION}`)).toBeNull();
    expect(parseConsentCookie("all")).toBeNull();
  });
});
