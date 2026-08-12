import { describe, expect, it } from "vitest";
import {
  CONSENT_POLICY_VERSION,
  isValidTrackingToken,
  planAttribution,
  readConsentChoice,
} from "@/middleware-attribution";

describe("readConsentChoice", () => {
  it("returns null for missing, malformed, or stale versions", () => {
    expect(readConsentChoice(undefined)).toBeNull();
    expect(readConsentChoice("")).toBeNull();
    expect(readConsentChoice("all")).toBeNull();
    expect(readConsentChoice(`all.2020-01-01`)).toBeNull();
    expect(readConsentChoice(`bogus.${CONSENT_POLICY_VERSION}`)).toBeNull();
  });

  it("accepts all / limited / essential at the current policy version", () => {
    expect(readConsentChoice(`all.${CONSENT_POLICY_VERSION}`)).toBe("all");
    expect(readConsentChoice(`limited.${CONSENT_POLICY_VERSION}`)).toBe(
      "limited",
    );
    expect(readConsentChoice(`essential.${CONSENT_POLICY_VERSION}`)).toBe(
      "essential",
    );
  });

  it("uses the last dot so choice names stay simple", () => {
    // choice itself has no dots today; version is after the final "."
    expect(readConsentChoice(`all.${CONSENT_POLICY_VERSION}`)).toBe("all");
  });
});

describe("isValidTrackingToken", () => {
  it("rejects empty, oversized, or unsafe tokens", () => {
    expect(isValidTrackingToken(null)).toBe(false);
    expect(isValidTrackingToken("")).toBe(false);
    expect(isValidTrackingToken("bad token")).toBe(false);
    expect(isValidTrackingToken("a".repeat(33))).toBe(false);
    expect(isValidTrackingToken("../etc")).toBe(false);
  });

  it("accepts short alphanumeric ref/src tokens", () => {
    expect(isValidTrackingToken("campus_01")).toBe(true);
    expect(isValidTrackingToken("AbC-123_x")).toBe(true);
  });
});

describe("planAttribution", () => {
  it("noops when consent is undecided", () => {
    expect(
      planAttribution({
        consent: null,
        ref: "r1",
        src: "s1",
        alreadyAttributed: false,
        hasAttributionCookies: false,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("clears existing attribution cookies on essential consent", () => {
    expect(
      planAttribution({
        consent: "essential",
        ref: "r1",
        src: "s1",
        alreadyAttributed: true,
        hasAttributionCookies: true,
      }),
    ).toEqual({ kind: "clear" });
  });

  it("noops on essential when no attribution cookies exist", () => {
    expect(
      planAttribution({
        consent: "essential",
        ref: null,
        src: null,
        alreadyAttributed: false,
        hasAttributionCookies: false,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("sets attribution for all/limited consent", () => {
    expect(
      planAttribution({
        consent: "all",
        ref: "r1",
        src: "linkedin",
        alreadyAttributed: false,
        hasAttributionCookies: false,
      }),
    ).toEqual({
      kind: "set",
      ref: "r1",
      src: "linkedin",
      alreadyAttributed: false,
    });
    expect(
      planAttribution({
        consent: "limited",
        ref: null,
        src: "twitter",
        alreadyAttributed: true,
        hasAttributionCookies: true,
      }),
    ).toEqual({
      kind: "set",
      ref: null,
      src: "twitter",
      alreadyAttributed: true,
    });
  });
});
