import "server-only";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

/**
 * Security notice after a password is set, changed or reset (plan 188), so
 * the owner of the address hears about it even when someone else did it.
 * Sent as an essential account notice (no List-Unsubscribe, cannot be turned
 * off). Plain one-column text on purpose — the shape Gmail files in Primary.
 * Holds no secret: no password, code or reset link. Never throws.
 */

export type PasswordNoticeKind = "PASSWORD_SET" | "PASSWORD_CHANGED" | "PASSWORD_RESET";

const COPY: Record<PasswordNoticeKind, { subject: string; what: string; signedOut: boolean }> = {
  PASSWORD_CHANGED: {
    subject: "Your ABTalks password was changed",
    what: "The password for your ABTalks account was changed",
    signedOut: true,
  },
  PASSWORD_RESET: {
    subject: "Your ABTalks password was reset",
    what: "The password for your ABTalks account was reset using a code sent to this address",
    signedOut: true,
  },
  PASSWORD_SET: {
    subject: "A password was added to your ABTalks account",
    what: "A password was added to your ABTalks account",
    signedOut: false,
  },
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderPasswordNotice(input: {
  kind: PasswordNoticeKind;
  email: string;
  name: string | null;
  at: Date;
  baseUrl: string;
  /** Recruiters reset from the hire sign-in page, everyone else from /login. */
  recruiter?: boolean;
}): { subject: string; html: string; text: string } {
  const copy = COPY[input.kind];
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const when = input.at.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const loginUrl = `${input.baseUrl}${input.recruiter ? "/recruiter-onboarding/signin" : "/login"}`;
  const signedOutLine = copy.signedOut
    ? "For your safety, every device that was signed in has been signed out."
    : "You can now sign in with this password as well as with an emailed code.";

  const html = `<div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.6; color: #222222; max-width: 560px;">
  <p>Hi ${esc(firstName)},</p>
  <p>${esc(copy.what)} on ${esc(when)} IST.</p>
  <p>Account: <strong>${esc(input.email)}</strong></p>
  <p>${esc(signedOutLine)}</p>
  <p>If this was you, there is nothing else to do.</p>
  <p><strong>If this wasn't you</strong>, reset your password now from the sign-in page using “Forgot password?”: <a href="${esc(loginUrl)}" style="color: #03535F;">${esc(loginUrl)}</a>. Then reply to this email so we can check your account.</p>
  <p>Thanks,<br />Team ABTalks</p>
  <p style="color: #888888; font-size: 12px; margin-top: 24px;">This is a security message about your ABTalks account. It is sent every time the password changes and can't be turned off.</p>
</div>`;

  const text = `Hi ${firstName},

${copy.what} on ${when} IST.

Account: ${input.email}

${signedOutLine}

If this was you, there is nothing else to do.

If this wasn't you, reset your password now from the sign-in page using "Forgot password?": ${loginUrl}
Then reply to this email so we can check your account.

Thanks,
Team ABTalks

--
This is a security message about your ABTalks account. It is sent every time the password changes and can't be turned off.`;

  return { subject: copy.subject, html, text };
}

export async function sendPasswordChangedEmail(input: {
  userId: string;
  kind: PasswordNoticeKind;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, recruiterProfile: { select: { id: true } } },
    });
    if (!user?.email) return;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://abtalks.in").replace(/\/+$/, "");
    const { subject, html, text } = renderPasswordNotice({
      kind: input.kind,
      email: user.email,
      name: user.name,
      at: new Date(),
      baseUrl,
      recruiter: Boolean(user.recruiterProfile),
    });
    const result = await sendEmail({
      to: user.email,
      toName: user.name ?? undefined,
      subject,
      html,
      text,
      bulk: false,
      kind: "account.password_changed",
      subjectType: "User",
      subjectId: input.userId,
    });
    if (!result.ok && !result.skipped) {
      logger.warn("password-changed.email_failed", { deliveryId: result.deliveryId });
    }
  } catch (err) {
    logger.warn("password-changed.email_threw", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
