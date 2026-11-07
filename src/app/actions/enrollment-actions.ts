"use server";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after } from "next/server";
import { auth } from "@/auth";
import { claudeWelcomeEmail } from "@/features/email/claude-welcome-email";
import { createClaudeEnrollment } from "@/features/enrollment/create-claude-enrollment";
import { sendEmail } from "@/lib/email";
import { isClaudeEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";
import { getCandidateProfile } from "@/repositories/candidate";
import { revalidatePath } from "next/cache";

const GUIDELINES_FILE = "Klymb-AI-60-Day-Challenge-Guidelines.pdf";

/**
 * The Challenge Guidelines PDF from `public/documents`. `public/` is not
 * always bundled into a serverless function, so fall back to the copy the
 * site itself serves. Null if neither works — the welcome mail then goes
 * out without the attachment rather than not at all.
 */
async function loadGuidelinesPdf(appUrl: string): Promise<Buffer | null> {
  try {
    return readFileSync(join(process.cwd(), "public/documents", GUIDELINES_FILE));
  } catch {
    // Not on disk in this deployment; try the public URL.
  }
  try {
    const res = await fetch(`${appUrl}/documents/${GUIDELINES_FILE}`, {
      cache: "no-store",
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
  } catch {
    // Fall through.
  }
  logger.warn("[enrollment] challenge guidelines PDF unavailable; sending without it");
  return null;
}

export async function enrollInClaudeChallenge() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, message: "Not authenticated" };
  }

  if (!isClaudeEnabled()) {
    return {
      ok: false as const,
      message: "The Claude challenge is not available yet.",
    };
  }

  const userId = session.user.id;
  const result = await createClaudeEnrollment(userId);
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }

  // Welcome mail with the Challenge Guidelines, for a new enrollment only
  // (already-enrolled and removed users never reach this line). Runs after
  // the response and swallows every error: the enrollment has already
  // succeeded and must never fail or slow down because of mail.
  const to = session.user.email;
  if (to) {
    const sessionName = session.user.name;
    after(async () => {
      try {
        const profile = await getCandidateProfile(userId);
        const fullName =
          profile?.fullName?.trim() || sessionName?.trim() || "there";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.klymb.ai";
        const { subject, html, text } = claudeWelcomeEmail({ fullName, appUrl });
        const pdf = await loadGuidelinesPdf(appUrl);
        const sent = await sendEmail({
          to,
          toName: fullName === "there" ? undefined : fullName,
          subject,
          html,
          text,
          kind: "challenge.claude_welcome",
          ...(pdf
            ? { attachments: [{ filename: GUIDELINES_FILE, content: pdf }] }
            : {}),
        });
        if (!sent.ok && !sent.skipped) {
          logger.warn("[enrollment] claude welcome email not sent", {
            deliveryId: sent.deliveryId,
            reason: sent.reason,
          });
        }
      } catch (error) {
        logger.warn("[enrollment] claude welcome email failed", {
          error: String(error),
        });
      }
    });
  }

  revalidatePath("/dashboard");
  return { ok: true as const };
}
