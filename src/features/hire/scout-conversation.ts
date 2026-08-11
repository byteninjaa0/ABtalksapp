import "server-only";

import { logger } from "@/lib/logger";
import {
  jobSpecSchema,
  scoutTurnSchema,
  type JobSpec,
  type ScoutTurn,
} from "@/lib/validations/hire";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Deterministic Scout turn when Claude is unavailable or as the first-pass
 * implementation. Asks high-signal questions with chips; never invents candidates.
 */
export function scoutTurnDeterministic(
  priorSpec: JobSpec,
  userMessage: string,
  turnIndex: number,
): ScoutTurn {
  const merged = mergeSpecFromMessage(priorSpec, userMessage);

  // Order of information gain
  if (!merged.title?.trim()) {
    return {
      spec: merged,
      nextQuestion: "What role are you hiring for?",
      options: [
        { label: "Backend engineer", value: "Backend engineer" },
        { label: "Full-stack engineer", value: "Full-stack engineer" },
        { label: "Data / ML engineer", value: "Data / ML engineer" },
        { label: "AI engineer", value: "AI engineer" },
      ],
      allowFreeText: true,
      readyToSearch: false,
      summary: "Starting a new requirement.",
    };
  }

  if (!merged.seniority) {
    return {
      spec: { ...merged },
      nextQuestion: `Seniority for ${merged.title}?`,
      options: [
        { label: "Intern", value: "INTERN" },
        { label: "Junior (0–2y)", value: "JUNIOR" },
        { label: "Mid (2–5y)", value: "MID" },
        { label: "Senior (5+)", value: "SENIOR" },
        { label: "Lead", value: "LEAD" },
      ],
      allowFreeText: false,
      readyToSearch: false,
      summary: summarize(merged),
    };
  }

  if (!merged.mustHaveStack?.length) {
    return {
      spec: merged,
      nextQuestion: "Must-have stack? Pick or type comma-separated skills.",
      options: [
        { label: "Python + SQL", value: "Python, SQL" },
        { label: "TypeScript + React", value: "TypeScript, React" },
        { label: "Python + ML", value: "Python, PyTorch, ML" },
        { label: "Java + Spring", value: "Java, Spring" },
      ],
      allowFreeText: true,
      readyToSearch: false,
      summary: summarize(merged),
    };
  }

  if (!merged.evidencePriority?.length) {
    return {
      spec: merged,
      nextQuestion:
        "What should we optimise for? (ABTalks evidence — this reorders the ranking.)",
      options: [
        { label: "Code correctness", value: "missions" },
        { label: "Consistency (commits)", value: "consistency" },
        { label: "Project quality", value: "projects" },
        { label: "Communication", value: "interview" },
        { label: "First-attempt quality", value: "clean_pass" },
      ],
      allowFreeText: false,
      readyToSearch: false,
      summary: summarize(merged),
    };
  }

  if (merged.salaryMin == null && merged.salaryMax == null && turnIndex < 6) {
    return {
      spec: merged,
      nextQuestion: "Compensation band (annual INR)? Or skip.",
      options: [
        { label: "8–12 LPA", value: "salary:800000-1200000" },
        { label: "12–18 LPA", value: "salary:1200000-1800000" },
        { label: "18–28 LPA", value: "salary:1800000-2800000" },
        { label: "Skip for now", value: "skip:salary" },
      ],
      allowFreeText: true,
      readyToSearch: false,
      summary: summarize(merged),
    };
  }

  if (!merged.workMode && turnIndex < 7) {
    return {
      spec: merged,
      nextQuestion: "Work mode?",
      options: [
        { label: "Remote", value: "REMOTE" },
        { label: "Hybrid", value: "HYBRID" },
        { label: "Onsite", value: "ONSITE" },
        { label: "Flexible", value: "FLEXIBLE" },
        { label: "Skip", value: "skip:mode" },
      ],
      allowFreeText: false,
      readyToSearch: false,
      summary: summarize(merged),
    };
  }

  // Ready — offer search
  return {
    spec: merged,
    nextQuestion: null,
    options: [
      { label: "Search verified talent", value: "action:search" },
      { label: "Add more stack", value: "edit:stack" },
    ],
    allowFreeText: true,
    readyToSearch: true,
    summary: summarize(merged),
  };
}

function summarize(spec: JobSpec): string {
  const parts: string[] = [];
  if (spec.title) parts.push(spec.title);
  if (spec.seniority) parts.push(spec.seniority.toLowerCase());
  if (spec.mustHaveStack?.length) {
    parts.push(`must: ${spec.mustHaveStack.join(", ")}`);
  }
  if (spec.evidencePriority?.length) {
    parts.push(`priority: ${spec.evidencePriority.join(", ")}`);
  }
  if (spec.salaryMin != null || spec.salaryMax != null) {
    parts.push(
      `₹${spec.salaryMin ?? "?"}–${spec.salaryMax ?? "?"} ${spec.salaryCurrency ?? "INR"}`,
    );
  }
  if (spec.workMode) parts.push(spec.workMode.toLowerCase());
  if (spec.locationCity) parts.push(spec.locationCity);
  return parts.length ? parts.join(" · ") : "Requirement in progress";
}

function mergeSpecFromMessage(prior: JobSpec, raw: string): JobSpec {
  const msg = raw.trim();
  const lower = msg.toLowerCase();
  let next: JobSpec = { ...prior };

  if (lower === "skip:salary") {
    return next;
  }
  if (lower === "skip:mode") {
    return { ...next, workMode: next.workMode ?? "FLEXIBLE" };
  }
  if (lower.startsWith("salary:")) {
    const m = /salary:(\d+)-(\d+)/.exec(lower);
    if (m) {
      next = {
        ...next,
        salaryMin: Number(m[1]),
        salaryMax: Number(m[2]),
        salaryCurrency: "INR",
        salaryPeriod: "ANNUAL",
      };
    }
    return next;
  }

  const seniorityHit = (
    ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"] as const
  ).find((s) => lower === s.toLowerCase() || msg === s);
  if (seniorityHit) {
    return { ...next, seniority: seniorityHit };
  }

  const modeHit = (
    ["ONSITE", "HYBRID", "REMOTE", "FLEXIBLE"] as const
  ).find((s) => lower === s.toLowerCase() || msg === s);
  if (modeHit) {
    return { ...next, workMode: modeHit };
  }

  const evidenceKeys = [
    "missions",
    "consistency",
    "projects",
    "interview",
    "clean_pass",
  ];
  if (evidenceKeys.includes(lower) || evidenceKeys.includes(msg)) {
    const key = evidenceKeys.includes(lower) ? lower : msg;
    return {
      ...next,
      evidencePriority: [key, ...(next.evidencePriority ?? [])].slice(0, 5),
    };
  }

  // Stack chips often "Python, SQL"
  if (msg.includes(",") && !next.mustHaveStack?.length) {
    const stack = msg
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (stack.length) return { ...next, mustHaveStack: stack };
  }

  // Role titles when title missing
  if (!next.title?.trim() && msg.length >= 2 && msg.length <= 80) {
    return { ...next, title: msg };
  }

  // Free-text stack when title already set
  if (next.title && !next.mustHaveStack?.length && msg.length >= 2) {
    const stack = msg
      .split(/[,/|]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (stack.length) return { ...next, mustHaveStack: stack };
  }

  // Location free text after mode
  if (next.workMode && next.workMode !== "REMOTE" && !next.locationCity) {
    if (msg.length >= 2 && msg.length <= 60 && !msg.includes(":")) {
      return { ...next, locationCity: msg };
    }
  }

  const parsed = jobSpecSchema.safeParse(next);
  return parsed.success ? parsed.data : prior;
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
