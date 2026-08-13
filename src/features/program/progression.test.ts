import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROGRAM_MEMBER_START_DAY,
  PROGRAM_TOTAL_DAYS,
  PROGRAM_TZ,
} from "@/features/program/constants";
import {
  collectPassSkipSets,
  deriveDayState,
  getBehindByDays,
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

describe("IST cohort calendar unlock", () => {
  it("uses Asia/Kolkata as PROGRAM_TZ", () => {
    expect(PROGRAM_TZ).toBe("Asia/Kolkata");
  });

  it("counts Asia/Kolkata calendar days from cohort start", () => {
    // Cohort starts 2026-08-10 00:00 IST = 2026-08-09T18:30:00.000Z
    // "now" 2026-08-11T07:30:00.000Z = 2026-08-11 13:00 IST → calendar day 2
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T07:30:00.000Z"));
    const startsAt = new Date("2026-08-09T18:30:00.000Z");
    expect(getCohortCalendarDay({ startsAt })).toBe(2);

    // Admin floor can raise unlock above calendar-derived max
    const calendarMax = getCalendarDerivedMaxContentDay(2);
    expect(getMaxContentDay({ startsAt }, calendarMax + 2)).toBe(
      calendarMax + 2,
    );
    expect(getMaxContentDay({ startsAt }, 1)).toBe(calendarMax);
  });

  it("does not inflate cohort day when UTC midnight start is read in IST", () => {
    // Regression for Chicago→IST: naive UTC midnight startsAt was one civil day
    // early under America/Chicago, so Mission Control showed Cohort day N+1.
    // now = 2026-08-12T10:00Z → 15:30 IST / 05:00 Chicago
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const startsAt = new Date("2026-08-01T00:00:00.000Z");
    expect(getCohortCalendarDay({ startsAt })).toBe(12);
  });
});

describe("getBehindByDays", () => {
  it("measures behind-pace against cohort calendar day, not Day-4 unlock ceiling", () => {
    // Calendar day 2 → unlock ceiling is PROGRAM_MEMBER_START_DAY+1 (=5),
    // but an on-pace member at progressDay 2 must be behindBy 0 (not 3).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T07:30:00.000Z"));
    const startsAt = new Date("2026-08-09T18:30:00.000Z");
    expect(getCohortCalendarDay({ startsAt })).toBe(2);
    expect(getCalendarDerivedMaxContentDay(2)).toBe(
      PROGRAM_MEMBER_START_DAY + 1,
    );
    expect(getBehindByDays({ startsAt }, 2)).toBe(0);
    expect(getBehindByDays({ startsAt }, 1)).toBe(1);
    expect(getBehindByDays({ startsAt }, 5)).toBe(0);
  });
});
