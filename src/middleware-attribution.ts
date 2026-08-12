/**
 * Edge-safe attribution + consent helpers for middleware.
 *
 * Kept OUT of `@/lib/*` so middleware can import them without blowing the
 * 1 MB Edge bundle limit. Cookie/policy names must stay in sync with
 * `src/lib/cookies.ts` and `src/lib/legal-constants.ts` by hand.
 */

export const REF_COOKIE_NAME = "abtalks_ref";
export const REF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export const SRC_COOKIE_NAME = "abtalks_src";
export const SRC_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const CONSENT_COOKIE_NAME = "abtalks_consent";
/** Must match COOKIE_POLICY_VERSION in legal-constants.ts. */
export const CONSENT_POLICY_VERSION = "2026-08-10";

/** Returns the stored choice, or null if absent or from an older policy version. */
export function readConsentChoice(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  if (value.slice(dot + 1) !== CONSENT_POLICY_VERSION) return null;
  const choice = value.slice(0, dot);
  return choice === "all" || choice === "limited" || choice === "essential"
    ? choice
    : null;
}

/** Valid `?ref=` / `?s=` token shape shared by middleware cookie setters. */
export function isValidTrackingToken(value: string | null): boolean {
  if (!value || value.length > 32) return false;
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export type AttributionPlan =
  | { kind: "noop" }
  | { kind: "clear" }
  | {
      kind: "set";
      ref: string | null;
      src: string | null;
      alreadyAttributed: boolean;
    };

/**
 * Decide whether middleware should set, clear, or ignore attribution cookies
 * given the visitor's consent choice.
 */
export function planAttribution(args: {
  consent: string | null;
  ref: string | null;
  src: string | null;
  alreadyAttributed: boolean;
  hasAttributionCookies: boolean;
}): AttributionPlan {
  const { consent, ref, src, alreadyAttributed, hasAttributionCookies } = args;

  // No decision yet: set nothing. The consent modal captures `?ref=` / `?s=`
  // from the URL and replays them through setCookieConsentAction on accept.
  if (consent === null) return { kind: "noop" };

  // Declined: never set attribution, and expire anything already present.
  if (consent === "essential") {
    return hasAttributionCookies ? { kind: "clear" } : { kind: "noop" };
  }

  return { kind: "set", ref, src, alreadyAttributed };
}
