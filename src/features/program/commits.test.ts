import { afterEach, describe, expect, it, vi } from "vitest";
import { PROGRAM_TZ } from "@/features/program/constants";
import { getProgramDateKeyDaysAgo } from "@/features/program/commits";

afterEach(() => {
  vi.useRealTimers();
});

describe("getProgramDateKeyDaysAgo", () => {
  it("returns PROGRAM_TZ (IST) calendar keys, not UTC or Chicago", () => {
    expect(PROGRAM_TZ).toBe("Asia/Kolkata");

    // 2026-08-12 01:00 UTC = 2026-08-12 06:30 IST (same civil day)
    // and 2026-08-11 20:00 Chicago (previous civil day).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T01:00:00.000Z"));

    expect(getProgramDateKeyDaysAgo(0)).toBe("2026-08-12");
    expect(getProgramDateKeyDaysAgo(1)).toBe("2026-08-11");
    expect(getProgramDateKeyDaysAgo(2)).toBe("2026-08-10");
  });

  it("rolls back across month boundaries in IST", () => {
    // 2026-09-01 02:00 IST = 2026-08-31T20:30:00.000Z
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T20:30:00.000Z"));
    expect(getProgramDateKeyDaysAgo(0)).toBe("2026-09-01");
    expect(getProgramDateKeyDaysAgo(1)).toBe("2026-08-31");
  });
});
