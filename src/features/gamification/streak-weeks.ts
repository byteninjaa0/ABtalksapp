/**
 * Plan 151 §10 — IST ISO-week math and weekly-streak freezes. Pure.
 *
 * Week key = ISO week of `occurredAt` in Asia/Kolkata, via `lib/date-utils`
 * helpers. Never hard-code a timezone string. `getCurrentDayNumber` is banned.
 *
 * Streak length never pays XP. Freezes: 1 per 4 consecutive active weeks,
 * bank at most 2, auto-applied to a missed week.
 */

import { getIstWeekKey, IST } from "@/lib/date-utils";
import { addDays } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

export { getIstWeekKey };

export const STREAK_FREEZE_EARN_EVERY = 4;
export const STREAK_FREEZE_BANK_MAX = 2;

export type WeekActivity = {
  weekKey: string;
  active: boolean;
};

export type StreakState = {
  weekStreak: number;
  longestWeekStreak: number;
  lastActiveWeekKey: string | null;
  streakFreezes: number;
};

function parseWeekKey(weekKey: string): { year: number; week: number } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return null;
  return { year: Number(m[1]), week: Number(m[2]) };
}

/** Monday 00:00 IST of an ISO week, as UTC Date. */
export function istWeekStartUtc(weekKey: string): Date {
  const parsed = parseWeekKey(weekKey);
  if (!parsed) return new Date(0);
  // ISO week 1 is the week with 4 Jan. Thursday of week 1 is in `year`.
  const jan4 = fromZonedTime(`${parsed.year}-01-04T00:00:00`, IST);
  const jan4Day = ((jan4.getUTCDay() + 6) % 7) + 1; // 1=Mon … 7=Sun in IST-civil via UTC date of IST midnight
  // Use the IST calendar day of Jan 4.
  const jan4Ist = getIstWeekKey(jan4);
  void jan4Ist;
  const mondayOfWeek1 = addDays(jan4, -(jan4Day - 1));
  return addDays(mondayOfWeek1, (parsed.week - 1) * 7);
}

export function previousWeekKey(weekKey: string): string {
  const start = istWeekStartUtc(weekKey);
  return getIstWeekKey(addDays(start, -7));
}

export function nextWeekKey(weekKey: string): string {
  const start = istWeekStartUtc(weekKey);
  return getIstWeekKey(addDays(start, 7));
}

export function compareWeekKeys(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * A week is active when it has verified activity on ≥ 2 distinct IST days,
 * or one T3+ event (build, completion, hackathon submission). Admin-issued
 * completions never count. Views, logins and claims never count.
 */
export function isWeekActive(input: {
  distinctVerifiedDays: number;
  hasT3Event: boolean;
}): boolean {
  return input.distinctVerifiedDays >= 2 || input.hasT3Event;
}

/**
 * Apply week-close: if the closed week was inactive, consume a freeze if
 * banked; otherwise break. Current week is never broken until it ends.
 */
export function applyWeekClose(
  state: StreakState,
  closedWeekKey: string,
  closedWeekActive: boolean,
): StreakState {
  if (state.lastActiveWeekKey === closedWeekKey && closedWeekActive) {
    return state;
  }

  if (closedWeekActive) {
    const expectedPrev = state.lastActiveWeekKey
      ? nextWeekKey(state.lastActiveWeekKey)
      : closedWeekKey;
    const consecutive =
      !state.lastActiveWeekKey || expectedPrev === closedWeekKey;
    const weekStreak = consecutive ? state.weekStreak + 1 : 1;
    let freezes = state.streakFreezes;
    if (weekStreak > 0 && weekStreak % STREAK_FREEZE_EARN_EVERY === 0) {
      freezes = Math.min(STREAK_FREEZE_BANK_MAX, freezes + 1);
    }
    return {
      weekStreak,
      longestWeekStreak: Math.max(state.longestWeekStreak, weekStreak),
      lastActiveWeekKey: closedWeekKey,
      streakFreezes: freezes,
    };
  }

  if (state.streakFreezes > 0) {
    return {
      ...state,
      streakFreezes: state.streakFreezes - 1,
      lastActiveWeekKey: closedWeekKey,
    };
  }

  return {
    weekStreak: 0,
    longestWeekStreak: state.longestWeekStreak,
    lastActiveWeekKey: state.lastActiveWeekKey,
    streakFreezes: 0,
  };
}

export function earnFreezeOnStreak(weekStreak: number, banked: number): number {
  if (weekStreak > 0 && weekStreak % STREAK_FREEZE_EARN_EVERY === 0) {
    return Math.min(STREAK_FREEZE_BANK_MAX, banked + 1);
  }
  return banked;
}
