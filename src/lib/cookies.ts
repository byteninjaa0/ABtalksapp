import { cookies } from "next/headers";
import { COOKIE_POLICY_VERSION } from "@/lib/legal-constants";

export const REF_COOKIE_NAME = "klymb_ref";
const REF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

export const SRC_COOKIE_NAME = "klymb_src";
const SRC_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export const CONSENT_COOKIE_NAME = "klymb_consent";
const CONSENT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60; // 180 days

/**
 * `all` — attribution cookies + YouTube thumbnails
 * `limited` — attribution cookies, nothing requested from Google until play
 * `essential` — session cookie only
 */
export const COOKIE_CHOICES = ["all", "limited", "essential"] as const;
export type CookieChoice = (typeof COOKIE_CHOICES)[number];

/** Attribution is only permitted on these choices. */
export function allowsAttribution(choice: CookieChoice | null): boolean {
  return choice === "all" || choice === "limited";
}

/** Only callable from Server Actions or Route Handlers — not from RSC pages. */
export async function setRefCookie(code: string) {
  if (!code || code.length > 32) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return;

  const store = await cookies();
  store.set(REF_COOKIE_NAME, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REF_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function getRefCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(REF_COOKIE_NAME)?.value ?? null;
}

export async function clearRefCookie() {
  const store = await cookies();
  store.delete(REF_COOKIE_NAME);
}

/** Only callable from Server Actions or Route Handlers — not from RSC pages. */
export async function setSrcCookie(slug: string) {
  if (!slug || slug.length > 32) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return;

  const store = await cookies();
  // First touch wins: never overwrite an existing attribution.
  if (store.get(SRC_COOKIE_NAME)) return;

  store.set(SRC_COOKIE_NAME, slug.toLowerCase(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SRC_COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function clearAttributionCookies() {
  const store = await cookies();
  store.delete(REF_COOKIE_NAME);
  store.delete(SRC_COOKIE_NAME);
}

/**
 * Stored as `<choice>.<policy version>` so bumping COOKIE_POLICY_VERSION
 * invalidates every stored choice and re-prompts.
 */
export async function setConsentCookie(choice: CookieChoice) {
  const store = await cookies();
  store.set(CONSENT_COOKIE_NAME, `${choice}.${COOKIE_POLICY_VERSION}`, {
    httpOnly: false, // the client reads this to decide whether to prompt
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: CONSENT_COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Returns the stored choice, or null if absent or from an older policy version. */
export async function getConsentChoice(): Promise<CookieChoice | null> {
  const store = await cookies();
  return parseConsentCookie(store.get(CONSENT_COOKIE_NAME)?.value);
}

export function parseConsentCookie(
  raw: string | undefined,
): CookieChoice | null {
  if (!raw) return null;
  const [choice, version] = raw.split(".");
  if (version !== COOKIE_POLICY_VERSION) return null;
  return COOKIE_CHOICES.includes(choice as CookieChoice)
    ? (choice as CookieChoice)
    : null;
}
