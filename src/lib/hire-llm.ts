import "server-only";

import { logger } from "@/lib/logger";
import { groqApiKeys } from "@/lib/groq";

/**
 * Vendor resolution + one constrained JSON call.
 *
 * Lifted out of `scout-graph.ts` so Scout no longer needs a tool loop to talk
 * to a model. Both vendors speak `chat/completions` with
 * `response_format: { type: "json_schema", strict: true }` — one code path;
 * the vendor changes the URL, key and model.
 *
 * `gpt-4.1-mini` on OpenAI, deliberately NOT `gpt-4o`. OpenAI meters per model,
 * and Scout must not draw from the bucket a graded interview needs. Same
 * reasoning as `lib/chatbot/providers.ts`.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-4.1-mini";
export const DEFAULT_GROQ_AGENT_MODEL = "openai/gpt-oss-120b";

export type HireLlmVendor = "openai" | "groq";

export type AskJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "timeout" | "rate_limit" | "auth" | "error" };

export function resolveVendor(): HireLlmVendor | null {
  const configured = (process.env.HIRE_AGENT_PROVIDER ?? "").trim().toLowerCase();
  if (configured === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (configured === "groq") return groqApiKeys().length > 0 ? "groq" : null;
  if (configured) {
    logger.warn("[hire-llm] unknown HIRE_AGENT_PROVIDER, autodetecting", {
      configured,
    });
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  return groqApiKeys().length > 0 ? "groq" : null;
}

function keysFor(vendor: HireLlmVendor): string[] {
  return vendor === "openai"
    ? [process.env.OPENAI_API_KEY!].filter(Boolean)
    : groqApiKeys();
}

function modelFor(vendor: HireLlmVendor): string {
  if (process.env.HIRE_AGENT_MODEL?.trim()) return process.env.HIRE_AGENT_MODEL.trim();
  if (vendor === "openai") return DEFAULT_OPENAI_AGENT_MODEL;
  return process.env.HIRE_GROQ_MODEL?.trim() || DEFAULT_GROQ_AGENT_MODEL;
}

/**
 * Is this the kind of failure another API key would survive?
 *
 * 429 is a per-key ceiling and 401 is a dead key — both are answered by trying
 * the next key. A timeout or abort is a property of the request; retrying it
 * on a second key just spends the second key too.
 */
function rotatable(status: number | null, error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || /abort/i.test(name)) return false;
  if (status === 429 || status === 401) return true;
  const s = String(error);
  return (
    /\b429\b|rate limit/i.test(s) ||
    /\b401\b|invalid api key|expired_api_key/i.test(s)
  );
}

export async function askJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  schemaName: string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AskJsonResult<T>> {
  const vendor = resolveVendor();
  if (!vendor) return { ok: false, reason: "auth" };

  const keys = keysFor(vendor);
  if (keys.length === 0) return { ok: false, reason: "auth" };

  const timeoutMs =
    opts.timeoutMs ?? (vendor === "openai" ? 11_000 : 8_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload: Record<string, unknown> = {
    model: modelFor(vendor),
    temperature: 0.2,
    max_tokens: opts.maxTokens ?? 1200,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: opts.schemaName,
        strict: true,
        schema: opts.schema,
      },
    },
  };
  if (vendor === "groq") {
    payload.reasoning_effort = "low";
  }

  const url = vendor === "openai" ? OPENAI_URL : GROQ_URL;

  try {
    let lastStatus: number | null = null;
    let lastError: unknown = null;
    for (let i = 0; i < keys.length; i += 1) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${keys[i]}`,
            "content-type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(payload),
        });
        lastStatus = res.status;
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          logger.error("[hire-llm] request failed", {
            vendor,
            status: res.status,
            key: i + 1,
            detail: detail.slice(0, 300),
          });
          if (!rotatable(res.status, null) || i === keys.length - 1) {
            if (res.status === 429) return { ok: false, reason: "rate_limit" };
            if (res.status === 401) return { ok: false, reason: "auth" };
            return { ok: false, reason: "error" };
          }
          logger.warn("[hire-llm] key exhausted, rotating", {
            vendor,
            key: i + 1,
            of: keys.length,
          });
          continue;
        }
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.message?.content;
        if (!text) {
          logger.error("[hire-llm] empty completion", { vendor });
          return { ok: false, reason: "error" };
        }
        return { ok: true, data: JSON.parse(text) as T };
      } catch (error) {
        lastError = error;
        if (controller.signal.aborted) return { ok: false, reason: "timeout" };
        if (!rotatable(lastStatus, error) || i === keys.length - 1) {
          const s = String(error);
          if (/\b429\b|rate limit/i.test(s)) return { ok: false, reason: "rate_limit" };
          if (/\b401\b|invalid api key/i.test(s)) return { ok: false, reason: "auth" };
          return { ok: false, reason: "error" };
        }
        logger.warn("[hire-llm] key exhausted, rotating", {
          vendor,
          key: i + 1,
          of: keys.length,
        });
      }
    }
    if (lastStatus === 429) return { ok: false, reason: "rate_limit" };
    if (lastStatus === 401) return { ok: false, reason: "auth" };
    void lastError;
    return { ok: false, reason: "error" };
  } finally {
    clearTimeout(timer);
  }
}

/** Exported for the evals — the retry rule, without a network. */
export const __test = { rotatable };
