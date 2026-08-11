import "server-only";

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
 * question can no longer write to a field that question didn't ask about — the
 * one exception is `seniority`, which back-fills an experience band the
 * recruiter can still override.
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
      default:
        return next;
    }
  }

  switch (slot) {
    case "title":
      return { ...next, title: msg.slice(0, 200) };

    case "seniority": {
      const hit = (["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"] as const).find(
        (s) => lower === s.toLowerCase(),
      );
      if (!hit) return next;
      const band = SENIORITY_YEARS[hit]!;
      return {
        ...next,
        seniority: hit,
        minExperience: next.minExperience ?? band.min,
        maxExperience: next.maxExperience ?? band.max,
      };
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
      const keys = msg
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
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
  allowFreeText: boolean;
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
        allowFreeText: true,
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
        ],
        allowFreeText: false,
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
        allowFreeText: true,
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
        ],
        allowFreeText: false,
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
        allowFreeText: true,
      };
    case "employmentType":
      return {
        question: "What kind of engagement is this?",
        options: [
          { label: "Full-time", value: "FULL_TIME" },
          { label: "Contract", value: "CONTRACT" },
          { label: "Internship", value: "INTERNSHIP" },
          { label: "Part-time", value: "PART_TIME" },
        ],
        allowFreeText: false,
      };
    case "workMode":
      return {
        question: "Where will they work from?",
        options: [
          { label: "Remote", value: "REMOTE" },
          { label: "Hybrid", value: "HYBRID" },
          { label: "Onsite", value: "ONSITE" },
          { label: "Flexible", value: "FLEXIBLE" },
        ],
        allowFreeText: false,
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
        allowFreeText: true,
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
        allowFreeText: false,
      };
    case "experience":
      return {
        question: "Any hard experience band, or should I go by evidence alone?",
        options: [
          { label: "Evidence only", value: "skip:experience" },
          { label: "0–2 years", value: "0-2" },
          { label: "2–5 years", value: "2-5" },
          { label: "5–8 years", value: "5-8" },
          { label: "8+ years", value: "8-25" },
        ],
        allowFreeText: true,
      };
  }
}

/**
 * Deterministic Scout turn — used when Claude is unavailable, and as the
 * schema-safe fallback. Asks every applicable slot before offering the search;
 * never invents candidates.
 */
export function scoutTurnDeterministic(
  priorSpec: JobSpec,
  userMessage: string,
  _turnIndex: number,
): ScoutTurn {
  // The slot being answered is the one unanswered *before* this reply.
  const answering = nextSlot(priorSpec);
  const merged = answering
    ? mergeIntoSlot(priorSpec, answering, userMessage)
    : priorSpec;

  const validated = jobSpecSchema.safeParse(merged);
  const spec = validated.success ? validated.data : priorSpec;
  const upcoming = nextSlot(spec);

  if (!upcoming) {
    return {
      spec,
      nextQuestion: null,
      options: [
        { label: "Search verified talent", value: "action:search" },
        { label: "Change the stack", value: "edit:stack" },
      ],
      allowFreeText: true,
      readyToSearch: true,
      summary: summarize(spec),
    };
  }

  const q = questionFor(upcoming, spec);
  return {
    spec,
    nextQuestion: q.question,
    options: q.options,
    allowFreeText: q.allowFreeText,
    readyToSearch: false,
    summary: summarize(spec),
  };
}

/** Used by the Claude path, which applies chip values before AI output. */
function mergeSpecFromMessage(prior: JobSpec, raw: string): JobSpec {
  const slot = nextSlot(prior);
  if (!slot) return prior;
  const parsed = jobSpecSchema.safeParse(mergeIntoSlot(prior, slot, raw));
  return parsed.success ? parsed.data : prior;
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

const SCOUT_SYSTEM = `You are Scout, ABTalks' evidence-based hiring assistant for recruiters.
You gather a job requirement conversationally, then the product searches verified platform evidence (missions, commits, projects, interviews) — never resumes.

Rules:
- Ask ONE question per turn.
- At most 6 questions before setting readyToSearch true.
- Always offer option chips (2–6) plus allow free text.
- Merge the recruiter's last message into "spec".
- Prefer stack, evidence priority, role/seniority, compensation, work mode.
- Never invent candidates, names, scores, or evidence.
- education defaults to none (evidence only).
- Respond with ONLY a JSON object matching this schema:
{
  "spec": {
    "title"?: string,
    "seniority"?: "INTERN"|"JUNIOR"|"MID"|"SENIOR"|"LEAD"|null,
    "openings"?: number,
    "mustHaveStack"?: string[],
    "niceToHaveStack"?: string[],
    "evidencePriority"?: string[],
    "salaryMin"?: number|null,
    "salaryMax"?: number|null,
    "salaryCurrency"?: string,
    "salaryPeriod"?: "ANNUAL"|"MONTHLY",
    "workMode"?: "ONSITE"|"HYBRID"|"REMOTE"|"FLEXIBLE"|null,
    "locationCity"?: string|null,
    "employmentType"?: "FULL_TIME"|"CONTRACT"|"INTERNSHIP"|"PART_TIME"|null,
    "noticePeriodDays"?: number|null,
    "minExperience"?: number|null,
    "maxExperience"?: number|null,
    "requiresDegree"?: boolean
  },
  "nextQuestion": string|null,
  "options": [{"label": string, "value": string}],
  "allowFreeText": boolean,
  "readyToSearch": boolean,
  "summary": string
}`;

/**
 * Phase A: try Claude multi-turn; fall back to deterministic chips if AI fails.
 */
export async function runScoutTurn(args: {
  priorSpec: JobSpec;
  history: ChatMessage[];
  userMessage: string;
}): Promise<ScoutTurn> {
  const turnIndex = args.history.filter((m) => m.role === "user").length + 1;
  const fallback = () =>
    scoutTurnDeterministic(args.priorSpec, args.userMessage, turnIndex);

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const { askClaudeAgentJson } = await import("@/lib/claude-agent");
      const messages = [
        ...args.history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        {
          role: "user" as const,
          content: JSON.stringify({
            priorSpec: args.priorSpec,
            latestMessage: args.userMessage,
            turnIndex,
          }),
        },
      ];
      const ai = await askClaudeAgentJson<unknown>({
        system: SCOUT_SYSTEM,
        messages,
        maxTokens: 900,
      });
      if (ai.ok) {
        // Merge AI spec with deterministic merge so chip values still apply
        const baseMerged = mergeSpecFromMessage(
          args.priorSpec,
          args.userMessage,
        );
        const raw = ai.data as Record<string, unknown>;
        const aiSpec =
          raw.spec && typeof raw.spec === "object"
            ? jobSpecSchema.safeParse({ ...baseMerged, ...raw.spec })
            : jobSpecSchema.safeParse(baseMerged);
        const candidate = {
          spec: aiSpec.success ? aiSpec.data : baseMerged,
          nextQuestion:
            typeof raw.nextQuestion === "string" || raw.nextQuestion === null
              ? (raw.nextQuestion as string | null)
              : null,
          options: Array.isArray(raw.options) ? raw.options : [],
          allowFreeText: raw.allowFreeText !== false,
          readyToSearch: raw.readyToSearch === true,
          summary:
            typeof raw.summary === "string"
              ? raw.summary
              : summarize(baseMerged),
        };
        const checked = scoutTurnSchema.safeParse(candidate);
        if (checked.success) return checked.data;
        logger.error("[hire] scout AI schema fail", {
          err: checked.success ? "" : checked.error.message,
        });
      }
    }

    const turn = fallback();
    const checked = scoutTurnSchema.safeParse(turn);
    if (!checked.success) return fallback();
    return checked.data;
  } catch (error) {
    logger.error("[hire] runScoutTurn failed", { error: String(error) });
    return fallback();
  }
}

export { summarize as summarizeJobSpec };
