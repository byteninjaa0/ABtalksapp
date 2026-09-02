import "server-only";

import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import {
  Annotation,
  END,
  START,
  StateGraph,
  messagesStateReducer,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { logger } from "@/lib/logger";
import { groqApiKeys } from "@/lib/groq";

/**
 * The agent loop: model → tools → model, until the model stops calling tools.
 *
 * Two hard bounds, and they are separate on purpose. `recursionLimit` bounds
 * STEPS; it says nothing about seconds, and a slow upstream would sail past a
 * step budget while a recruiter waits on a blocked Server Action. The
 * `AbortSignal` bounds TIME. Both are required.
 *
 * Compiled with NO checkpointer. Conversation state already lives in Postgres
 * (`TalentRequest` + `TalentRequestMessage`); a checkpointer would be a second
 * store competing with the one that is already correct.
 *
 * The brief is not a state channel here — it lives in the per-turn tool context
 * (`scout-tools.ts`) that the executors mutate. Same guarantee, less machinery:
 * the model still cannot write the spec, because only a tool can.
 */

const ScoutState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
});

export type ScoutGraphState = typeof ScoutState.State;

/**
 * Steps, not round trips — LangGraph counts each node.
 *
 * Eight was too tight for the sequence a real search needs: list_tracks →
 * set_pool_filters → search_pool is already 7 steps with the closing message,
 * and one repeated call tipped it over. The loop was then cut off having queued
 * the search but never having told the recruiter — they saw a generic fallback
 * while their cards loaded. Twelve leaves room for a four-tool turn to still
 * finish speaking. The wall clock, not this, is what bounds a slow upstream.
 */
export const RECURSION_LIMIT = 12;

/**
 * `medium`, and this is not a tuning preference.
 *
 * At `low` the model's tool choice was measurably unstable: the same message
 * ("senior backend engineer, python and postgres, 25 LPA, remote") chose
 * `update_brief` on one run and `get_pool_stats` on another, from nothing but a
 * reordering of the system prompt. At `medium` the eval suite passed twice over.
 * The cost is ~950 tokens a hop instead of ~750, which matters against an
 * 8000-TPM ceiling — but an unstable router is not a cheaper agent, it is a
 * broken one.
 */
const REASONING_EFFORT = "medium";

/**
 * Which vendor backs Scout, and why it is no longer Groq by default.
 *
 * Groq's free tier is 8,000 tokens per MINUTE for the whole organisation. A
 * two-hop search turn is ~12,000, so a recruiter typing at a normal pace 429s
 * against a ceiling that no amount of prompt trimming clears — the limit is not
 * the prompt, it is the plan. OpenAI's key is metered rather than capped, and
 * it is already in this deployment for the interview room.
 *
 * `gpt-4.1-mini`, deliberately NOT the `gpt-4o` the interview judge uses. Two
 * reasons and both matter:
 *
 *   1. OpenAI meters rate limits PER MODEL, so a recruiter searching all
 *      afternoon cannot eat the budget a graded interview needs. A candidate's
 *      score must never depend on how busy the hiring desk is.
 *   2. Scout routes a short message to one of eight tools under a fixed prompt.
 *      That is the same shape of work the helper chatbot does, and it picked
 *      the mini tier for the same reason (see lib/chatbot/providers.ts) — a
 *      fraction of the cost for a job the mini tier does just as well.
 *
 * `HIRE_AGENT_PROVIDER` = `openai` | `groq` forces one. Unset resolves by key,
 * preferring OpenAI, so a deployment holding both is not silently rate-limited.
 * Mirrors `resolveInterviewLLM` in features/interview/agent/llm/registry.ts —
 * one place decides, and it decides from configuration, never from input.
 */
export const DEFAULT_OPENAI_AGENT_MODEL = "gpt-4.1-mini";

type Vendor = "openai" | "groq";

export function resolveVendor(): Vendor | null {
  const configured = (process.env.HIRE_AGENT_PROVIDER ?? "").trim().toLowerCase();
  if (configured === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;
  if (configured === "groq") return groqApiKeys().length > 0 ? "groq" : null;
  if (configured) {
    logger.warn("[scout-graph] unknown HIRE_AGENT_PROVIDER, autodetecting", {
      configured,
    });
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  return groqApiKeys().length > 0 ? "groq" : null;
}

/**
 * The keys to try, in order. Groq rotates across three; OpenAI is one metered
 * key, so the list is one long and the rotation loop is a no-op for it.
 */
function keysFor(vendor: Vendor): string[] {
  return vendor === "openai"
    ? [process.env.OPENAI_API_KEY!].filter(Boolean)
    : groqApiKeys();
}

/**
 * Is this the kind of failure another API key would survive?
 *
 * 429 is a per-key, per-minute ceiling and 401 is a dead key — both are answered
 * by trying the next key. A timeout, an aborted request or a malformed call are
 * properties of the request, and retrying them on a second key just spends the
 * second key too.
 */
function rotatable(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || /abort/i.test(name)) return false;
  const s = String(error);
  return (
    /RateLimit|429/i.test(name) ||
    /\b429\b|rate limit/i.test(s) ||
    /\b401\b|invalid api key|expired_api_key/i.test(s)
  );
}

function scoutModel(
  tools: StructuredToolInterface[],
  vendor: Vendor,
  apiKey: string,
) {
  if (vendor === "openai") {
    return new ChatOpenAI({
      apiKey,
      model: process.env.HIRE_AGENT_MODEL ?? DEFAULT_OPENAI_AGENT_MODEL,
      temperature: 0.2,
      // No reasoning stage to pay for here, so this is the answer budget alone
      // and two sentences plus a tool call fit inside it comfortably.
      maxTokens: 800,
    }).bindTools(tools);
  }
  return new ChatGroq({
    apiKey,
    model:
      process.env.HIRE_AGENT_MODEL ??
      process.env.HIRE_GROQ_MODEL ??
      "openai/gpt-oss-120b",
    temperature: 0.2,
    // gpt-oss reasons before it answers and that reasoning is billed against
    // max_tokens. Left at the default it spent the whole budget thinking and
    // returned a 400 rather than a parse error.
    maxTokens: 1200,
    reasoningEffort: REASONING_EFFORT,
  }).bindTools(tools);
}

/**
 * Build the graph for one turn.
 *
 * Rebuilt per turn because `tools` close over that turn's context. Cheap — it is
 * object wiring, not I/O.
 */
export function buildScoutGraph(
  system: string,
  tools: StructuredToolInterface[],
  /** True once the turn has done the only thing left worth a hop. */
  done?: () => boolean,
) {
  // Every key configured, not just the first.
  //
  // `askGroqJson` has rotated across GROQ_API_KEY / _2 / _3 since it was
  // written; this graph read `groqApiKeys()[0]` and stopped. So the whole agent
  // — the surface a recruiter actually talks to — ran on one key's 8000
  // tokens-per-minute while two more sat unused, and a three-hop turn 429'd
  // against a ceiling the product had already paid to raise. On OpenAI the list
  // is one key long and this loop simply never rotates.
  const vendor = resolveVendor() ?? "groq";
  const keys = keysFor(vendor);
  const models = new Map<number, ReturnType<typeof scoutModel>>();
  const modelFor = (i: number) => {
    const cached = models.get(i);
    if (cached) return cached;
    const made = scoutModel(tools, vendor, keys[i]!);
    models.set(i, made);
    return made;
  };

  let hops = 0;

  async function agent(state: ScoutGraphState) {
    hops++;
    const messages = [new SystemMessage(system), ...state.messages];
    let last: unknown = null;
    for (let i = 0; i < keys.length; i += 1) {
      try {
        return { messages: [await modelFor(i).invoke(messages)] };
      } catch (error) {
        last = error;
        if (!rotatable(error) || i === keys.length - 1) throw error;
        logger.warn("[scout-graph] key exhausted, rotating", {
          key: i + 1,
          of: keys.length,
          hop: hops,
        });
      }
    }
    throw last;
  }

  function shouldContinue(state: ScoutGraphState): "tools" | typeof END {
    const last = state.messages.at(-1);
    const calls = (last as AIMessage | undefined)?.tool_calls ?? [];
    return calls.length > 0 ? "tools" : END;
  }

  /**
   * Stop the loop the moment the turn's work is finished.
   *
   * The hop this removes is the one that kept 429ing. A search turn ran
   * update_brief → search_pool → "and here is a sentence about it", and that
   * third hop re-sent the system prompt, the history AND both tool results —
   * ~6,200 tokens against an 8,000/minute ceiling — to produce a sentence the
   * engine already writes deterministically when the model goes quiet. Paying a
   * third of a turn's budget for words we do not use is how the budget ran out.
   */
  function afterTools(): "agent" | typeof END {
    return done?.() ? END : "agent";
  }

  const graph = new StateGraph(ScoutState)
    .addNode("agent", agent)
    .addNode("tools", new ToolNode(tools))
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      [END]: END,
    })
    .addConditionalEdges("tools", afterTools, {
      agent: "agent",
      [END]: END,
    })
    .compile();

  return { graph, hopCount: () => hops };
}

export type ScoutGraphRun =
  | { ok: true; text: string; hops: number }
  | {
      ok: false;
      reason: "timeout" | "recursion" | "rate_limit" | "auth" | "error";
      hops: number;
    };

/**
 * Run one turn and return the model's closing words.
 *
 * Never throws. Every failure is a named reason so the caller can fall back to a
 * deterministic sentence — a recruiter must never meet silence, and must never
 * be shown a stack trace.
 */
export async function runScoutGraph(opts: {
  system: string;
  tools: StructuredToolInterface[];
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
  deadlineMs: number;
  /**
   * Called after each tool batch. Return true when nothing the model could say
   * next is worth another hop — the caller then writes the closing sentence
   * itself. See `afterTools`.
   */
  done?: () => boolean;
}): Promise<ScoutGraphRun> {
  const { graph, hopCount } = buildScoutGraph(opts.system, opts.tools, opts.done);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.deadlineMs);

  try {
    const out = await graph.invoke(
      {
        messages: [
          ...opts.history.map((m) =>
            m.role === "assistant"
              ? new AIMessage(m.content)
              : new HumanMessage(m.content),
          ),
          new HumanMessage(opts.userMessage),
        ],
      },
      { recursionLimit: RECURSION_LIMIT, signal: controller.signal },
    );

    // ONLY the model's own words. The last message is not always an AIMessage:
    // when the loop stops itself after a tool batch (see `afterTools`) it is a
    // ToolMessage, and a ToolMessage's `content` is a string too — so reading
    // `.content` off whatever came last sent a recruiter the raw JSON of
    // `search_pool`, instructions to the model and all. Anything that is not an
    // assistant turn is no text, and the caller writes the sentence instead.
    const last = out.messages.at(-1);
    const text =
      last?.getType() === "ai" && typeof last.content === "string"
        ? last.content.trim()
        : "";
    return { ok: true, text, hops: hopCount() };
  } catch (error) {
    const aborted = controller.signal.aborted;
    const name = error instanceof Error ? error.name : "";
    // 429 is not a bug and not a timeout — it is the plan's tokens-per-minute
    // ceiling, and it is common enough on the free tier that a recruiter must be
    // told to try again rather than shown a generic fallback that reads like an
    // answer.
    const rateLimited =
      /RateLimit|429/i.test(name) || /\b429\b|rate limit/i.test(String(error));
    // A dead key is not a busy one. Both stop the model, but 429 clears itself
    // and 401 never does — telling a recruiter "try again in a few seconds"
    // about an expired key is a message that can only ever be wrong, and it
    // hides the one fact an operator needs from the log.
    const unauthorised =
      /\b401\b|invalid api key|expired_api_key|authentication/i.test(String(error));
    const reason = aborted
      ? "timeout"
      : name === "GraphRecursionError"
        ? "recursion"
        : unauthorised
          ? "auth"
          : rateLimited
            ? "rate_limit"
            : "error";
    logger.error("[scout-graph] run failed", {
      reason,
      hops: hopCount(),
      error: String(error).slice(0, 200),
    });
    return { ok: false, reason, hops: hopCount() };
  } finally {
    clearTimeout(timer);
  }
}

/** Exported for the evals — the retry rule, without a model or a network. */
export const __test = { rotatable };
