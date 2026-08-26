import { describe, expect, it } from "vitest";
import {
  formatExperienceBucket,
  userTypeLabel,
} from "@/lib/profile-display";

describe("formatExperienceBucket", () => {
  it("maps years into broad public buckets", () => {
    expect(formatExperienceBucket(null)).toBe("");
    expect(formatExperienceBucket(0)).toBe("Less than 1 year");
    expect(formatExperienceBucket(1)).toBe("1 year");
    expect(formatExperienceBucket(3)).toBe("2–5 years");
    expect(formatExperienceBucket(8)).toBe("6–10 years");
    expect(formatExperienceBucket(12)).toBe("10+ years");
  });
});

describe("userTypeLabel", () => {
  it("labels student vs professional", () => {
    expect(userTypeLabel("STUDENT")).toBe("Student");
    expect(userTypeLabel("PROFESSIONAL")).toBe("Working professional");
  });
});
