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
  isWaivedPayload,
} from "@/features/program/progression";

afterEach(() => {
  vi.useRealTimers();
});

describe("isSkippedPayload / isWaivedPayload", () => {
  it("detects skipped submissions only", () => {
    expect(isSkippedPayload({ skipped: true })).toBe(true);
    expect(isSkippedPayload({ skipped: false })).toBe(false);
    expect(isSkippedPayload(null)).toBe(false);
    expect(isSkippedPayload("skipped")).toBe(false);
  });

  it("detects waived payloads only", () => {
    expect(isWaivedPayload({ waived: true })).toBe(true);
    expect(isWaivedPayload({ waived: false })).toBe(false);
    expect(isWaivedPayload({ skipped: true })).toBe(false);
    expect(isWaivedPayload(null)).toBe(false);
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

  it("ignores leftover cohort_start_day waivers when START_DAY is 1 and nothing is earned", () => {
    expect(PROGRAM_MEMBER_START_DAY).toBe(1);
    const { passedDays, skippedDays } = collectPassSkipSets([
      {
        dayNumber: 1,
        passed: true,
        payload: { waived: true, reason: "cohort_start_day" },
      },
      {
        dayNumber: 2,
        passed: true,
        payload: { waived: true, reason: "cohort_start_day" },
      },
      {
        dayNumber: 3,
        passed: true,
        payload: { waived: true, reason: "cohort_start_day" },
      },
    ]);
    expect([...passedDays]).toEqual([]);
    expect([...skippedDays]).toEqual([]);
    expect(getMemberProgressDay(passedDays)).toBe(0);
  });

  it("keeps waived days once the member has an earned pass", () => {
    const { passedDays } = collectPassSkipSets([
      {
        dayNumber: 1,
        passed: true,
        payload: { waived: true, reason: "cohort_start_day" },
      },
      { dayNumber: 2, passed: true, payload: { code: "mission" } },
    ]);
    expect([...passedDays].sort((a, b) => a - b)).toEqual([1, 2]);
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

    // Admin floor can raise unlock above calendar-derived max (must be >4 so
    // the legacy Day-4 enroll floor is not stripped by effectiveUnlockFloor).
    const calendarMax = getCalendarDerivedMaxContentDay(2);
    expect(getMaxContentDay({ startsAt }, 10)).toBe(10);
    expect(getMaxContentDay({ startsAt }, 1)).toBe(calendarMax);
  });

  it("does not treat legacy highestUnlockedDay=4 as an admin floor after Day-1 start", () => {
    // Old enroll bootstrap wrote highestUnlockedDay = 4. With START_DAY=1 that
    // must not unlock Days 1–4 on calendar day 1.
    expect(PROGRAM_MEMBER_START_DAY).toBe(1);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T07:30:00.000Z")); // calendar day 1
    const startsAt = new Date("2026-08-09T18:30:00.000Z");
    expect(getCohortCalendarDay({ startsAt })).toBe(1);
    expect(getMaxContentDay({ startsAt }, 4)).toBe(1);
    expect(getMaxContentDay({ startsAt }, 1)).toBe(1);
    // Explicit admin raise past the legacy default still sticks.
    expect(getMaxContentDay({ startsAt }, 5)).toBe(5);
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
  it("measures behind-pace against cohort calendar day, not unlock ceiling", () => {
    // Calendar day 2 → unlock ceiling is PROGRAM_MEMBER_START_DAY+1 (=2 with
    // START_DAY=1), but behind-pace still compares progress to calendar day.
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
