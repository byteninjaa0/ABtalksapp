import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/auth.config";

const REF_COOKIE_NAME = "abtalks_ref";
const REF_COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

const SRC_COOKIE_NAME = "abtalks_src";
const SRC_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

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
  "/hire",
  "/hackathon/register",
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

function withTracking(
  response: NextResponse,
  ref: string | null,
  src: string | null,
  alreadyAttributed: boolean,
) {
  return applySourceCookie(applyRefCookie(response, ref), src, alreadyAttributed);
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const ref = req.nextUrl.searchParams.get("ref");
  const src = req.nextUrl.searchParams.get("s");
  const alreadyAttributed = req.cookies.has(SRC_COOKIE_NAME);

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname === "/login";

  if (isProtected && !isLoggedIn) {
    const url = new URL("/login", req.nextUrl);
    url.searchParams.set("from", pathname + req.nextUrl.search);
    return withTracking(NextResponse.redirect(url), ref, src, alreadyAttributed);
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
    );
  }

  return withTracking(NextResponse.next(), ref, src, alreadyAttributed);
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};
