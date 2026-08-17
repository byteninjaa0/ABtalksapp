import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCalendarDaysToKey,
  getCurrentDayNumber,
  getElapsedDayNumber,
  getIstDateKeyForChallengeDay,
  isChallengePreStart,
  isEnrollmentPreStart,
  istDateRangeToUtc,
  parseCalendarKeyToUtcDate,
} from "@/lib/date-utils";

describe("calendar key helpers", () => {
  it("parses yyyy-MM-dd keys as UTC midnight civil dates", () => {
    expect(parseCalendarKeyToUtcDate("2026-08-12").toISOString()).toBe(
      "2026-08-12T00:00:00.000Z",
    );
  });

  it("adds civil days without timezone drift", () => {
    expect(addCalendarDaysToKey("2026-08-12", 1)).toBe("2026-08-13");
    expect(addCalendarDaysToKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addCalendarDaysToKey("2026-08-12", -1)).toBe("2026-08-11");
  });

  it("maps challenge day numbers onto IST calendar keys", () => {
    // 2026-03-01 00:30 IST == 2026-02-28 19:00 UTC
    const startedAt = new Date("2026-02-28T19:00:00.000Z");
    expect(getIstDateKeyForChallengeDay(startedAt, 1)).toBe("2026-03-01");
    expect(getIstDateKeyForChallengeDay(startedAt, 2)).toBe("2026-03-02");
  });

  it("builds inclusive IST ranges as UTC half-open intervals", () => {
    const { startUtc, endExclusiveUtc } = istDateRangeToUtc(
      "2026-08-01",
      "2026-08-01",
    );
    expect(startUtc?.toISOString()).toBe("2026-07-31T18:30:00.000Z");
    expect(endExclusiveUtc?.toISOString()).toBe("2026-08-01T18:30:00.000Z");
  });
});

describe("day numbering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns day 1 on the enrollment IST calendar day for rolling challenges", () => {
    // Enrollment: 10 Aug 2026 10:00 IST = 10 Aug 04:30 UTC
    const startedAt = new Date("2026-08-10T04:30:00.000Z");
    vi.setSystemTime(new Date("2026-08-10T12:00:00.000Z")); // still 10 Aug IST
    expect(getCurrentDayNumber(startedAt)).toBe(1);
    expect(getElapsedDayNumber(startedAt)).toBe(1);
  });

  it("caps getCurrentDayNumber at 60 but leaves elapsed uncapped", () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(new Date("2026-04-15T00:00:00.000Z")); // well past day 60
    expect(getCurrentDayNumber(startedAt)).toBe(60);
    expect(getElapsedDayNumber(startedAt)).toBeGreaterThan(60);
  });

  it("returns 0 before a synchronized challenge start (IST)", () => {
    const startedAt = new Date("2026-07-01T00:00:00.000Z");
    const challenge = { startsAt: new Date("2026-08-20T18:30:00.000Z") }; // 21 Aug 00:00 IST
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    expect(isChallengePreStart(challenge)).toBe(true);
    expect(isEnrollmentPreStart(startedAt, challenge)).toBe(true);
    expect(getCurrentDayNumber(startedAt, challenge)).toBe(0);
    expect(getElapsedDayNumber(startedAt, challenge)).toBe(0);
  });

  it("uses max(enrollment, challenge.startsAt) as the effective start", () => {
    // Challenge started earlier; late enrollee starts from enrollment day.
    const challenge = { startsAt: new Date("2026-08-01T18:30:00.000Z") }; // 2 Aug IST
    const lateEnrollment = new Date("2026-08-10T04:30:00.000Z"); // 10 Aug IST
    vi.setSystemTime(new Date("2026-08-12T04:30:00.000Z")); // 12 Aug IST
    expect(getCurrentDayNumber(lateEnrollment, challenge)).toBe(3);
    expect(isEnrollmentPreStart(lateEnrollment, challenge)).toBe(false);
  });
});
