import "server-only";

import { logger } from "@/lib/logger";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentJsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function extractFirstJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Multi-turn Claude JSON helper for Scout.
 * Separate from askClaudeJson (single-shot grading) — do not mix callers.
 * Falls back gracefully when ANTHROPIC_API_KEY is missing.
 */
export async function askClaudeAgentJson<T>(opts: {
  system: string;
  messages: AgentMessage[];
  maxTokens?: number;
}): Promise<AgentJsonResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, message: "AI is not configured." };
  }

  const model =
    process.env.HIRE_ANTHROPIC_MODEL ??
    process.env.PROGRAM_ANTHROPIC_MODEL ??
    "claude-sonnet-5";

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 1024,
        system: opts.system,
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      logger.error("[claude-agent] request failed", { status: res.status });
      return { ok: false, message: "AI request failed." };
    }

    const json = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    const slice = extractFirstJson(text);
    if (!slice) {
      logger.error("[claude-agent] no JSON in response");
      return { ok: false, message: "AI returned an unexpected response." };
    }
    return { ok: true, data: JSON.parse(slice) as T };
  } catch (error) {
    logger.error("[claude-agent] errored", { error: String(error) });
    return { ok: false, message: "AI request errored." };
  }
}
