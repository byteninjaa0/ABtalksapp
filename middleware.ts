import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig, { OAUTH_CHECK_COOKIE_NAMES } from "@/auth.config";

const REF_COOKIE_NAME = "klymb_ref";
const REF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const SRC_COOKIE_NAME = "klymb_src";
const SRC_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

// Kept in sync by hand with `src/lib/legal.ts` (COOKIE_POLICY_VERSION) and
// `src/lib/cookies.ts`. Middleware must not import from `@/lib/*` — doing so
// blows the 1 MB Edge bundle limit. This duplication is deliberate.
const CONSENT_COOKIE_NAME = "klymb_consent";
const CONSENT_POLICY_VERSION = "2026-08-10";

/** Returns the stored choice, or null if absent or from an older policy version. */
function readConsentChoice(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  if (value.slice(dot + 1) !== CONSENT_POLICY_VERSION) return null;
  const choice = value.slice(0, dot);
  return choice === "all" || choice === "limited" || choice === "essential"
    ? choice
    : null;
}

/**
 * T-259 request correlation.
 *
 * Duplicated by hand from `src/lib/observability/request-id.ts` for the same
 * reason the consent constants above are: middleware must not import from
 * `@/lib/*`. Keep the header name and the pattern in sync with that file.
 */
const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The caller's id when it is well-formed, a fresh one otherwise.
 *
 * An inbound `x-request-id` is honoured so a trace started by a proxy or a
 * client retry stays one trace — but only after the pattern check, because the
 * value is echoed back in a response header and copied into Sentry tags, and
 * neither should carry whatever a stranger felt like sending.
 */
function resolveRequestId(incoming: string | null): string {
  return incoming && REQUEST_ID_RE.test(incoming)
    ? incoming
    : crypto.randomUUID();
}

const { auth } = NextAuth(authConfig);

/* -------------------------------------------------------------------------
 * Plans 191 + 192, TEMPORARY: the launch gate.
 *
 * While `LANDING_ONE_PAGER` is anything but "false", the only thing the public
 * gets is the launch one-pager at `/`. Everything else — the candidate product
 * and the recruiter product alike — redirects there, for signed-out and
 * signed-in visitors both.
 *
 * This is a MARKETING GATE, NOT A SECURITY BOUNDARY. Every route keeps the
 * authorization it already had: `protectedPaths` below still sends signed-out
 * visitors to their door, and every page guard is untouched. Removing this
 * gate re-opens the product; it never exposes anything that was protected.
 *
 * Read from `process.env` by hand, duplicating `src/lib/feature-flags.ts`:
 * middleware must not import from `@/lib/*` — doing so blows the 1 MB Edge
 * bundle limit, the same reason the consent constants above are duplicated.
 * Keep the two in step.
 * ---------------------------------------------------------------------- */

/**
 * What answers while the gate is on. Everything not listed redirects to `/`.
 * Prefixes match the path itself and anything under it.
 *
 * Each line earns its place:
 *   /         the one-pager itself
 *   /terms /privacy /cookies
 *             the footer and consent-banner links, which have to be reachable.
 *   /verify   the address printed on every certificate already issued. Closing
 *             it would break verification for the people holding those links.
 *
 * `/api/auth/*` needs no entry — the matcher at the bottom never sees it.
 *
 * `/login` is deliberately NOT here. It was, and the result was that a
 * stranger could reach the sign-in form, authenticate, and land back on the
 * launch page holding a session that opened nothing — which looked, from the
 * outside, exactly like a hole in the gate. It is now behind a preview link
 * like everything else: open the link, then sign in. The cost is real and was
 * accepted deliberately — on a browser with no preview cookie and no session,
 * NOBODY can sign in, admins included. The way back in is the preview link,
 * so losing both links means fixing it in the Vercel dashboard, not here.
 *
 * The recruiter door, /talent/login, sits inside RECRUITER_PATHS and so opens
 * with the recruiter link, not the candidate one.
 */
const GATE_PUBLIC_PATHS = [
  "/",
  // The launch page offers "Sign in" again, so the candidate door answers for
  // everyone. It is a form, not a surface: passing it needs an account, and
  // what an account then opens is the short list below. The RECRUITER door,
  // /talent/login, stays behind the gate.
  "/login",
  // Plan 194: where an invited HR's emailed sign-in link lands. Public of
  // necessity — an invited recruiter holds no preview cookie — and worthless
  // without a live token, which the route itself spends and verifies.
  "/hr/signin",
  "/terms",
  "/privacy",
  "/cookies",
  "/verify",
] as const;

/**
 * The candidate product is OPEN. Registration, the tracks, the dashboard and
 * everything around them behave exactly as they did before the launch gate —
 * the one-pager is simply what `/` shows.
 *
 * What the gate still holds is the recruiter product below, and the job board,
 * which is the candidate's half of the same thing (see HIRING_PATHS).
 */

/**
 * The hiring side, as a candidate meets it. Hidden with the dashboard's "Get
 * hired" stage so the platform reads as somewhere you learn, not somewhere you
 * are hired. `HIDE_GET_HIRED=false` restores it; nothing is deleted.
 */
const HIRING_PATHS = ["/jobs"] as const;

/** The recruiter product. The candidate preview link does NOT open these. */
const RECRUITER_PATHS = ["/hire", "/talent", "/recruiter-onboarding"] as const;

const PREVIEW_COOKIE = {
  candidate: "klymb_preview_candidate",
  recruiter: "klymb_preview_recruiter",
} as const;

/**
 * The two preview accounts, by hand — middleware cannot import `@/lib/*`
 * (Edge bundle), so this duplicates `PREVIEW_EMAIL` in
 * `features/preview/preview-accounts.ts`. Keep them in step.
 *
 * Used only to notice that a browser holding both preview cookies is signed in
 * on the WRONG side for the page it just asked for. One session is one account,
 * so holding both links cannot mean being both at once — what it can mean is
 * switching without being dumped on a signup form, which is what this enables.
 */
const PREVIEW_EMAIL = {
  candidate: "preview-candidate@klymb.ai",
  recruiter: "preview-recruiter@klymb.ai",
} as const;

/** 30 days. Long enough that the team is not re-pasting the link every week. */
const PREVIEW_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

function matchesPath(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

const protectedPaths = [
  "/dashboard",
  "/explore",
  "/challenge/",
  "/claude/day",
  "/profile",
  "/achievements",
  "/quiz",
  "/register",
  "/admin",
  "/jobs",
  "/assessments",
  "/mission",
  "/program/ai-cohort/apply",
  "/program/ai-cohort/assessment",
  "/program/ai-cohort/dashboard",
  "/program/ai-cohort/day",
  "/program/ai-cohort/curriculum",
  "/program/ai-cohort/videos",
  "/program/ai-cohort/leaderboard",
  "/program/ai-cohort/cohort-interview",
  "/program/databricks",
  "/program/ds-architect",
  "/program/powerbi",
  "/program/snowflake",
  "/program/databricks-ai",
  "/program/langchain",
  "/talent",
  "/hire",
  "/hackathon/dashboard",
  "/hackathon/submission",
];

function applyRefCookie(response: NextResponse, ref: string | null) {
  if (!ref || ref.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(ref)) {
    return response;
  }

  response.cookies.set(REF_COOKIE_NAME, ref, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: REF_COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

function applySourceCookie(
  response: NextResponse,
  src: string | null,
  alreadyAttributed: boolean,
) {
  // First touch wins: never overwrite an existing attribution.
  if (alreadyAttributed) return response;
  if (!src || src.length > 32 || !/^[a-zA-Z0-9_-]+$/.test(src)) {
    return response;
  }

  response.cookies.set(SRC_COOKIE_NAME, src.toLowerCase(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SRC_COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

/**
 * Drop leftover Auth.js PKCE/state/nonce cookies. A stale verifier from a
 * previous Google attempt decrypts as InvalidCheck and 500s /api/auth/error —
 * especially when switching accounts.
 *
 * HOST-ONLY, one Set-Cookie per name. This used to loop over
 * `[undefined, <the old shared cookie domain>]` to also clear the cookies `auth.config.ts`
 * widened — but `response.cookies.set` keys by NAME, so the second iteration
 * overwrote the first and only the old-domain variant was ever emitted.
 * Measured on the live deploy: 12 names in, 12 Set-Cookie headers out, every
 * one carrying the old shared `Domain=` attribute. The sweep has therefore never cleared a
 * host-only cookie — the exact case it exists for.
 *
 * `auth.config.ts` no longer sets a cookie domain at all (plan 189 §6-A), so
 * host-only is the only scope this app creates and the only one worth
 * clearing. A widened cookie left on a browser from an older deploy is scoped
 * to a domain app.klymb.ai is not under, so it is never sent here and cannot
 * be cleared from here either; it expires on its own 15-minute maxAge.
 */
function expireOAuthCheckCookies(response: NextResponse) {
  for (const name of OAUTH_CHECK_COOKIE_NAMES) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }
}

function withTracking(
  response: NextResponse,
  ref: string | null,
  src: string | null,
  alreadyAttributed: boolean,
  consent: string | null,
  hasAttributionCookies: boolean,
  requestId: string,
) {
  // Every response leaves through here, so this is the one place that has to
  // set the correlation header — redirects included. It is not a cookie and
  // carries nothing about the visitor, so it is outside the consent gate.
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // No decision yet: set nothing. The consent modal captures `?ref=` / `?s=`
  // from the URL and replays them through setCookieConsentAction on accept.
  if (consent === null) return response;

  // Declined: never set attribution, and expire anything already present.
  if (consent === "essential") {
    if (hasAttributionCookies) {
      response.cookies.delete(REF_COOKIE_NAME);
      response.cookies.delete(SRC_COOKIE_NAME);
    }
    return response;
  }

  return applySourceCookie(applyRefCookie(response, ref), src, alreadyAttributed);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const requestId = resolveRequestId(req.headers.get(REQUEST_ID_HEADER));
  const isLoggedIn = !!req.auth;
  const ref = req.nextUrl.searchParams.get("ref");
  const src = req.nextUrl.searchParams.get("s");
  const alreadyAttributed = req.cookies.has(SRC_COOKIE_NAME);
  const consent = readConsentChoice(
    req.cookies.get(CONSENT_COOKIE_NAME)?.value,
  );
  const hasAttributionCookies =
    req.cookies.has(REF_COOKIE_NAME) || alreadyAttributed;

  // Exact match only — `/ai` must not capture `/ai-cohort-*` or
  // `/ai-talent-hunt`, and `/claude` must not capture `/claude-signup`.
  // Both of those are public.
  const exactProtectedPaths = ["/ai", "/ds", "/se", "/claude"];

  // Scout itself is public. Auth is a dialog on this page, or a dedicated
  // register/login route. Exact match only: /hire/requests and /hire/[id]
  // stay behind a session. Same for the cart — guests keep it locally.
  const isPublicRecruiterEntry =
    pathname === "/hire" ||
    pathname === "/talent" ||
    pathname === "/hire/matches" ||
    pathname === "/talent/shortlist" ||
    pathname === "/talent/login" ||
    pathname === "/talent/register";

  // Marketing landings only. The protectedPaths prefixes stay, so
  // /program/databricks/day/*, /program/snowflake/day/*, and
  // /program/databricks-ai/day/* and /program/langchain/day/* still require a
  // session. Exact match: `/program/databricks` must not open
  // `/program/databricks-ai`.
  const isPublicCohortLanding =
    pathname === "/program/databricks" ||
    pathname === "/program/snowflake" ||
    pathname === "/program/databricks-ai" ||
    pathname === "/program/langchain";

  const isProtected =
    !isPublicRecruiterEntry &&
    !isPublicCohortLanding &&
    (protectedPaths.some((p) => pathname.startsWith(p)) ||
      exactProtectedPaths.includes(pathname));
  const isAuthPage = pathname === "/login";

  // See GATE_PUBLIC_PATHS above for what this is and what it is not.
  const gateOn = process.env.LANDING_ONE_PAGER !== "false";

  // An admin passes both sides without a link; the two preview cookies each
  // open their own side and NOT the other, so the candidate link handed to a
  // designer never opens the hire desk.
  const isAdminSession =
    req.auth?.user?.isAdmin === true ||
    (req.auth?.user as { role?: string } | undefined)?.role === "ADMIN";
  const candidateToken = process.env.PREVIEW_TOKEN_CANDIDATE;
  const recruiterToken = process.env.PREVIEW_TOKEN_RECRUITER;
  const hasCandidatePreview =
    !!candidateToken &&
    req.cookies.get(PREVIEW_COOKIE.candidate)?.value === candidateToken;
  const hasRecruiterPreview =
    !!recruiterToken &&
    req.cookies.get(PREVIEW_COOKIE.recruiter)?.value === recruiterToken;

  const isRecruiterSurface = RECRUITER_PATHS.some((p) => matchesPath(pathname, p));
  // Where a preview link lands (plan 193). It is not a product surface and
  // belongs to neither side, so either cookie reaches it — a recruiter-cookie
  // browser has to get here too, and /preview is not inside RECRUITER_PATHS.
  const isPreviewEntry = matchesPath(pathname, "/preview");
  /**
   * Plan 194: an invited HR signs in to their OWN recruiter account and holds
   * no preview cookie, so the desk has to open for a recruiter SESSION too.
   *
   * This widens the launch gate, deliberately and narrowly. What it does not
   * do is create a way in: a session can only be obtained through a door that
   * is itself behind the gate — /login and /talent/login both are — or through
   * an invite link issued by an admin. And it changes no authorization: every
   * recruiter surface keeps the checks it already had, `/hire/*` beyond the
   * public entry still requires a session, and the hire layout still resolves
   * the RecruiterProfile for itself.
   */
  const isRecruiterSession =
    (req.auth?.user as { role?: string } | undefined)?.role === "RECRUITER";

  const isCandidateSession =
    !!req.auth?.user &&
    (req.auth.user as { role?: string }).role !== "RECRUITER" &&
    !isAdminSession;

  // The job board goes with the dashboard's hiring stage. Read by hand rather
  // than through isGetHiredHidden(), for the usual Edge-bundle reason.
  const hideHiring = process.env.HIDE_GET_HIRED !== "false";
  const isHiringPath = HIRING_PATHS.some((p) => matchesPath(pathname, p));

  // Only the recruiter side still asks this question — the candidate product
  // is open — plus /preview/enter, which belongs to neither side.
  const mayPass = isPreviewEntry
    ? isAdminSession || hasCandidatePreview || hasRecruiterPreview
    : isAdminSession || hasRecruiterPreview || isRecruiterSession;

  // Only two things are still held back: the recruiter product, and the
  // hiring paths a candidate would meet. Everything else on the candidate side
  // is open to everyone, signed in or not.
  const gated =
    (gateOn && isRecruiterSurface && !mayPass) ||
    (hideHiring && isHiringPath && !isAdminSession);

  /**
   * Signed in as one side's preview account, asking for the other side's
   * product, holding a valid link for it.
   *
   * Without this, opening both links in one browser half-works: the second
   * link switches the session, and going back to the first side lands on
   * /register (no CandidateProfile) or an empty desk (no RecruiterProfile).
   * Both links in one browser is the normal way to look at the platform, so
   * the switch happens here instead of being the visitor's problem.
   *
   * Only ever redirects between accounts this browser already holds valid
   * links for; it opens nothing new.
   */
  const sessionEmail = req.auth?.user?.email ?? null;
  const wrongSide =
    gateOn && !isPreviewEntry
      ? isRecruiterSurface &&
        sessionEmail === PREVIEW_EMAIL.candidate &&
        hasRecruiterPreview
        ? "recruiter"
        : !isRecruiterSurface &&
            sessionEmail === PREVIEW_EMAIL.recruiter &&
            hasCandidatePreview &&
            !GATE_PUBLIC_PATHS.some((p) => matchesPath(pathname, p))
          ? "candidate"
          : null
      : null;

  /**
   * The unlock, handled before everything else.
   *
   * `?preview=<token>` sets that side's cookie and bounces to the same URL
   * without the parameter, so the secret never settles in the address bar, the
   * browser history or a `Referer` header on the next outbound click.
   * `?preview=off` clears both. A value matching neither sets nothing and is
   * answered exactly like `off` — a wrong guess must not learn which of the
   * two it nearly was.
   */
  const previewParam = req.nextUrl.searchParams.get("preview");

  let response: NextResponse;

  if (gateOn && previewParam !== null) {
    const clean = new URL(req.nextUrl);
    clean.searchParams.delete("preview");
    // A link that matched goes to /preview/enter, which signs the browser in
    // as that side's preview account (plan 193). Anything else — "off", a
    // typo, a stranger guessing — lands wherever it was headed, with the
    // parameter stripped and no cookie, which for a gated path is `/`.
    const matched =
      (candidateToken && previewParam === candidateToken) ||
      (recruiterToken && previewParam === recruiterToken);
    if (matched) {
      clean.pathname = "/preview/enter";
      clean.search = "";
    }
    response = withTracking(
      NextResponse.redirect(clean),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );

    const side =
      candidateToken && previewParam === candidateToken
        ? "candidate"
        : recruiterToken && previewParam === recruiterToken
          ? "recruiter"
          : null;

    if (side) {
      response.cookies.set(PREVIEW_COOKIE[side], previewParam, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: PREVIEW_COOKIE_MAX_AGE,
        path: "/",
      });
    } else {
      // "off", a typo, or a stranger trying values: leave with nothing.
      response.cookies.delete(PREVIEW_COOKIE.candidate);
      response.cookies.delete(PREVIEW_COOKIE.recruiter);
    }
  } else if (wrongSide) {
    const swap = new URL("/preview/enter", req.nextUrl);
    swap.searchParams.set("side", wrongSide);
    response = withTracking(
      NextResponse.redirect(swap),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );
  } else if (gated) {
    // Ahead of the session gate on purpose: a signed-out visitor to /hire or
    // /dashboard must land on the launch page, not on a login form for a
    // product that is currently closed.
    //
    // A signed-in candidate is not a stranger, though: an area that is still
    // shut sends them back to their own dashboard rather than out to the
    // countdown.
    // A signed-in candidate who opens the job board belongs back on their
    // dashboard; a stranger at the recruiter door belongs on the launch page.
    const closedFor =
      isCandidateSession && !isRecruiterSurface ? "/dashboard" : "/";
    response = withTracking(
      NextResponse.redirect(new URL(closedFor, req.nextUrl)),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );
  } else if (isProtected && !isLoggedIn) {
    // Send people to their own door. A signed-out recruiter opening a
    // bookmarked /hire used to land on the candidate's Google button, which is
    // the whole complaint this change exists to fix.
    const isRecruiterArea =
      pathname === "/hire" ||
      pathname.startsWith("/hire/") ||
      pathname === "/talent" ||
      pathname.startsWith("/talent/");
    const url = new URL(
      isRecruiterArea ? "/talent/login" : "/login",
      req.nextUrl,
    );
    url.searchParams.set("from", pathname + req.nextUrl.search);
    response = withTracking(
      NextResponse.redirect(url),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );
  } else if (isAuthPage && isLoggedIn) {
    const from = req.nextUrl.searchParams.get("from");
    const destination =
      from && from.startsWith("/") && !from.startsWith("//")
        ? from
        : "/";
    response = withTracking(
      NextResponse.redirect(new URL(destination, req.nextUrl)),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );
  } else {
    // Forwarded so Server Components, Server Actions and route handlers can read
    // the id back out of `headers()` — see `@/lib/observability/request-id`.
    const forwarded = new Headers(req.headers);
    forwarded.set(REQUEST_ID_HEADER, requestId);

    response = withTracking(
      NextResponse.next({ request: { headers: forwarded } }),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
      requestId,
    );
  }

  if (pathname === "/login") expireOAuthCheckCookies(response);
  return response;
});

export const config = {
  matcher: [
    /**
     * Anything with a file extension is skipped, and that last clause is not
     * cosmetic: `public/` files sit at the site root, so `public/hire/
     * shortlist.jpg` is served at `/hire/shortlist.jpg` — which starts with
     * `/hire`, which this middleware protects. The desk's own icons were being
     * answered with a 307 to `/talent/login`, so the `<img>` received the login
     * page's HTML and rendered as nothing. Only `_next/static` was exempt, and
     * `public/` is not `_next/static`.
     *
     * It gates no route that was gated before. A path ending in `.jpg` or `.css`
     * is a file, and a file was never something a session check protected —
     * `/hire/requests` and every other real route still pass through.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.[\\w]+$).*)",
  ],
};
