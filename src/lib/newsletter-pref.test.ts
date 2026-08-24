import { describe, expect, it } from "vitest";
import {
  NEWSLETTER_PREF_COOKIE,
  newsletterOptInFromPrefCookie,
} from "@/lib/newsletter-pref";

describe("newsletterOptInFromPrefCookie", () => {
  it("defaults to opted-in when cookie is missing or unknown", () => {
    expect(newsletterOptInFromPrefCookie(undefined)).toBe(true);
    expect(newsletterOptInFromPrefCookie("")).toBe(true);
    expect(newsletterOptInFromPrefCookie("maybe")).toBe(true);
  });

  it("honours explicit opt-out and opt-in cookie values", () => {
    expect(newsletterOptInFromPrefCookie("0")).toBe(false);
    expect(newsletterOptInFromPrefCookie("1")).toBe(true);
  });

  it("keeps the OAuth cookie name stable for login ↔ auth", () => {
    expect(NEWSLETTER_PREF_COOKIE).toBe("abtalks_newsletter_pref");
  });
});
