import { createHmac } from "node:crypto";

/**
 * Plan 185: hand selected transactional mail to ABT-Mailer (our SES sender)
 * instead of Brevo. Only `kind`s listed in `EMAIL_VIA_ABT_KINDS` move; every
 * other mail stays on Brevo. Clearing the env var moves everything back to
 * Brevo with no code change.
 *
 * Plan 186: a list entry may be `*` (every kind) or `prefix.*` (e.g.
 * `account.admin_update.*`). `EMAIL_KEEP_ON_BREVO_KINDS` uses the same
 * syntax and wins, so `*` plus a short exception list is the usual setup.
 *
 * ABT-Mailer contract: POST {ABT_MAILER_URL}/api/emails/transactional in
 * "raw" mode, HMAC-SHA256 over `${timestamp}.${body}`. See ABT-Mailer's
 * docs/api/transactional-email.md.
 */

export type AbtMailerOutcome =
  | { status: "SENT" }
  | { status: "SKIPPED"; reason: string }
  | { status: "FAILED"; error: Error };

const TIMEOUT_MS = 10_000;

/** The kinds routed to ABT-Mailer, from a comma-separated env value. */
export function abtMailerKinds(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
  );
}

/** True when `kind` matches an entry: exact, `*`, or `prefix.*`. */
export function kindMatches(patterns: Set<string>, kind: string): boolean {
  if (patterns.has("*") || patterns.has(kind)) return true;
  for (const p of patterns) {
    if (p.endsWith(".*") && kind.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

export function routesViaAbtMailer(
  kind: string,
  hasAttachments: boolean,
  env: Record<string, string | undefined> = process.env,
): boolean {
  // ABT-Mailer has no attachment support; those stay on Brevo.
  if (hasAttachments) return false;
  if (!env.ABT_MAILER_URL || !env.ABT_MAILER_HMAC_SECRET) return false;
  if (kindMatches(abtMailerKinds(env.EMAIL_KEEP_ON_BREVO_KINDS), kind)) return false;
  return kindMatches(abtMailerKinds(env.EMAIL_VIA_ABT_KINDS), kind);
}

/**
 * Mail the recipient must get even after unsubscribing from or complaining
 * about marketing: sign-in / password codes, password reset, account notices.
 * ABT-Mailer only lets a hard bounce stop these.
 */
const ESSENTIAL_KINDS = abtMailerKinds(
  "recruiter.otp,auth.signin_code,auth.password_code,auth.password_reset," +
    "account.admin_update,account.admin_update.*,account.self_deleted,account.password_changed," +
    "recruiter.welcome",
);

/**
 * Mail whose body or subject holds a lasting secret: ABT-Mailer wipes it once
 * sent. The 6-digit codes are not on this list — they expire in 10
 * minutes and work once, and support needs to see them in ABT-Mailer's logs
 * (as it could in Brevo's). A reset link and the welcome password stay usable
 * for longer, so those are still wiped.
 */
const SENSITIVE_KINDS = abtMailerKinds("auth.password_reset,recruiter.welcome");

export function abtMailerCategory(
  kind: string,
): "TRANSACTIONAL_ESSENTIAL" | "TRANSACTIONAL_NONESSENTIAL" {
  return kindMatches(ESSENTIAL_KINDS, kind) ? "TRANSACTIONAL_ESSENTIAL" : "TRANSACTIONAL_NONESSENTIAL";
}

export function isSensitiveKind(kind: string): boolean {
  return kindMatches(SENSITIVE_KINDS, kind);
}

export function signAbtMailerRequest(
  body: string,
  secret: string,
  nowMs: number = Date.now(),
): Record<string, string> {
  const ts = Math.floor(nowMs / 1000).toString();
  const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  return {
    "Content-Type": "application/json",
    "X-ABTalks-Timestamp": ts,
    "X-ABTalks-Signature": `v1=${sig}`,
  };
}

/**
 * ABT-Mailer answers 200 with a `status`; only "enqueued" / "duplicate" mean
 * the mail is on its way (same meaning as Brevo accepting the request).
 */
export function interpretAbtMailerResponse(
  httpStatus: number,
  json: unknown,
): AbtMailerOutcome {
  const body = (json && typeof json === "object" ? json : {}) as {
    status?: string;
    reason?: string;
    error?: string;
  };
  if (httpStatus === 200 && (body.status === "enqueued" || body.status === "duplicate")) {
    return { status: "SENT" };
  }
  if (httpStatus === 200 && body.status === "suppressed") {
    return { status: "SKIPPED", reason: `ABT-Mailer suppressed: ${body.reason ?? "unknown"}` };
  }
  const what = body.status ?? body.error ?? "unknown";
  return {
    status: "FAILED",
    error: new Error(`ABT-Mailer ${httpStatus} ${what}${body.reason ? `: ${body.reason}` : ""}`),
  };
}

export async function sendViaAbtMailer(input: {
  kind: string;
  /** Stable across retries of the same mail, so ABT-Mailer never sends it twice. */
  idempotencyKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  from: { email: string; name: string };
  replyTo: string;
  /** The caller passed secrets to redact; treat like a sensitive kind. */
  hasSecrets?: boolean;
}): Promise<AbtMailerOutcome> {
  const url = process.env.ABT_MAILER_URL;
  const secret = process.env.ABT_MAILER_HMAC_SECRET;
  if (!url || !secret) {
    return { status: "SKIPPED", reason: "ABT_MAILER_URL / ABT_MAILER_HMAC_SECRET missing" };
  }

  const body = JSON.stringify({
    eventType: input.kind,
    eventId: input.idempotencyKey,
    recipient: { email: input.to },
    content: {
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
    },
    category: abtMailerCategory(input.kind),
    sensitive: Boolean(input.hasSecrets) || isSensitiveKind(input.kind),
    overrides: { fromEmail: input.from.email, fromName: input.from.name, replyTo: input.replyTo },
  });

  try {
    const res = await fetch(new URL("/api/emails/transactional", url), {
      method: "POST",
      headers: signAbtMailerRequest(body, secret),
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json: unknown = await res.json().catch(() => null);
    return interpretAbtMailerResponse(res.status, json);
  } catch (error) {
    return { status: "FAILED", error: error instanceof Error ? error : new Error(String(error)) };
  }
}
