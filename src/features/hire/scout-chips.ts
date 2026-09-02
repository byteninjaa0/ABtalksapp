/**
 * The quick replies under Scout's message.
 *
 * These used to BE the conversation: ten fixed slots, asked in order, and a
 * recruiter who stated four facts in one sentence still got asked about them
 * one at a time. Then they became a ladder — whatever slot was unfilled next
 * produced a row of tap answers, unprompted. Both versions had the same effect
 * on the recruiter: the product looked like a form, so they filled the form in
 * instead of talking, and a search for a management role offered them a choice
 * of backend stacks.
 *
 * What is left is ACTIONS only — Show me, change the stack, start over — plus
 * whatever Scout deliberately offered this turn through `offer_options`.
 * Questions are asked in words and answered by typing.
 *
 * A tap is still answered by the protocol layer with no model call at all,
 * which on an 8000-tokens-per-minute plan is why the action chips earn their
 * place.
 *
 * Pure: no model, no database, no `server-only`. Same values the old chips
 * used, so the protocol handler in `scout-conversation.ts` is unchanged.
 */
import type { JobSpec } from "@/lib/validations/hire";
import { readPoolExtra } from "@/features/hire/pool-brief";

export type ScoutChip = { label: string; value: string };

/** Chips for a brief that can already be searched. */
function readyChips(): ScoutChip[] {
  return [
    { label: "Show me", value: "action:search" },
    { label: "Change the stack", value: "edit:mustHaveStack" },
    { label: "Change the budget", value: "edit:salary" },
    { label: "Start a new search", value: "action:reset" },
  ];
}

/**
 * Chips the agent offered on the previous turn, stashed on the spec so a tap
 * can be recognised without the model. Written by `turnFor`; read by
 * `isChipValue`. Not a display source — display takes the third argument of
 * `suggestChips` on the turn they were offered.
 */
export function readOfferedChips(spec: JobSpec): ScoutChip[] | null {
  const raw = (spec.extra as { offeredChips?: unknown } | null | undefined)
    ?.offeredChips;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const chips: ScoutChip[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = (row as { label?: unknown }).label;
    const value = (row as { value?: unknown }).value;
    if (typeof label === "string" && label && typeof value === "string" && value) {
      chips.push({ label, value });
    }
  }
  return chips.length ? chips : null;
}

/**
 * Up to four suggestions for where the conversation can go next.
 *
 * `ready` is the engine's judgement that a search would mean something — it is
 * not the model's, and not a claim that the brief is finished. A recruiter can
 * always keep talking instead of tapping.
 *
 * `agentChips`, when present, are what Scout just asked — they win over the
 * fixed ladder. The stable "change the stack / change the budget / start a new
 * search" chips stay on a ready brief so those exits never disappear.
 */
export function suggestChips(
  spec: JobSpec,
  ready: boolean,
  agentChips?: ScoutChip[] | null,
): ScoutChip[] {
  if (agentChips && agentChips.length > 0) {
    if (!ready) return agentChips;
    const stable = readyChips().filter((c) => c.value !== "action:search");
    const seen = new Set(agentChips.map((c) => c.value));
    return [...agentChips, ...stable.filter((c) => !seen.has(c.value))];
  }

  // ── No ladder. ────────────────────────────────────────────────────────────
  //
  // There used to be one here: whatever slot was unfilled next produced a row
  // of tap answers, unasked. It is why a search for a "senior manager" came
  // back offering "Python + SQL / TypeScript + React / Java + Spring", which
  // answers a question nobody had asked and could not be the right answer to
  // any question about that role. Worse, it made every turn look like a form —
  // the recruiter reads four buttons and concludes they must fill them in
  // before anything happens.
  //
  // Suggestions now come from ONE place: Scout, deliberately, through
  // `offer_options`, for a question with a genuinely closed set of answers.
  // Everything else is typed. What is left below are ACTIONS, not questions —
  // the exits a recruiter needs on a brief that can already be searched.
  if (ready) return readyChips();

  const extra = readPoolExtra(spec);
  if (extra.sources.length > 0) return readyChips();
  return [];
}
