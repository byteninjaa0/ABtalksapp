"use server";

import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import {
  issueRecruiterOtp,
  otpDevFallbackEnabled,
  purgeExpiredOtps,
} from "@/features/recruiter-auth/otp";
import { requestRecruiterOtpSchema } from "@/lib/validations/recruiter-auth";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const SUPPORT_EMAIL = "team@abtalks.in";

/**
 * Send a sign-in code to a recruiter's work email.
 *
 * The reply says whether the *company* is verified, because a recruiter whose
 * employer we have never heard of needs to know that and what to do about it.
 * It says nothing about whether an account exists — both of those paths look
 * identical from here, so the box cannot be used to find out who has signed up.
 */
export async function requestRecruiterOtpAction(
  input: unknown,
): Promise<
  ActionResult<{ sent: true; devCode?: string; company: string }>
> {
  const parsed = requestRecruiterOtpSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid work email address." };
  }

  try {
    void purgeExpiredOtps();

    const issued = await issueRecruiterOtp(parsed.data.email);
    if (!issued.ok) {
      if (issued.reason === "rate-limited") {
        return {
          ok: false,
          message: "Too many codes requested. Try again in a few minutes.",
        };
      }
      return {
        ok: false,
        message: `We haven't verified this company for hiring yet. Write to ${SUPPORT_EMAIL} from your work address and we'll set it up.`,
      };
    }

    // The code leaves the server exactly one way: by email in production, or
    // on screen in development when there is no mail provider configured.
    const devMode = otpDevFallbackEnabled();
    if (devMode) {
      logger.warn("[recruiter-auth] dev OTP", {
        email: parsed.data.email,
        code: issued.code,
      });
    } else {
      await sendEmail({
        to: parsed.data.email,
        subject: "Your ABTalks sign-in code",
        html: `<p>Your ABTalks recruiter sign-in code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;">${issued.code}</p>
<p>It expires in 10 minutes. If you didn't ask for this, you can ignore it.</p>`,
        text: `Your ABTalks recruiter sign-in code is ${issued.code}. It expires in 10 minutes.`,
      });
    }

    return {
      ok: true,
      data: {
        sent: true,
        company: issued.company,
        ...(devMode ? { devCode: issued.code } : {}),
      },
    };
  } catch (error) {
    logger.error("[recruiter-auth] requestRecruiterOtpAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not send a code. Try again." };
  }
}

/** Whether the form should offer to display the code rather than email it. */
export async function recruiterOtpDevModeAction(): Promise<boolean> {
  return otpDevFallbackEnabled();
}
