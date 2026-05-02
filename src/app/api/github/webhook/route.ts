import { verifyGithubWebhookSignature } from "@/lib/github-webhook-signature";
import { logger } from "@/lib/logger";
import {
  processGithubWebhookPush,
  type GithubPushPayload,
} from "@/features/submission/process-github-webhook-push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("github_webhook_missing_secret");
    return new Response("Webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGithubWebhookSignature(rawBody, signature, secret)) {
    logger.warn("github_webhook_invalid_signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event === "ping") {
    logger.info("github_webhook_ping");
    return Response.json({ ok: true });
  }

  if (event !== "push") {
    logger.info("github_webhook_event_ignored", { event });
    return Response.json({ ok: true, ignored: true, event });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    logger.warn("github_webhook_invalid_json");
    return new Response("Invalid JSON", { status: 400 });
  }

  const result = await processGithubWebhookPush(payload as GithubPushPayload);

  if (result.action === "error") {
    return Response.json(
      { ok: false, reason: result.reason, message: result.message },
      { status: 422 },
    );
  }

  return Response.json({ ok: true, result });
}
