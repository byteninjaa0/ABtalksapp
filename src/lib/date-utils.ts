import { addDays, differenceInCalendarDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

const IST = "Asia/Kolkata";

/** Parse an IST calendar key `yyyy-MM-dd` to a UTC Date at that civil date. */
export function parseCalendarKeyToUtcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Add N civil calendar days to a `yyyy-MM-dd` key using UTC arithmetic.
 * Do not reformat UTC-midnight keys through a behind-UTC zone (e.g. Chicago) —
 * that shifts the key back one day and drops day-0 seeds / heatmap lookups.
 */
export function addCalendarDaysToKey(key: string, days: number): string {
  return formatInTimeZone(
    addDays(parseCalendarKeyToUtcDate(key), days),
    "UTC",
    "yyyy-MM-dd",
  );
}

/** Current moment formatted in IST (readable). */
export function getNowInIST(): string {
  return formatInTimeZone(new Date(), IST, "EEEE, d MMM yyyy, h:mm a zzz");
}

/** Today's IST calendar key (`yyyy-MM-dd`). */
export function getTodayIstDateKey(): string {
  return formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
}

type EnrollmentDayAnchor = { startedAt: Date };
type ChallengeSyncStart = { startsAt?: Date | null };

function referenceStartDate(
  startedAt: Date,
  challenge?: ChallengeSyncStart,
): Date {
  // No synchronized start (SE/DS/AI): rolling from enrollment date
  if (challenge?.startsAt == null) return startedAt;
  // Synchronized challenge (CLAUDE): cohort start is a floor.
  // Enrolled before the start → wait for the start date (cohort kickoff).
  // Enrolled on/after the start → start immediately from enrollment date.
  return challenge.startsAt > startedAt ? challenge.startsAt : startedAt;
}

/**
 * Challenge day 1 = IST calendar day of the reference start
 * (max of `challenge.startsAt` and `enrollment.startedAt` when synchronized,
 * otherwise `enrollment.startedAt`).
 * Each subsequent IST calendar day increments by 1. Capped at 60.
 * Before the effective start (IST), returns 0 so callers treat all days as locked.
 */
/** IST calendar date string for challenge day `dayNumber` (1 = first IST day of the reference start). */
export function getIstDateKeyForChallengeDay(
  enrollment: EnrollmentDayAnchor | Date,
  dayNumber: number,
  challenge?: ChallengeSyncStart,
): string {
  const startedAt =
    enrollment instanceof Date ? enrollment : enrollment.startedAt;
  const ref = referenceStartDate(startedAt, challenge);
  const startKey = formatInTimeZone(ref, IST, "yyyy-MM-dd");
  const base = parseCalendarKeyToUtcDate(startKey);
  const dayDate = addDays(base, dayNumber - 1);
  return formatInTimeZone(dayDate, IST, "yyyy-MM-dd");
}

/** True when the selected challenge has a future synchronized start (IST calendar). */
export function isChallengePreStart(challenge?: ChallengeSyncStart): boolean {
  if (challenge?.startsAt == null) return false;
  const startKey = formatInTimeZone(challenge.startsAt, IST, "yyyy-MM-dd");
  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const startUtc = parseCalendarKeyToUtcDate(startKey);
  const nowUtc = parseCalendarKeyToUtcDate(nowKey);
  return nowUtc < startUtc;
}

/**
 * True when this specific enrollment hasn't started yet.
 * For synchronized challenges: pre-start until the effective start
 * (max of challenge.startsAt and enrollment.startedAt) is reached in IST.
 * For rolling challenges: never pre-start (starts on enrollment).
 */
export function isEnrollmentPreStart(
  enrollment: EnrollmentDayAnchor | Date,
  challenge?: ChallengeSyncStart,
): boolean {
  if (challenge?.startsAt == null) return false;

  const startedAt =
    enrollment instanceof Date ? enrollment : enrollment.startedAt;
  const ref = referenceStartDate(startedAt, challenge);
  const refKey = formatInTimeZone(ref, IST, "yyyy-MM-dd");
  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const refUtc = parseCalendarKeyToUtcDate(refKey);
  const nowUtc = parseCalendarKeyToUtcDate(nowKey);
  return nowUtc < refUtc;
}

export function getCurrentDayNumber(
  enrollment: EnrollmentDayAnchor | Date,
  challenge?: ChallengeSyncStart,
): number {
  const startedAt =
    enrollment instanceof Date ? enrollment : enrollment.startedAt;
  const ref = referenceStartDate(startedAt, challenge);
  const startKey = formatInTimeZone(ref, IST, "yyyy-MM-dd");
  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const startUtc = parseCalendarKeyToUtcDate(startKey);
  const nowUtc = parseCalendarKeyToUtcDate(nowKey);

  if (challenge?.startsAt != null && nowUtc < startUtc) {
    return 0;
  }

  const diff = differenceInCalendarDays(nowUtc, startUtc);
  const day = diff + 1;
  return Math.min(60, Math.max(1, day));
}

/**
 * Elapsed challenge day, UNCAPPED — day 61+ once a student passes day 60.
 * Use this ONLY to decide whether a day is in the past (backfill / relaxation
 * window). Everything user-facing (unlock checks, display, streaks) must keep
 * using `getCurrentDayNumber`, which caps at 60.
 *
 * Returns 0 before a synchronized challenge's effective start, matching
 * `getCurrentDayNumber`.
 */
export function getElapsedDayNumber(
  enrollment: EnrollmentDayAnchor | Date,
  challenge?: ChallengeSyncStart,
): number {
  const startedAt =
    enrollment instanceof Date ? enrollment : enrollment.startedAt;
  const ref = referenceStartDate(startedAt, challenge);
  const startKey = formatInTimeZone(ref, IST, "yyyy-MM-dd");
  const nowKey = formatInTimeZone(new Date(), IST, "yyyy-MM-dd");
  const startUtc = parseCalendarKeyToUtcDate(startKey);
  const nowUtc = parseCalendarKeyToUtcDate(nowKey);

  if (challenge?.startsAt != null && nowUtc < startUtc) {
    return 0;
  }

  return Math.max(1, differenceInCalendarDays(nowUtc, startUtc) + 1);
}

/** e.g. "15 Mar 2026" in IST */
export function formatDateIST(date: Date): string {
  return formatInTimeZone(date, IST, "d MMM yyyy");
}

export function formatDateTimeIST(date: Date): string {
  return formatInTimeZone(date, IST, "d MMM yyyy, h:mm a");
}

/** Inclusive IST calendar range [startKey 00:00 IST, endKey 24:00 IST) → UTC
 *  instants for a createdAt filter. Either bound may be omitted (open-ended). */
export function istDateRangeToUtc(
  startKey?: string,
  endKey?: string,
): { startUtc?: Date; endExclusiveUtc?: Date } {
  const startUtc = startKey
    ? fromZonedTime(`${startKey}T00:00:00`, IST)
    : undefined;
  let endExclusiveUtc: Date | undefined;
  if (endKey) {
    const nextKey = formatInTimeZone(
      addDays(parseCalendarKeyToUtcDate(endKey), 1),
      "UTC",
      "yyyy-MM-dd",
    );
    endExclusiveUtc = fromZonedTime(`${nextKey}T00:00:00`, IST);
  }
  return { startUtc, endExclusiveUtc };
}

export { IST };
