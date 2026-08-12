import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROGRAM_MEMBER_START_DAY,
  PROGRAM_TOTAL_DAYS,
} from "@/features/program/constants";
import {
  collectPassSkipSets,
  deriveDayState,
  getCalendarDerivedMaxContentDay,
  getCohortCalendarDay,
  getMaxContentDay,
  getMemberProgressDay,
  isSkippedPayload,
} from "@/features/program/progression";

afterEach(() => {
  vi.useRealTimers();
});

describe("isSkippedPayload", () => {
  it("detects skipped submissions only", () => {
    expect(isSkippedPayload({ skipped: true })).toBe(true);
    expect(isSkippedPayload({ skipped: false })).toBe(false);
    expect(isSkippedPayload(null)).toBe(false);
    expect(isSkippedPayload("skipped")).toBe(false);
  });
});

describe("getCalendarDerivedMaxContentDay", () => {
  it("maps cohort calendar day 1 to PROGRAM_MEMBER_START_DAY", () => {
    expect(getCalendarDerivedMaxContentDay(1)).toBe(PROGRAM_MEMBER_START_DAY);
  });

  it("caps at PROGRAM_TOTAL_DAYS", () => {
    expect(getCalendarDerivedMaxContentDay(999)).toBe(PROGRAM_TOTAL_DAYS);
  });
});

describe("deriveDayState", () => {
  it("returns PASSED / SKIPPED before lock checks", () => {
    expect(deriveDayState(3, 10, new Set([3]), new Set(), false)).toBe(
      "PASSED",
    );
    expect(deriveDayState(3, 10, new Set(), new Set([3]), false)).toBe(
      "SKIPPED",
    );
  });

  it("locks future days and requires previous PASSED for sequential unlock", () => {
    expect(deriveDayState(5, 4, new Set([1, 2, 3, 4]), new Set())).toBe(
      "LOCKED",
    );
    expect(deriveDayState(3, 5, new Set([1]), new Set())).toBe("LOCKED");
    expect(deriveDayState(2, 5, new Set([1]), new Set())).toBe("AVAILABLE");
    expect(deriveDayState(1, 5, new Set(), new Set())).toBe("AVAILABLE");
  });

  it("bypassLocks opens any not-yet-completed day", () => {
    expect(deriveDayState(20, 1, new Set(), new Set(), true)).toBe(
      "AVAILABLE",
    );
  });
});

describe("collectPassSkipSets / getMemberProgressDay", () => {
  it("splits passed vs skipped rows and reports max passed day", () => {
    const { passedDays, skippedDays } = collectPassSkipSets([
      { dayNumber: 1, passed: true, payload: {} },
      { dayNumber: 2, passed: false, payload: { skipped: true } },
      { dayNumber: 3, passed: false, payload: { code: "x" } },
    ]);
    expect([...passedDays]).toEqual([1]);
    expect([...skippedDays]).toEqual([2]);
    expect(getMemberProgressDay(passedDays)).toBe(1);
    expect(getMemberProgressDay(new Set())).toBe(0);
  });
});

describe("Chicago cohort calendar unlock", () => {
  it("counts America/Chicago calendar days from cohort start", () => {
    // Cohort starts 2026-08-10 05:00 UTC = 2026-08-10 00:00 Chicago (CDT).
    // "now" 2026-08-11 18:00 UTC = 2026-08-11 13:00 Chicago → calendar day 2.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T18:00:00.000Z"));
    const startsAt = new Date("2026-08-10T05:00:00.000Z");
    expect(getCohortCalendarDay({ startsAt })).toBe(2);

    // Admin floor can raise unlock above calendar-derived max
    const calendarMax = getCalendarDerivedMaxContentDay(2);
    expect(getMaxContentDay({ startsAt }, calendarMax + 2)).toBe(
      calendarMax + 2,
    );
    expect(getMaxContentDay({ startsAt }, 1)).toBe(calendarMax);
  });
});
