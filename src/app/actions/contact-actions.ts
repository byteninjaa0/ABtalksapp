"use server";

import { z } from "zod";
import { sendEmail } from "@/lib/email";
import { reqLogger } from "@/lib/logger";
import { captureFailure } from "@/lib/observability/capture";
import { logContact } from "@/lib/observability/domain-log";
import { getRequestId } from "@/lib/observability/request-id";

const contactSchema = z.object({
  name: z.string().min(2),
  phone: z.string().regex(/^[+]?[\d\s()-]{7,18}$/),
  email: z.string().email(),
  message: z.string().min(10),
});

export type ContactResult =
  | { ok: true; data: { sent: true } }
  | { ok: false; message: string };

export async function submitContactMessage(
  input: unknown,
): Promise<ContactResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const { name, phone, email, message } = parsed.data;

  // T-259: this action holds a name, a phone number and an email address. None
  // of the four reach a log line - the message body is forwarded to the team by
  // mail and nowhere else, and `sendEmail` logs only the recipient's hash.
  const requestId = await getRequestId();
  const log = reqLogger(requestId, { route: "action:submitContactMessage" });
  logContact("contact.form", {
    outcome: "attempt",
    messageLength: message.length,
    log,
  });

  const subject = `Contact form: ${name}`;
  const text = `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\n\n${message}`;
  const html = `<p><strong>Name:</strong> ${escapeHtml(name)}</p>
<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
<p><strong>Email:</strong> ${escapeHtml(email)}</p>
<p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>`;

  try {
    const result = await sendEmail({
      to: "team@klymb.ai",
      subject,
      html,
      text,
      kind: "contact.form",
    });
    if (result.ok) {
      logContact("contact.form", {
        outcome: "success",
        deliveryId: result.deliveryId,
        log,
      });
      return { ok: true, data: { sent: true } };
    }
    if (result.skipped) {
      // Nothing was attempted (no provider configured). Already logged as
      // `notification.skipped` against the same deliveryId.
      return { ok: true, data: { sent: true } };
    }
    // `sendEmail` has already emitted `notification.failed` and captured the
    // exception; this line is the action-level outcome, not a second report.
    logContact("contact.form", {
      outcome: "failed",
      deliveryId: result.deliveryId,
      reason: result.reason,
      log,
    });
    return {
      ok: false,
      message: "Could not send your message. Try again.",
    };
  } catch (error) {
    await captureFailure(error, {
      event: "contact.form.failed",
      message: "contact form threw",
      log,
      tags: { requestId, route: "action:submitContactMessage" },
      extra: { area: "contact", op: "contact.form", outcome: "failed" },
    });
    return {
      ok: false,
      message: "Could not send your message. Try again.",
    };
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
