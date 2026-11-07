"use server";

import { cookies } from "next/headers";

const REF_COOKIE_NAME = "klymb_ref";
const REF_COOKIE_MAX_AGE = 10 * 60; // 10 minutes

export async function setReferralCookie(code: string) {
  // Validate format: 6 uppercase alphanumeric
  if (!/^[A-Z0-9]{6}$/.test(code)) return;

  const cookieStore = await cookies();
  cookieStore.set(REF_COOKIE_NAME, code, {
    maxAge: REF_COOKIE_MAX_AGE,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function getReferralCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(REF_COOKIE_NAME)?.value ?? null;
}

export async function clearReferralCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(REF_COOKIE_NAME);
}
