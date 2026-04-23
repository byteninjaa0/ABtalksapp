import { addDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

const IST = "Asia/Kolkata";

/** Parse an IST calendar key `yyyy-MM-dd` to a UTC Date at that civil date. */
export function parseCalendarKeyToUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Current moment formatted in IST (readable). */
export function getNowInIST(): string {
  return formatInTimeZone(new Date(), IST, "EEEE, d MMM yyyy, h:mm a zzz");
}

/**
 * Challenge day 1 = IST calendar day of `startedAt`.
 * Each subsequent IST calendar day increments by 1. Capped at 60, minimum 1.
 */
/** IST calendar date string for challenge day `dayNumber` (1 = first IST day of enrollment). */
export function getIstDateKeyForChallengeDay(
  startedAt: Date,
  dayNumber: number,
): string {
  const startKey = formatInTimeZone(startedAt, IST, "yyyy-MM-dd");
  const base = parseCalendarKeyToUtcDate(startKey);
  const dayDate = addDays(base, dayNumber - 1);
  return formatInTimeZone(dayDate, IST, "yyyy-MM-dd");
}

export function getCurrentDayNumber(startedAt: Date): number {
  const startKey = formatInTimeZone(startedAt, IST, "yyyy-MM-dd");
  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const diff = differenceInCalendarDays(
    parseCalendarKeyToUtcDate(nowKey),
    parseCalendarKeyToUtcDate(startKey),
  );
  const day = diff + 1;
  return Math.min(60, Math.max(1, day));
}

/** e.g. "15 Mar 2026" in IST */
export function formatDateIST(date: Date): string {
  return formatInTimeZone(date, IST, "d MMM yyyy");
}

export function formatDateTimeIST(date: Date): string {
  return formatInTimeZone(date, IST, "d MMM yyyy, h:mm a");
}

export { IST };
