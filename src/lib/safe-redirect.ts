/**
 * The one place that decides whether a `?from=` / `?callbackUrl=` value is a
 * destination on this site.
 *
 * This existed as five copy-pasted checks — `src/app/talent/login/page.tsx`,
 * `src/app/talent/register/page.tsx`,
 * `src/app/recruiter-onboarding/signin/page.tsx`,
 * `src/app/login/login-client.tsx`, and inline in `middleware.ts` — all of the
 * shape `from.startsWith("/") && !from.startsWith("//")`. That is not enough.
 * A browser normalises a backslash to a forward slash before resolving a URL,
 * so `/\evil.com` passes that check and then resolves to `https://evil.com`;
 * the same is true of `/\/evil.com`. Browsers also strip tab, newline and
 * carriage return from a URL before resolving it, so `/%09/evil.com` and its
 * relatives have to be refused too.
 *
 * `middleware.ts` still carries its own copy, because middleware may not
 * import from `@/lib/*` without blowing the 1 MB Edge bundle. That copy is
 * marked as a duplicate of this one; if the rule changes here, change it there.
 */

/** Backslash and any C0/C7F control character. Never valid in a path we issue. */
const FORBIDDEN = /[\u0000-\u001F\u007F\\]/;

/**
 * `from` when it is a path on this origin, `fallback` otherwise.
 *
 * Rejects, in order: nothing supplied; anything not rooted at `/` (which covers
 * `https://evil.com` and any scheme-relative form); and a second character of
 * `/` or `\`, which is what makes a URL protocol-relative and sends the browser
 * to another host.
 */
export function safeRedirectPath(
  from: string | null | undefined,
  fallback: string,
): string {
  if (!from) return fallback;
  if (!from.startsWith("/")) return fallback;
  if (from.length > 1 && (from[1] === "/" || from[1] === "\\")) return fallback;
  if (FORBIDDEN.test(from)) return fallback;
  return from;
}
