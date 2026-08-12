import "server-only";

import { askGroqJson, groqConfigured } from "@/lib/groq";
import { logger } from "@/lib/logger";
import {
  HIRE_SLOTS,
  inapplicableSlots,
  isSlotFilled,
  jobSpecSchema,
  scoutTurnSchema,
  type HireSlot,
  type JobSpec,
  type ScoutTurn,
} from "@/lib/validations/hire";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const SENIORITY_YEARS: Record<string, { min: number; max: number }> = {
  INTERN: { min: 0, max: 1 },
  JUNIOR: { min: 0, max: 2 },
  MID: { min: 2, max: 5 },
  SENIOR: { min: 5, max: 12 },
  LEAD: { min: 8, max: 25 },
};

/** First applicable slot with no answer yet. `null` = every question answered. */
function nextSlot(spec: JobSpec): HireSlot | null {
  const skip = inapplicableSlots(spec);
  return HIRE_SLOTS.find((s) => !skip.has(s) && !isSlotFilled(spec, s)) ?? null;
}

/**
 * Merge the recruiter's answer into ONE named slot.
 *
 * Deliberately slot-scoped. The previous implementation guessed which field a
 * free-text reply belonged to, so the answer to "what role?" was filed as a
 * required skill and the real stack answer was then discarded. Answering a
 * question can no longer write to a field that question didn't ask about.
 *
 * This runs before the model does and does not depend on it, so a chip click
 * lands correctly even when the AI is unreachable.
 */
function mergeIntoSlot(spec: JobSpec, slot: HireSlot, raw: string): JobSpec {
  const msg = raw.trim();
  const lower = msg.toLowerCase();
  const next: JobSpec = { ...spec };

  // "skip:*" marks a slot answered-as-unspecified so it is not asked again.
  if (lower.startsWith("skip:")) {
    switch (slot) {
      case "salary":
        return { ...next, salaryMin: 0, salaryMax: 0 };
      case "employmentType":
        return { ...next, employmentType: "FULL_TIME" };
      case "workMode":
        return { ...next, workMode: "FLEXIBLE" };
      case "locationCity":
        return { ...next, locationCity: "Any" };
      case "noticePeriodDays":
        return { ...next, noticePeriodDays: 180 };
      case "experience":
        return { ...next, minExperience: 0, maxExperience: 50 };
      default: {
        // Seniority and evidence priority have no sentinel that reads as an
        // answer, so record the refusal itself. Returning `next` unchanged
        // here left the slot unanswered, and Scout re-asked the same
        // chip-only question forever.
        const prior = (next.extra ?? {}) as Record<string, unknown>;
        const already = Array.isArray(prior.skipped)
          ? (prior.skipped as string[])
          : [];
        return {
          ...next,
          extra: { ...prior, skipped: [...new Set([...already, slot])] },
        };
      }
    }
  }

  switch (slot) {
    case "title":
      return { ...next, title: msg.slice(0, 200) };

    case "seniority": {
      const hit = (["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"] as const).find(
        (s) => lower === s.toLowerCase(),
      );
      // Deliberately does NOT back-fill an experience band. Doing so marked the
      // `experience` slot answered, so Scout silently stopped asking about it
      // and the progress bar jumped two steps on one reply.
      return hit ? { ...next, seniority: hit } : next;
    }

    case "mustHaveStack": {
      const stack = msg
        .split(/[,/|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
      return stack.length ? { ...next, mustHaveStack: stack } : next;
    }

    case "evidencePriority": {
      // Only the dimensions the ranker actually understands. Accepting free
      // text here once stored "what else do you need from me?" as a ranking
      // signal, which then silently weighted nothing.
      const keys = msg
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => EVIDENCE_KEYS.has(s))
        .slice(0, 5);
      return keys.length ? { ...next, evidencePriority: keys } : next;
    }

    case "salary": {
      const chip = /salary:(\d+)-(\d+)/.exec(lower);
      if (chip) {
        return {
          ...next,
          salaryMin: Number(chip[1]),
          salaryMax: Number(chip[2]),
          salaryCurrency: "INR",
          salaryPeriod: "ANNUAL",
        };
      }
      // Free text such as "12-18 LPA" or "1200000 to 1800000".
      const nums = msg.match(/\d+(?:\.\d+)?/g);
      if (!nums?.length) return next;
      const isLpa = /lpa|lakh/i.test(msg);
      const toRupees = (n: string) =>
        Math.round(Number(n) * (isLpa ? 100_000 : 1));
      const a = toRupees(nums[0]!);
      const b = nums[1] ? toRupees(nums[1]) : a;
      return {
        ...next,
        salaryMin: Math.min(a, b),
        salaryMax: Math.max(a, b),
        salaryCurrency: "INR",
        salaryPeriod: "ANNUAL",
      };
    }

    case "employmentType": {
      const hit = (
        ["FULL_TIME", "CONTRACT", "INTERNSHIP", "PART_TIME"] as const
      ).find((s) => lower === s.toLowerCase());
      return hit ? { ...next, employmentType: hit } : next;
    }

    case "workMode": {
      const hit = (["ONSITE", "HYBRID", "REMOTE", "FLEXIBLE"] as const).find(
        (s) => lower === s.toLowerCase(),
      );
      return hit ? { ...next, workMode: hit } : next;
    }

    case "locationCity":
      return { ...next, locationCity: msg.slice(0, 80) };

    case "noticePeriodDays": {
      const n = /\d+/.exec(msg);
      return n
        ? { ...next, noticePeriodDays: Math.min(180, Number(n[0])) }
        : next;
    }

    case "experience": {
      const nums = msg.match(/\d+/g);
      if (!nums?.length) return next;
      const a = Number(nums[0]);
      const b = nums[1] ? Number(nums[1]) : a;
      return {
        ...next,
        minExperience: Math.min(a, b),
        maxExperience: Math.max(a, b),
      };
    }
  }
}

type SlotQuestion = {
  question: string;
  options: { label: string; value: string }[];
};

function questionFor(slot: HireSlot, spec: JobSpec): SlotQuestion {
  const role = spec.title?.trim() || "this role";
  switch (slot) {
    case "title":
      return {
        question: "What role are you hiring for?",
        options: [
          { label: "Backend engineer", value: "Backend engineer" },
          { label: "Full-stack engineer", value: "Full-stack engineer" },
          { label: "Data / ML engineer", value: "Data / ML engineer" },
          { label: "AI engineer", value: "AI engineer" },
          { label: "Frontend engineer", value: "Frontend engineer" },
        ],
      };
    case "seniority":
      return {
        question: `What seniority for the ${role}?`,
        options: [
          { label: "Intern", value: "INTERN" },
          { label: "Junior · 0–2y", value: "JUNIOR" },
          { label: "Mid · 2–5y", value: "MID" },
          { label: "Senior · 5y+", value: "SENIOR" },
          { label: "Lead", value: "LEAD" },
          { label: "Not fixed", value: "skip:seniority" },
        ],
      };
    case "mustHaveStack":
      return {
        question: "Which skills are non-negotiable? Pick one or type your own.",
        options: [
          { label: "Python + SQL", value: "Python, SQL" },
          { label: "TypeScript + React", value: "TypeScript, React" },
          { label: "Python + PyTorch", value: "Python, PyTorch" },
          { label: "Java + Spring", value: "Java, Spring" },
          { label: "Node + Postgres", value: "Node, PostgreSQL" },
        ],
      };
    case "evidencePriority":
      return {
        question:
          "What should I weigh most heavily? This reorders the ranking against real platform evidence.",
        options: [
          { label: "Code correctness", value: "missions" },
          { label: "First-attempt quality", value: "clean_pass" },
          { label: "Project quality", value: "projects" },
          { label: "Consistency", value: "consistency" },
          { label: "Communication", value: "interview" },
          { label: "No preference", value: "skip:evidence" },
        ],
      };
    case "salary":
      return {
        question: "What's the budget for this role?",
        options: [
          { label: "8–12 LPA", value: "salary:800000-1200000" },
          { label: "12–18 LPA", value: "salary:1200000-1800000" },
          { label: "18–28 LPA", value: "salary:1800000-2800000" },
          { label: "28 LPA+", value: "salary:2800000-6000000" },
          { label: "Skip", value: "skip:salary" },
        ],
      };
    case "employmentType":
      return {
        question: "What kind of engagement is this?",
        options: [
          { label: "Full-time", value: "FULL_TIME" },
          { label: "Contract", value: "CONTRACT" },
          { label: "Internship", value: "INTERNSHIP" },
          { label: "Part-time", value: "PART_TIME" },
          { label: "Open to any", value: "skip:employment" },
        ],
      };
    case "workMode":
      return {
        question: "Where will they work from?",
        options: [
          { label: "Remote", value: "REMOTE" },
          { label: "Hybrid", value: "HYBRID" },
          { label: "Onsite", value: "ONSITE" },
          { label: "Flexible", value: "FLEXIBLE" },
          { label: "Not decided", value: "skip:mode" },
        ],
      };
    case "locationCity":
      return {
        question: "Which city is the office in?",
        options: [
          { label: "Bengaluru", value: "Bengaluru" },
          { label: "Hyderabad", value: "Hyderabad" },
          { label: "Pune", value: "Pune" },
          { label: "Delhi NCR", value: "Delhi NCR" },
          { label: "Mumbai", value: "Mumbai" },
          { label: "Skip", value: "skip:city" },
        ],
      };
    case "noticePeriodDays":
      return {
        question: "How soon do you need them to start?",
        options: [
          { label: "Immediate", value: "0" },
          { label: "Within 15 days", value: "15" },
          { label: "Within 30 days", value: "30" },
          { label: "Within 60 days", value: "60" },
          { label: "Flexible", value: "skip:notice" },
        ],
      };
    case "experience": {
      const band = spec.seniority ? SENIORITY_YEARS[spec.seniority] : null;
      return {
        question:
          "Any hard experience band, or should I go by evidence alone?",
        options: [
          { label: "Evidence only", value: "skip:experience" },
          // Offered first when seniority is known, so the common case is one tap.
          ...(band
            ? [
                {
                  label: `Match seniority · ${band.min}–${band.max}y`,
                  value: `${band.min}-${band.max}`,
                },
              ]
            : []),
          { label: "0–2 years", value: "0-2" },
          { label: "2–5 years", value: "2-5" },
          { label: "5–8 years", value: "5-8" },
          { label: "8+ years", value: "8-25" },
        ],
      };
    }
  }
}

function summarize(spec: JobSpec): string {
  const parts: string[] = [];
  if (spec.title) parts.push(spec.title);
  if (spec.seniority) parts.push(spec.seniority.toLowerCase());
  if (spec.mustHaveStack?.length)
    parts.push(spec.mustHaveStack.slice(0, 4).join(" · "));
  if (spec.salaryMin && spec.salaryMax)
    parts.push(
      `₹${Math.round(spec.salaryMin / 100000)}–${Math.round(spec.salaryMax / 100000)} LPA`,
    );
  if (spec.workMode) parts.push(spec.workMode.toLowerCase());
  if (spec.locationCity && spec.locationCity !== "Any")
    parts.push(spec.locationCity);
  return parts.length ? parts.join(" • ") : "Starting a new requirement.";
}

const SLOT_LABELS: Record<HireSlot, string> = {
  title: "the role",
  seniority: "seniority",
  mustHaveStack: "must-have skills",
  evidencePriority: "which evidence matters most",
  salary: "budget",
  employmentType: "engagement type",
  workMode: "work mode",
  locationCity: "office city",
  noticePeriodDays: "how soon they should start",
  experience: "experience band",
};

const EVIDENCE_KEYS = new Set([
  "missions",
  "clean_pass",
  "projects",
  "consistency",
  "interview",
  "stack",
  "data",
  "ai_prompting",
  "communication",
  "ship_speed",
]);

const SCOUT_SYSTEM = `You are Scout, ABTalks' hiring assistant. Recruiters describe a role and the product then searches verified platform evidence — missions completed, commit consistency, shipped projects, recorded interviews. Never resumes, never self-reported claims.

You do TWO things and nothing else:

1. EXTRACT. Fill "understood" with only what the recruiter has actually stated, in this message or earlier in the conversation. Never guess, never infer, never fill a field to be helpful. If they did not say it, the value is null. One message may state several things at once — capture all of them.

2. ACKNOWLEDGE. Write "ack": one short, warm sentence reacting to what they JUST said.

Hard rules for "ack":
- React only to the NEW information in this message. Never recap the whole requirement — they can already see it. "Got it, senior Backend Engineer with Python and Postgres, fully remote at 25 LPA" is wrong; "Noted — Python and Postgres it is." is right.
- NEVER ask a question and never end with a question mark. The product appends the next question itself; a question from you would contradict it.
- Never mention candidates, names, counts, scores or availability. You have not searched anything yet.
- Never promise a hire or an outcome.
- Match the recruiter's language. If they write Hindi or Hinglish, reply the same way.
- One sentence. No bullet points, no lists.

Choosing "intent":
- "answer" — they responded to what was asked.
- "revise" — they are changing something already agreed ("actually make it remote", "no, mid-level"). Use this whenever they contradict an earlier answer.
- "question" — they asked YOU something ("what else do you need?", "why does that matter?"). Answer it in "ack", using the "still needed" list you were given.
- "unclear" — you genuinely cannot tell what they meant. Say briefly what you did not follow.

Field notes:
- Salary is always in lakhs per annum (LPA). "25 LPA" is 25. A single figure means min and max are both that number.
- noticePeriodDays is a NUMBER OF DAYS. "asap", "immediately", "right away", "yesterday" all mean 0. "a month" is 30, "two months" is 60, "no rush" is 90.
- evidencePriority must be one of these exact keys, chosen by meaning:
  missions — code correctness; whether their solutions actually pass.
  clean_pass — getting it right first try, without repeated retries.
  projects — the quality of what they have shipped.
  consistency — steady commit activity over time, not bursts.
  interview — how well they explain their work out loud.`;

const SCOUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "ack", "understood"],
  properties: {
    intent: {
      type: "string",
      enum: ["answer", "revise", "question", "unclear"],
    },
    ack: { type: "string" },
    understood: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "seniority",
        "mustHaveStack",
        "niceToHaveStack",
        "evidencePriority",
        "salaryMinLpa",
        "salaryMaxLpa",
        "employmentType",
        "workMode",
        "locationCity",
        "noticePeriodDays",
        "minExperience",
        "maxExperience",
      ],
      properties: {
        title: { type: ["string", "null"] },
        seniority: {
          type: ["string", "null"],
          enum: ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD", null],
        },
        mustHaveStack: { type: ["array", "null"], items: { type: "string" } },
        niceToHaveStack: { type: ["array", "null"], items: { type: "string" } },
        evidencePriority: {
          type: ["array", "null"],
          items: {
            type: "string",
            enum: [
              "missions",
              "clean_pass",
              "projects",
              "consistency",
              "interview",
            ],
          },
        },
        salaryMinLpa: { type: ["number", "null"] },
        salaryMaxLpa: { type: ["number", "null"] },
        employmentType: {
          type: ["string", "null"],
          enum: ["FULL_TIME", "CONTRACT", "INTERNSHIP", "PART_TIME", null],
        },
        workMode: {
          type: ["string", "null"],
          enum: ["ONSITE", "HYBRID", "REMOTE", "FLEXIBLE", null],
        },
        locationCity: { type: ["string", "null"] },
        noticePeriodDays: { type: ["number", "null"] },
        minExperience: { type: ["number", "null"] },
        maxExperience: { type: ["number", "null"] },
      },
    },
  },
};

type ScoutUnderstood = {
  title: string | null;
  seniority: string | null;
  mustHaveStack: string[] | null;
  niceToHaveStack: string[] | null;
  evidencePriority: string[] | null;
  salaryMinLpa: number | null;
  salaryMaxLpa: number | null;
  employmentType: string | null;
  workMode: string | null;
  locationCity: string | null;
  noticePeriodDays: number | null;
  minExperience: number | null;
  maxExperience: number | null;
};

type ScoutRead = {
  intent: "answer" | "revise" | "question" | "unclear";
  ack: string;
  understood: ScoutUnderstood;
};

/** Lakhs per annum → rupees, tolerating a recruiter who states raw rupees. */
function lpaToRupees(value: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  const rupees = value >= 1000 ? value : value * 100_000;
  return Math.round(Math.min(rupees, 100_000_000));
}

function cleanList(
  value: string[] | null,
  max: number,
  allowed?: Set<string>,
): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0 && s.length <= 60)
    .filter((s) => (allowed ? allowed.has(s.toLowerCase()) : true))
    .slice(0, max);
  return out.length ? out : null;
}

/**
 * Fold the model's reading of the message into the spec.
 *
 * The model sees the whole spec, so it routinely re-states values it was already
 * given. Re-writing an identical value is harmless; silently *changing* an
 * agreed answer is not. So a field is only overwritten when the recruiter is
 * actually revising — otherwise this can fill blanks and nothing else. That
 * keeps the recruiter, not the model, in charge of what the requirement says.
 */
function applyUnderstood(
  base: JobSpec,
  understood: ScoutUnderstood,
  revising: boolean,
): JobSpec {
  const next: JobSpec = { ...base };
  const open = (slot: HireSlot) => revising || !isSlotFilled(base, slot);

  if (understood.title?.trim() && open("title")) {
    next.title = understood.title.trim().slice(0, 200);
  }

  if (understood.seniority && open("seniority")) {
    const hit = (["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"] as const).find(
      (s) => s === understood.seniority,
    );
    if (hit) next.seniority = hit;
  }

  const must = cleanList(understood.mustHaveStack, 12);
  if (must && open("mustHaveStack")) next.mustHaveStack = must;

  // Nice-to-haves are never asked about, so they only ever get added, never
  // gated on a slot — a recruiter can volunteer them at any point.
  const nice = cleanList(understood.niceToHaveStack, 12);
  if (nice) next.niceToHaveStack = nice;

  const evidence = cleanList(understood.evidencePriority, 5, EVIDENCE_KEYS);
  if (evidence && open("evidencePriority")) {
    next.evidencePriority = evidence.map((e) => e.toLowerCase());
  }

  if (open("salary")) {
    const lo = lpaToRupees(understood.salaryMinLpa);
    const hi = lpaToRupees(understood.salaryMaxLpa);
    if (lo != null || hi != null) {
      next.salaryMin = Math.min(lo ?? hi!, hi ?? lo!);
      next.salaryMax = Math.max(lo ?? hi!, hi ?? lo!);
      next.salaryCurrency = "INR";
      next.salaryPeriod = "ANNUAL";
    }
  }

  if (understood.employmentType && open("employmentType")) {
    const hit = (
      ["FULL_TIME", "CONTRACT", "INTERNSHIP", "PART_TIME"] as const
    ).find((s) => s === understood.employmentType);
    if (hit) next.employmentType = hit;
  }

  if (understood.workMode && open("workMode")) {
    const hit = (["ONSITE", "HYBRID", "REMOTE", "FLEXIBLE"] as const).find(
      (s) => s === understood.workMode,
    );
    if (hit) next.workMode = hit;
  }

  if (understood.locationCity?.trim() && open("locationCity")) {
    next.locationCity = understood.locationCity.trim().slice(0, 80);
  }

  if (understood.noticePeriodDays != null && open("noticePeriodDays")) {
    const n = Number(understood.noticePeriodDays);
    if (Number.isFinite(n) && n >= 0) {
      next.noticePeriodDays = Math.round(Math.min(180, n));
    }
  }

  if (open("experience")) {
    const lo = understood.minExperience;
    const hi = understood.maxExperience;
    const nums = [lo, hi].filter(
      (n): n is number => n != null && Number.isFinite(n) && n >= 0,
    );
    if (nums.length) {
      next.minExperience = Math.round(Math.min(...nums));
      next.maxExperience = Math.round(Math.min(50, Math.max(...nums)));
    }
  }

  const parsed = jobSpecSchema.safeParse(next);
  return parsed.success ? parsed.data : base;
}

/**
 * Did this message come from tapping a chip rather than typing?
 *
 * Chip values are generated by `questionFor`, so an exact match is proof the
 * recruiter picked a known option. Those parse perfectly offline, which is why
 * they skip the model entirely: no latency, no tokens, and — since most answers
 * are taps — enough headroom to stay inside a rate-limited AI plan.
 */
function isChipAnswer(slot: HireSlot, spec: JobSpec, msg: string): boolean {
  if (/^(skip:|salary:|action:|edit:)/i.test(msg)) return true;
  return questionFor(slot, spec).options.some((o) => o.value === msg);
}

/**
 * A message that asks something rather than answering. Without this the offline
 * parser filed "what else do you need from me?" as the job title, because the
 * title slot accepts any prose.
 */
function looksLikeQuestion(msg: string): boolean {
  const m = msg.trim();
  if (m.endsWith("?")) return true;
  return /^(what|why|how|who|when|which|can|could|do|does|is|are|kya|kaise|kyun|kaun)\b/i.test(
    m,
  );
}

/** Short, zero-token acknowledgement for a tapped chip. */
function chipAck(slot: HireSlot, spec: JobSpec): string {
  switch (slot) {
    case "title":
      return `${spec.title} — good brief.`;
    case "seniority": {
      const s = spec.seniority ?? "";
      return `${s.charAt(0)}${s.slice(1).toLowerCase()} it is.`;
    }
    case "mustHaveStack":
      return `Noted: ${(spec.mustHaveStack ?? []).join(", ")}.`;
    case "evidencePriority":
      return "Got it — I'll weight the ranking that way.";
    case "salary":
      return spec.salaryMin ? "Budget noted." : "No problem, skipping budget.";
    case "employmentType":
      return "Noted.";
    case "workMode":
      return spec.workMode === "REMOTE"
        ? "Remote — then I won't ask about a city."
        : "Noted.";
    case "locationCity":
      return spec.locationCity === "Any"
        ? "Fine, any city."
        : `${spec.locationCity} it is.`;
    case "noticePeriodDays":
      return "Got it.";
    case "experience":
      return "Understood.";
  }
}

/** Plain-English list of what Scout still has to ask, for the model's context. */
function stillNeeded(spec: JobSpec): string[] {
  const skip = inapplicableSlots(spec);
  return HIRE_SLOTS.filter(
    (s) => !skip.has(s) && !isSlotFilled(spec, s),
  ).map((s) => SLOT_LABELS[s]);
}

/** Assemble the visible turn: the model's words, the engine's question. */
function turnFor(spec: JobSpec, ack: string): ScoutTurn {
  const upcoming = nextSlot(spec);
  const summary = summarize(spec);

  if (!upcoming) {
    return {
      spec,
      nextQuestion: ack || null,
      options: [
        { label: "Search verified talent", value: "action:search" },
        { label: "Change the stack", value: "edit:stack" },
      ],
      allowFreeText: true,
      readyToSearch: true,
      summary,
    };
  }

  const q = questionFor(upcoming, spec);
  return {
    spec,
    // The acknowledgement is the model's; the question never is. Joining them
    // here is what stops a natural-sounding reply and a correct flow from
    // disagreeing about which question was actually asked.
    nextQuestion: ack ? `${ack}\n\n${q.question}` : q.question,
    options: q.options,
    allowFreeText: true,
    readyToSearch: false,
    summary,
  };
}

function checked(turn: ScoutTurn, fallback: ScoutTurn): ScoutTurn {
  const parsed = scoutTurnSchema.safeParse(turn);
  if (parsed.success) return parsed.data;
  logger.error("[hire] scout turn failed schema", {
    err: parsed.error.message.slice(0, 200),
  });
  return fallback;
}

function mergedBySlot(spec: JobSpec, slot: HireSlot, msg: string): JobSpec {
  const parsed = jobSpecSchema.safeParse(mergeIntoSlot(spec, slot, msg));
  return parsed.success ? parsed.data : spec;
}

/**
 * One conversational turn.
 *
 * Control flow stays deterministic and the model only ever supplies language:
 * which slot is being asked, which chips appear, and whether the requirement is
 * complete are all computed from the spec, never taken from the model. Letting
 * the model own the flow is what ended the conversation after seniority.
 *
 * Three paths, in order of cost:
 *
 *   1. Chip tap — an exact known value. Parsed offline with a canned
 *      acknowledgement: instant, free, and correct even with no AI at all.
 *   2. Typed text — the model reads it. One message may fill several slots,
 *      revise an earlier answer, or ask Scout a question; `applyUnderstood`
 *      folds its reading in under Zod.
 *   3. Typed text with no AI reachable — the slot-scoped parser, but only when
 *      the message reads as an answer. It accepts free prose, so handing it a
 *      question stored the question as the answer.
 */
export async function runScoutTurn(args: {
  priorSpec: JobSpec;
  history: ChatMessage[];
  userMessage: string;
}): Promise<ScoutTurn> {
  const msg = args.userMessage.trim();
  const asking = nextSlot(args.priorSpec);
  const unchanged = turnFor(args.priorSpec, "");

  // 1 — chip tap
  if (asking && isChipAnswer(asking, args.priorSpec, msg)) {
    const spec = mergedBySlot(args.priorSpec, asking, msg);
    const ack = isSlotFilled(spec, asking) ? chipAck(asking, spec) : "";
    return checked(turnFor(spec, ack), unchanged);
  }

  // 2 — typed text, read by the model
  if (groqConfigured()) {
    const ai = await askGroqJson<ScoutRead>({
      system: SCOUT_SYSTEM,
      schemaName: "scout_read",
      // Only an acknowledgement and a small object come back, but the model
      // reasons first and that reasoning is billed here too — too tight a
      // budget and it never reaches the JSON.
      maxTokens: 1000,
      messages: [
        ...args.history.slice(-6).map((m) => ({
          role: m.role,
          content: m.content,
        })),
        {
          role: "user" as const,
          content: [
            `Requirement so far: ${JSON.stringify(args.priorSpec)}`,
            `You just asked about: ${asking ? SLOT_LABELS[asking] : "nothing — everything is answered"}`,
            `Still needed: ${stillNeeded(args.priorSpec).join(", ") || "nothing"}`,
            `Recruiter said: ${msg}`,
          ].join("\n"),
        },
      ],
      schema: SCOUT_SCHEMA,
    });

    if (ai.ok) {
      const spec = applyUnderstood(
        args.priorSpec,
        ai.data.understood,
        ai.data.intent === "revise",
      );
      // nextQuestion is capped at 500 chars and the canonical question must
      // always survive, so the acknowledgement is what gets trimmed.
      const ack = ai.data.ack.trim().slice(0, 280);
      return checked(turnFor(spec, ack), unchanged);
    }
  }

  // 3 — typed text with the model unavailable
  if (asking && !looksLikeQuestion(msg)) {
    const spec = mergedBySlot(args.priorSpec, asking, msg);
    // Slots like evidencePriority only accept known values, so an unrecognised
    // reply changes nothing. Re-asking the bare question then looks like the
    // conversation is stuck; say what happened instead.
    const understood = isSlotFilled(spec, asking);
    return checked(
      turnFor(
        spec,
        understood ? "" : "Sorry, I didn't catch that — pick an option below, or say it another way.",
      ),
      unchanged,
    );
  }

  // A question we cannot answer conversationally still has a useful literal
  // answer: what is left to ask. That is known without any AI.
  const remaining = stillNeeded(args.priorSpec);
  return checked(
    turnFor(
      args.priorSpec,
      remaining.length ? `Still to cover: ${remaining.join(", ")}.` : "",
    ),
    unchanged,
  );
}
