import "server-only";
import { BrevoClient } from "@getbrevo/brevo";
import { reqLogger } from "@/lib/logger";
import {
  hashRecipient,
  newDeliveryId,
  recordDelivery,
} from "@/lib/observability/notification-delivery";
import { getRequestId } from "@/lib/observability/request-id";
import { routesViaAbtMailer, sendViaAbtMailer } from "@/lib/abt-mailer";

/**
 * Transactional mail, through Brevo.
 *
 * This used to call Resend, and nothing that reaches it ever sent: `RESEND_API_KEY`
 * is not configured anywhere, so every caller was quietly taking the
 * `skipped: true` branch. That is five paths, three of them recruiter-facing —
 * the sign-in code, the admin's approval mail and the hire alert — plus the
 * contact form and DSAR notifications. In development the recruiter one hides
 * behind `otpDevFallbackEnabled`, which prints the code to the log instead, so
 * the failure only showed up in production, where nobody could sign in and
 * nothing said why.
 *
 * Brevo is the provider this project actually has credentials for and already
 * uses for the workshop, hackathon and challenge-reset mail. One provider
 * beats two, and beats one that is only configured on paper.
 *
 * ## T-259
 *
 * This is the single choke point for outbound mail, so it is where the
 * notification bridge lives: every call allocates a `deliveryId`, writes a
 * `OutboundDelivery` row, emits `notification.attempt` / `.sent` /
 * `.skipped` / `.failed`, and reports failures to Sentry tagged with that same
 * id. The recipient address never reaches a log line or a Sentry payload —
 * only its SHA-256.
 *
 * The result shape only gained fields, so no caller had to move.
 */

const FROM_EMAIL = process.env.FROM_EMAIL || "team@klymb.ai";
const FROM_NAME = process.env.FROM_NAME || "Klymb AI";
const REPLY_TO = process.env.REPLY_TO_EMAIL || FROM_EMAIL;

export type SendEmailResult =
  | { ok: true; deliveryId: string }
  | {
      ok: false;
      skipped?: boolean;
      deliveryId: string;
      /** Redacted, safe to persist or show to an admin. */
      reason?: string;
      sentryEventId?: string;
    };

export async function sendEmail(opts: {
  to: string;
  /** Optional recipient display name — improves deliverability (recipient `name`). */
  toName?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
  /**
   * T-232: overrides the global Reply-To. Outreach mail must not point at the
   * shared team inbox, so it passes a no-reply address and asks the candidate
   * to reply on Klymb AI. Every other caller is unchanged.
   */
  replyTo?: string;
  /** T-259: what this message is, e.g. "recruiter.otp". Defaults to "generic". */
  kind?: string;
  /** T-259: the domain entity it belongs to, when there is one. */
  subjectType?: string;
  subjectId?: string;
  /**
   * Plan 152: extra custom headers merged over the defaults. Every mail gets
   * a `X-Entity-Ref-ID` = the `deliveryId` (dedupes duplicates in the
   * recipient MUA). Callers can add e.g. `In-Reply-To`.
   */
  headers?: Record<string, string>;
  /**
   * Defaults to false. Everything this platform sends is one-to-one mail
   * triggered by the recipient's own action or account — sign-in codes,
   * registrations, application updates — and must land in Primary / Updates.
   * `Precedence: bulk` tells Gmail the message is a mass mailing and pushes it
   * toward Promotions, so it is only sent when a caller really is mailing a
   * list. A bulk mail also gets the `List-Unsubscribe` headers.
   */
  bulk?: boolean;
  /**
   * Adds `List-Unsubscribe` + `List-Unsubscribe-Post` without marking the
   * mail bulk. For opt-in notifications the recipient can turn off (job
   * alerts, profile views). Never set on sign-in codes or account notices:
   * an unsubscribe header on those reads as list mail and is meaningless —
   * nobody can unsubscribe from their own OTP.
   */
  listUnsubscribe?: boolean;
  /**
   * Secret values in this message's body (e.g. a one-time password). On a
   * send failure they are stripped from the error before it is logged or
   * sent to Sentry — Brevo can echo the request back inside its errors, and
   * the generic scrubber does not recognise a bare password.
   */
  redact?: string[];
  /**
   * Plan 152: Brevo tags for dashboard filtering. Defaulted to `[kind]` so
   * every send is filterable in Brevo's Statistics tab by message type.
   */
  tags?: string[];
  /**
   * Plan 185: an id that stays the same when the caller retries this mail
   * (e.g. the NotificationDelivery id). ABT-Mailer uses it to never send the
   * same mail twice. Ignored on the Brevo path. Defaults to this call's
   * `deliveryId`, which only dedupes within one call.
   */
  idempotencyKey?: string;
}): Promise<SendEmailResult> {
  const deliveryId = newDeliveryId();
  const kind = opts.kind ?? "generic";
  const requestId = await getRequestId();
  const log = reqLogger(requestId, { kind, deliveryId, channel: "email" });
  const ctx = {
    kind,
    recipient: opts.to,
    subjectType: opts.subjectType,
    subjectId: opts.subjectId,
    requestId,
    log,
  };

  // The subject line is app-authored copy, never user input, so it is the one
  // thing here that is safe to log. The address is not: only its hash goes out.
  log.info(
    {
      event: "notification.attempt",
      recipientHash: hashRecipient(opts.to),
      hasAttachments: Boolean(opts.attachments?.length),
    },
    "notification attempt",
  );

  // Plan 185: kinds listed in EMAIL_VIA_ABT_KINDS go through ABT-Mailer (SES).
  const viaAbt = routesViaAbtMailer(kind, Boolean(opts.attachments?.length));

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey && !viaAbt) {
    const { reason } = await recordDelivery(deliveryId, ctx, {
      status: "SKIPPED",
      reason: "BREVO_API_KEY missing",
    });
    return { ok: false, skipped: true, deliveryId, reason };
  }
  // Never email seed/test accounts (avoid bounces hurting domain reputation).
  if (opts.to.toLowerCase().endsWith("@abtalks.dev")) {
    const { reason } = await recordDelivery(deliveryId, ctx, {
      status: "SKIPPED",
      reason: "test address",
    });
    return { ok: false, skipped: true, deliveryId, reason };
  }

  // Deliverability headers. Transactional by default: no `Precedence: bulk`
  // and no `List-Unsubscribe` — both are what Gmail uses to file a message
  // under Promotions, which is where OTPs were going.
  const bulk = opts.bulk === true;
  const unsubMailto = `mailto:${REPLY_TO}?subject=Unsubscribe`;
  const defaultHeaders: Record<string, string> = {
    "X-Entity-Ref-ID": deliveryId,
    ...(bulk || opts.listUnsubscribe
      ? {
          "List-Unsubscribe": `<${unsubMailto}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : {}),
    ...(bulk ? { Precedence: "bulk" } : {}),
  };
  const mergedHeaders = { ...defaultHeaders, ...(opts.headers ?? {}) };

  if (viaAbt) {
    const outcome = await sendViaAbtMailer({
      kind,
      idempotencyKey: opts.idempotencyKey ?? deliveryId,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      headers: mergedHeaders,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      replyTo: opts.replyTo ?? REPLY_TO,
      hasSecrets: (opts.redact ?? []).some((s) => s.length > 0),
    });
    const { reason, sentryEventId } = await recordDelivery(deliveryId, ctx, outcome);
    if (outcome.status === "SENT") return { ok: true, deliveryId };
    return {
      ok: false,
      ...(outcome.status === "SKIPPED" ? { skipped: true } : {}),
      deliveryId,
      reason,
      sentryEventId,
    };
  }
  if (!apiKey) return { ok: false, skipped: true, deliveryId }; // unreachable: checked above

  try {
    const brevo = new BrevoClient({ apiKey });
    const tags = opts.tags ?? [kind];

    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      replyTo: { email: opts.replyTo ?? REPLY_TO },
      to: [
        opts.toName
          ? { email: opts.to, name: opts.toName }
          : { email: opts.to },
      ],
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
      headers: mergedHeaders,
      tags,
      // Brevo wants base64, not a Buffer. No caller passes attachments today,
      // but the signature offered them, and a silently dropped attachment is
      // worse than one that was never offered.
      ...(opts.attachments?.length
        ? {
            attachment: opts.attachments.map((a) => ({
              name: a.filename,
              content: a.content.toString("base64"),
            })),
          }
        : {}),
    });
    await recordDelivery(deliveryId, ctx, { status: "SENT" });
    return { ok: true, deliveryId };
  } catch (error) {
    // Brevo echoes the request — recipient address included — back inside the
    // error. `recordDelivery` runs it through `safeErrorMessage`, which is the
    // whole reason `String(error)` is not used here any more.
    const secrets = (opts.redact ?? []).filter((s) => s.length > 0);
    const safeError =
      secrets.length === 0
        ? error
        : new Error(
            secrets.reduce(
              (msg, s) => msg.split(s).join("[redacted]"),
              error instanceof Error ? error.message : String(error),
            ),
          );
    const { reason, sentryEventId } = await recordDelivery(deliveryId, ctx, {
      status: "FAILED",
      error: safeError,
    });
    return { ok: false, deliveryId, reason, sentryEventId };
  }
}

/** Re-exported so callers can look a delivery up without importing two modules. */
export { hashRecipient };
