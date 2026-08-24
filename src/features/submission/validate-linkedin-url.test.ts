import { describe, expect, it } from "vitest";
import { validateLinkedinUrl } from "@/features/submission/validate-linkedin-url";

describe("validateLinkedinUrl", () => {
  it("treats empty / whitespace as optional (ok)", () => {
    expect(validateLinkedinUrl("")).toEqual({ ok: true });
    expect(validateLinkedinUrl("   ")).toEqual({ ok: true });
  });

  it("accepts LinkedIn post and feed/update URLs", () => {
    expect(
      validateLinkedinUrl(
        "https://www.linkedin.com/posts/jane_activity-1234567890-AbCd",
      ),
    ).toEqual({ ok: true });
    expect(
      validateLinkedinUrl(
        "https://linkedin.com/feed/update/urn:li:activity:1234567890",
      ),
    ).toEqual({ ok: true });
  });

  it("rejects profile, http, and non-LinkedIn URLs", () => {
    expect(validateLinkedinUrl("https://www.linkedin.com/in/jane")).toEqual({
      ok: false,
      reason: "invalid_format",
      message: "Must be a valid LinkedIn post URL",
    });
    expect(
      validateLinkedinUrl("http://www.linkedin.com/posts/jane_activity-1"),
    ).toEqual({
      ok: false,
      reason: "invalid_format",
      message: "Must be a valid LinkedIn post URL",
    });
    expect(validateLinkedinUrl("https://twitter.com/x/status/1")).toEqual({
      ok: false,
      reason: "invalid_format",
      message: "Must be a valid LinkedIn post URL",
    });
  });
});
