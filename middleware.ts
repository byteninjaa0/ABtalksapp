import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";
import {
  CONSENT_COOKIE_NAME,
  REF_COOKIE_MAX_AGE,
  REF_COOKIE_NAME,
  SRC_COOKIE_MAX_AGE,
  SRC_COOKIE_NAME,
  isValidTrackingToken,
  planAttribution,
  readConsentChoice,
} from "@/middleware-attribution";

const { auth } = NextAuth(authConfig);

const protectedPaths = [
  "/dashboard",
  "/explore",
  "/challenge/",
  "/profile",
  "/achievements",
  "/quiz",
  "/register",
  "/admin",
  "/jobs",
  "/mission",
  "/program/apply",
  "/program/assessment",
  "/program/dashboard",
  "/program/day",
  "/program/curriculum",
  "/program/videos",
  "/program/leaderboard",
  "/program/interview",
  "/talent",
  "/hackathon/register",
  "/hackathon/dashboard",
  "/hackathon/submission",
];

function applyRefCookie(response: NextResponse, ref: string | null) {
  if (!isValidTrackingToken(ref)) {
    return response;
  }

  response.cookies.set(REF_COOKIE_NAME, ref!, {
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
  if (!isValidTrackingToken(src)) {
    return response;
  }

  response.cookies.set(SRC_COOKIE_NAME, src!.toLowerCase(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SRC_COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

function withTracking(
  response: NextResponse,
  ref: string | null,
  src: string | null,
  alreadyAttributed: boolean,
  consent: string | null,
  hasAttributionCookies: boolean,
) {
  const plan = planAttribution({
    consent,
    ref,
    src,
    alreadyAttributed,
    hasAttributionCookies,
  });

  if (plan.kind === "noop") return response;

  if (plan.kind === "clear") {
    response.cookies.delete(REF_COOKIE_NAME);
    response.cookies.delete(SRC_COOKIE_NAME);
    return response;
  }

  return applySourceCookie(
    applyRefCookie(response, plan.ref),
    plan.src,
    plan.alreadyAttributed,
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const ref = req.nextUrl.searchParams.get("ref");
  const src = req.nextUrl.searchParams.get("s");
  const alreadyAttributed = req.cookies.has(SRC_COOKIE_NAME);
  const consent = readConsentChoice(
    req.cookies.get(CONSENT_COOKIE_NAME)?.value,
  );
  const hasAttributionCookies =
    req.cookies.has(REF_COOKIE_NAME) || alreadyAttributed;

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname === "/login";

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("from", pathname + req.nextUrl.search);
    return withTracking(
      NextResponse.redirect(url),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
    );
  }

  if (isAuthPage && isLoggedIn) {
    const from = req.nextUrl.searchParams.get("from");
    const destination =
      from && from.startsWith("/") && !from.startsWith("//")
        ? from
        : "/";
    return withTracking(
      NextResponse.redirect(new URL(destination, req.nextUrl)),
      ref,
      src,
      alreadyAttributed,
      consent,
      hasAttributionCookies,
    );
  }

  return withTracking(
    NextResponse.next(),
    ref,
    src,
    alreadyAttributed,
    consent,
    hasAttributionCookies,
  );
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
