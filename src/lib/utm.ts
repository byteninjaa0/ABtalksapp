/**
 * T-254 UTM attribution — pure helpers.
 *
 * No React, no `window`, no `next/headers`. Everything here is a function of
 * its arguments so the tests exercise it without a browser.
 */

/** Field names as they appear in URL search params. */
export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** Cookie name for the first-touch record. */
export const UTM_COOKIE = "klymb_utm";

/** 90-day first-touch window. */
export const UTM_COOKIE_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Field-level cap. GA4 caps campaign fields at 100 chars; we accept 200 defensively. */
export const UTM_MAX_LEN = 200;

/**
 * Snake-case URL keys → camel-case columns on `User`. Keeping the mapping in
 * one place so the writer, cookie serialiser and tests never disagree.
 */
export const COLUMN_BY_KEY = {
  utm_source: "utmSource",
  utm_medium: "utmMedium",
  utm_campaign: "utmCampaign",
  utm_term: "utmTerm",
  utm_content: "utmContent",
} as const satisfies Record<UtmKey, string>;

export type UtmValues = Partial<Record<UtmKey, string>>;

/** DB-column view (what we write onto User). */
export type UtmColumns = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
};

/** Trim, clamp, drop empty. Case is preserved so campaign names are exact. */
function normaliseValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > UTM_MAX_LEN ? t.slice(0, UTM_MAX_LEN) : t;
}

/**
 * Pull the five UTM params out of URLSearchParams — or any string-keyed source.
 * Returns undefined when no key is set at all (nothing to persist).
 */
export function readUtm(
  params: URLSearchParams | Record<string, string | undefined>,
): UtmValues | undefined {
  const get = (k: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(k);
    const v = params[k];
    return typeof v === "string" ? v : null;
  };

  const out: UtmValues = {};
  let any = false;
  for (const key of UTM_KEYS) {
    const v = normaliseValue(get(key));
    if (v !== null) {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : undefined;
}

/**
 * Convert to DB column shape, with `null` for missing keys — the User row
 * always writes all five columns, so a later, narrower cookie doesn't leave
 * stale values.
 */
export function toColumns(values: UtmValues | undefined): UtmColumns {
  return {
    utmSource: values?.utm_source ?? null,
    utmMedium: values?.utm_medium ?? null,
    utmCampaign: values?.utm_campaign ?? null,
    utmTerm: values?.utm_term ?? null,
    utmContent: values?.utm_content ?? null,
  };
}

/** Serialise for the cookie payload. Compact JSON — the cookie is not human-facing. */
export function serialiseCookie(values: UtmValues, at: Date): string {
  return JSON.stringify({ v: values, at: at.toISOString() });
}

export type ParsedCookie = { v: UtmValues; at: string };

/** Parse — returns null on any shape violation. Never throws. */
export function parseCookie(raw: string | null | undefined): ParsedCookie | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      !("at" in parsed)
    ) {
      return null;
    }
    const rec = parsed as { v: unknown; at: unknown };
    if (typeof rec.at !== "string") return null;
    if (typeof rec.v !== "object" || rec.v === null) return null;
    const v: UtmValues = {};
    for (const key of UTM_KEYS) {
      const val = (rec.v as Record<string, unknown>)[key];
      const norm = normaliseValue(val);
      if (norm !== null) v[key] = norm;
    }
    return { v, at: rec.at };
  } catch {
    return null;
  }
}
