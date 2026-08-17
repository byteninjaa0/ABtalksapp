/**
 * Cookie written by the login page before OAuth redirect so newsletter
 * opt-out survives the round-trip. Read in auth `events.createUser`.
 */
export const NEWSLETTER_PREF_COOKIE = "abtalks_newsletter_pref";

/**
 * Maps the login newsletter preference cookie to an opt-in boolean.
 * Missing / unknown values default to opted-in (matches pre-checked UI).
 */
export function newsletterOptInFromPrefCookie(
  value: string | undefined,
): boolean {
  if (value === "0") return false;
  if (value === "1") return true;
  return true;
}
