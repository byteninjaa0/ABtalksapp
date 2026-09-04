import "server-only";

import { logger } from "@/lib/logger";
import { findUnsupported, unsupportedReply } from "@/features/hire/capabilities";
import { extractDelta, EMPTY_DELTA } from "@/features/hire/intake";
import {
  jobFromSearchSpec,
  reduceSpec,
  searchableSpec,
  searchSpecFromJob,
  type DroppedOp,
} from "@/features/hire/reduce-spec";
import { poolSnapshot } from "@/features/hire/pool-facts";
import { __test as explainGuards } from "@/features/hire/explain-matches";
import { delugSlugs } from "@/features/hire/track-registry";
import type { JobSpec } from "@/lib/validations/hire";
import type { SearchSpec } from "@/lib/validations/hire";

/**
 * Scout as a seven-stage orchestrator. Two model calls, neither can act:
 * extract returns a delta; explain (in hire-actions) returns prose.
 */

const SEE =
  "(?:give|show|send|fetch|get|find|list|pull|bring|search|dikha|dikhao|laao|la do|dhundo)";
const CARDS = "(?:candidate|student|people|profile|card|match)s?";
const WANTS_TO_SEE_CARDS = new RegExp(
  `\\b${SEE}\\b[^?]*\\b${CARDS}\\b|\\b${CARDS}\\b[^?]*\\b${SEE}\\b`,
  "i",
);
const BARE_SHOW =
  /^(?:ok(?:ay)?[,.\s]+)?(?:now\s+)?(?:please\s+)?(?:give|show|search|find|go|start|dikha(?:o|ao)?|la(?:o|ao)?|dhundo|karo)\s*(?:me\s*)?(?:it\s*)?(?:now\s*)?(?:please\s*)?[.!,]*$/i;

function wantsToSeeCards(msg: string): boolean {
  const m = msg.trim();
  if (!m || m.endsWith("?")) return false;
  if (WANTS_TO_SEE_CARDS.test(m)) return true;
  return BARE_SHOW.test(m);
}

const QUESTION_OPENER =
  /^(?:who|what|whats|which|when|where|why|how|hows|can|could|do|does|did|is|are|am|was|were|should|would|will|any|kya|kaun|kitne|kitna|kaise)\b/i;

function looksLikeQuestion(msg: string): boolean {
  const m = msg.trim();
  return m.endsWith("?") || QUESTION_OPENER.test(m);
}

const POOL_QUESTION =
  /\b(how many|kitne|kitna|pool size|candidates do you have|how big (is|the) pool|available candidates)\b/i;

const GREETING = /^(?:hi|hey|hello|yo|namaste|namaskar)\b/i;

export type ScoutAgentResult = {
  spec: JobSpec;
  searchSpec: SearchSpec;
  text: string;
  action: "search" | "reset" | null;
  degraded: boolean;
  options?: { label: string; value: string }[] | null;
  dropped?: DroppedOp[];
  demoted?: { id: string; reason: string }[];
};

function recruiterCorpus(
  history: { role: "user" | "assistant"; content: string }[],
  msg: string,
): string {
  return [
    ...history.filter((m) => m.role === "user").slice(-8).map((m) => m.content),
    msg,
  ].join("\n");
}

function clarifyOptions(
  clarify: { question: string; options: string[] } | null,
): { label: string; value: string }[] | null {
  if (!clarify?.options.length) return null;
  return clarify.options.slice(0, 6).map((o) => ({ label: o, value: o }));
}

function demotionLines(demoted: { id: string; reason: string }[]): string {
  const uniq = [...new Set(demoted.map((d) => d.reason))];
  return uniq.join(" ");
}

function droppedLine(dropped: DroppedOp[]): string {
  if (dropped.length === 0) return "";
  return "I only recorded what I could quote from your words.";
}

async function poolCountSentence(): Promise<string> {
  const snap = await poolSnapshot();
  if (!snap.hasPool) {
    return "There are no candidates available — no cohort is open to hiring yet.";
  }
  return `There are ${snap.eligibleCount} candidates in the verified pool right now.`;
}

function outOfScopeText(): string {
  return "That's outside what I do. I search verified ABTalks candidates — tell me the role or the skills you need.";
}

function greetingText(): string {
  return "Hi — tell me who you're hiring for and I'll search the verified pool.";
}

const { figuresIn } = explainGuards;

function ungroundedFigures(
  text: string,
  facts: unknown[],
  userMessage: string,
  spec?: JobSpec,
): string[] {
  const said = figuresIn(text);
  const allowed = new Set([
    ...figuresIn(JSON.stringify(facts)),
    ...figuresIn(userMessage),
    ...(spec ? figuresIn(JSON.stringify(spec)) : []),
  ]);
  return said.filter((n) => !allowed.has(n));
}

function isGrounded(
  text: string,
  facts: unknown[],
  userMessage: string,
  spec?: JobSpec,
): boolean {
  return ungroundedFigures(text, facts, userMessage, spec).length === 0;
}

export async function runScoutAgent(args: {
  priorSpec: JobSpec;
  history: { role: "user" | "assistant"; content: string }[];
  userMessage: string;
}): Promise<ScoutAgentResult> {
  const msg = args.userMessage.trim();
  const priorSearch = searchSpecFromJob(args.priorSpec);

  const blocked = findUnsupported(msg);
  const protectedHit = blocked.find((f) => f.id === "protected_attribute");
  if (protectedHit) {
    return {
      spec: args.priorSpec,
      searchSpec: priorSearch,
      text: unsupportedReply([protectedHit]),
      action: null,
      degraded: false,
    };
  }

  if (wantsToSeeCards(msg) && searchableSpec(priorSearch)) {
    return {
      spec: args.priorSpec,
      searchSpec: priorSearch,
      text: "Searching the verified pool now — the cards are on their way.",
      action: "search",
      degraded: false,
    };
  }

  const limits = blocked.filter((f) => f.id !== "protected_attribute");
  const corpus = recruiterCorpus(args.history, msg);

  if (POOL_QUESTION.test(msg) && !wantsToSeeCards(msg)) {
    const text = await poolCountSentence();
    return {
      spec: args.priorSpec,
      searchSpec: priorSearch,
      text,
      action: null,
      degraded: false,
    };
  }

  let delta = EMPTY_DELTA;
  let degraded = false;
  const extracted = await extractDelta({
    prior: priorSearch,
    userMessage: msg,
    history: args.history,
  });
  if (!extracted.ok) {
    degraded = true;
    logger.error("[scout-agent] extract failed", { reason: extracted.reason });
  } else {
    delta = extracted.delta;
  }

  const reduced = reduceSpec(priorSearch, delta, corpus);
  let nextSpec = reduced.spec;
  nextSpec = {
    ...nextSpec,
    statedAs: [priorSearch.statedAs, msg].filter(Boolean).join("\n").slice(-2000),
  };

  const job = jobFromSearchSpec(nextSpec, args.priorSpec);
  const ready = searchableSpec(nextSpec);
  const options = clarifyOptions(delta.clarify);
  const extraBits = [
    demotionLines(reduced.demoted),
    droppedLine(reduced.dropped),
    limits.length ? unsupportedReply(limits) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const goNow = wantsToSeeCards(msg) && ready;
  const outOfScope =
    !ready &&
    reduced.dropped.filter((d) => d.reason !== "invalid delta — prior spec kept")
      .length === 0 &&
    delta.addCriteria.length === 0 &&
    delta.updateCriteria.length === 0 &&
    delta.removeCriteria.length === 0 &&
    !delta.filtersPatch &&
    !delta.clarify &&
    looksLikeQuestion(msg) &&
    !POOL_QUESTION.test(msg);

  if (outOfScope) {
    return {
      spec: args.priorSpec,
      searchSpec: priorSearch,
      text: outOfScopeText(),
      action: null,
      degraded,
    };
  }

  if (GREETING.test(msg) && !ready && !delta.clarify) {
    return {
      spec: job,
      searchSpec: nextSpec,
      text: greetingText(),
      action: null,
      degraded,
    };
  }

  if (delta.clarify && !ready) {
    return {
      spec: job,
      searchSpec: nextSpec,
      text: [delta.clarify.question, extraBits].filter(Boolean).join(" ").trim(),
      action: null,
      degraded,
      options,
      dropped: reduced.dropped,
      demoted: reduced.demoted,
    };
  }

  const shouldSearch =
    ready &&
    (goNow ||
      Boolean(delta.clarify) ||
      !looksLikeQuestion(msg) ||
      reduced.spec.criteria.length > priorSearch.criteria.length ||
      JSON.stringify(reduced.spec.filters) !== JSON.stringify(priorSearch.filters));

  if (shouldSearch) {
    const lead = extraBits
      ? extraBits
      : "Searching the verified pool now — the cards are on their way.";
    const question = delta.clarify?.question
      ? ` ${delta.clarify.question}`
      : "";
    return {
      spec: job,
      searchSpec: nextSpec,
      text: delugSlugs(`${lead}${question}`.trim()).slice(0, 700),
      action: "search",
      degraded,
      options,
      dropped: reduced.dropped,
      demoted: reduced.demoted,
    };
  }

  const fallback = ready
    ? "I have enough to search on — say Search now, or tell me anything else you want weighted."
    : "Tell me the role you're hiring for, or a skill to rank on.";
  return {
    spec: job,
    searchSpec: nextSpec,
    text: [extraBits, fallback].filter(Boolean).join(" ").trim(),
    action: null,
    degraded,
    options,
    dropped: reduced.dropped,
    demoted: reduced.demoted,
  };
}

export const __test = {
  isGrounded,
  ungroundedFigures,
  wantsToSeeCards,
  looksLikeQuestion,
  POOL_QUESTION,
};
