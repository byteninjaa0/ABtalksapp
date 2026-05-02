import crypto from "node:crypto";

/**
 * Verifies `X-Hub-Signature-256` from GitHub webhooks (HMAC SHA-256 of the raw body).
 */
export function verifyGithubWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const mac = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(mac, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
