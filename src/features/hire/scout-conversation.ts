import "server-only";

import { askGroqJson, groqConfigured } from "@/lib/groq";
import { logger } from "@/lib/logger";
import {
  HIRE_SLOTS,
  inapplicableSlots,
  isSlotFilled,
  jobSpecSchema,
  scoutTurnSchema,
  skippedSlots,
  type HireSlot,
  type JobSpec,
  type ScoutTurn,
} from "@/lib/validations/hire";
import {
  SUPPORTED_SUMMARY,
  findUnsupported,
  unsupportedReply,
} from "@/features/hire/capabilities";

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


/**
 * Is this a role paid by the month rather than the year?
 *
 * An intern saying "20k" means twenty thousand a month. Read as an annual
 * figure it became ₹20,000 a year — a twelfth of the intent, and silent,
 * because nothing echoed the number back.
 */
function isMonthlyContext(spec: JobSpec): boolean {
  return spec.seniority === "INTERN" || spec.employmentType === "INTERNSHIP";
}

/**
 * Free-text money → annual rupees, plus the period it was written in.
 *
 * Annual rupees is the canonical unit everywhere: CandidateAvailability stores
 * expectations with no period of its own, so the budget has to be comparable to
 * them. `period` is kept only so the requirement can be read back in the units
 * the recruiter used.
 */
function parseMoney(
  msg: string,
  monthlyDefault: boolean,
): { min: number; max: number; period: "ANNUAL" | "MONTHLY" } | null {
  const lower = msg.toLowerCase();

  // "20k" / "1.5k" — the k was previously dropped, so 20k parsed as 20.
  const matches = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*(k|l|lac|lakh|lakhs|lpa)?/g)]
    .filter((m) => m[1] !== undefined && m[0].trim() !== "");
  if (matches.length === 0) return null;

  const saysAnnual = /lpa|per annum|annual|\/\s*(yr|year)|a year/.test(lower);
  const saysMonthly = /month|\/\s*mo\b|\bpm\b|stipend/.test(lower);
  const period: "ANNUAL" | "MONTHLY" = saysAnnual
    ? "ANNUAL"
    : saysMonthly || monthlyDefault
      ? "MONTHLY"
      : "ANNUAL";

  const values = matches.map((m) => {
    const n = Number(m[1]);
    const unit = m[2];
    if (unit === "k") return n * 1_000;
    if (unit && unit !== "k") return n * 100_000; // l / lac / lakh / lpa
    // A bare number in an annual context is already rupees unless it is small
    // enough that nobody means it literally ("12" in "12-18" means lakhs).
    if (period === "ANNUAL" && n < 100) return n * 100_000;
    return n;
  });

  const annual = values.map((v) => (period === "MONTHLY" ? v * 12 : v));
  const min = Math.min(...annual);
  const max = Math.max(...annual);
  if (!Number.isFinite(min) || min < 0) return null;
  return {
    min: Math.round(min),
    max: Math.round(Math.min(max, 100_000_000)),
    period,
  };
}

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
      const monthly = isMonthlyContext(next);
      // Chip values are always annual rupees; the period is read from the role,
      // not from the chip, so one set of values serves both.
      const chip = /salary:(\d+)-(\d+)/.exec(lower);
      if (chip) {
        return {
          ...next,
          salaryMin: Number(chip[1]),
          salaryMax: Number(chip[2]),
          salaryCurrency: "INR",
          salaryPeriod: monthly ? "MONTHLY" : "ANNUAL",
        };
      }
      const parsed = parseMoney(msg, monthly);
      if (!parsed) return next;
      return {
        ...next,
        salaryMin: parsed.min,
        salaryMax: parsed.max,
        salaryCurrency: "INR",
        salaryPeriod: parsed.period,
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


/**
 * Suggested must-haves, chosen from the role the recruiter already told us.
 *
 * The chips were a fixed list of engineering stacks, so a UI/UX designer was
 * asked to pick between "Python + SQL" and "Java + Spring". The title is in the
 * spec by then and was simply not read.
 *
 * This is a keyword map, not intelligence: it covers the roles this platform
 * actually trains for, falls back to the engineering set, and every slot still
 * accepts typed input and can be skipped outright.
 */
const STACK_SUGGESTIONS: { match: RegExp; chips: [string, string][] }[] = [
  {
    match: /\b(ui|ux|product design|designer|design|graphic|visual)\b/i,
    chips: [
      ["Figma + prototyping", "Figma, Prototyping"],
      ["Design systems", "Figma, Design systems"],
      ["User research", "User research, Usability testing"],
      ["Interaction / motion", "Figma, Interaction design"],
    ],
  },
  {
    match: /\b(data analyst|analytics|business intelligence|bi)\b/i,
    chips: [
      ["SQL + Excel", "SQL, Excel"],
      ["SQL + Python", "SQL, Python"],
      ["Power BI / Tableau", "Power BI, Tableau"],
      ["dbt + warehouse", "dbt, SQL"],
    ],
  },
  {
    match: /\b(ml|machine learning|ai engineer|data scientist|deep learning)\b/i,
    chips: [
      ["Python + PyTorch", "Python, PyTorch"],
      ["Python + scikit-learn", "Python, scikit-learn"],
      ["LLMs + RAG", "Python, LLMs, RAG"],
      ["MLOps", "Python, MLOps, Docker"],
    ],
  },
  {
    match: /\bfront[\s-]?end\b/i,
    chips: [
      ["TypeScript + React", "TypeScript, React"],
      ["Next.js", "TypeScript, React, Next.js"],
      ["Vue", "JavaScript, Vue"],
      ["CSS + accessibility", "CSS, Accessibility"],
    ],
  },
  {
    match: /\bback[\s-]?end\b/i,
    chips: [
      ["Python + SQL", "Python, SQL"],
      ["Node + Postgres", "Node, PostgreSQL"],
      ["Java + Spring", "Java, Spring"],
      ["Go", "Go, PostgreSQL"],
    ],
  },
  {
    match: /\b(mobile|android|ios|flutter|react native)\b/i,
    chips: [
      ["React Native", "React Native, TypeScript"],
      ["Flutter", "Flutter, Dart"],
      ["Android / Kotlin", "Kotlin, Android"],
      ["iOS / Swift", "Swift, iOS"],
    ],
  },
  {
    match: /\b(devops|sre|infra|platform|cloud)\b/i,
    chips: [
      ["AWS + Docker", "AWS, Docker"],
      ["Kubernetes", "Kubernetes, Docker"],
      ["CI/CD", "CI/CD, GitHub Actions"],
      ["Terraform", "Terraform, AWS"],
    ],
  },
  {
    match: /\b(qa|test|quality|sdet)\b/i,
    chips: [
      ["Manual + test cases", "Manual testing, Test design"],
      ["Selenium / Playwright", "Playwright, Selenium"],
      ["API testing", "Postman, API testing"],
      ["Automation + CI", "Automation, CI/CD"],
    ],
  },
  {
    match: /\b(product manager|product owner|\bpm\b|program manager)\b/i,
    chips: [
      ["Discovery + research", "User research, Discovery"],
      ["Analytics", "SQL, Analytics"],
      ["Roadmapping", "Roadmapping, Prioritisation"],
      ["Specs + delivery", "Specs, Agile delivery"],
    ],
  },
  {
    match: /\bcontent|writer|marketing|growth\b/i,
    chips: [
      ["Content + SEO", "Content writing, SEO"],
      ["Copywriting", "Copywriting"],
      ["Analytics", "Analytics, GA4"],
      ["Social + campaigns", "Social media, Campaigns"],
    ],
  },
];

function stackChipsFor(title: string | undefined): { label: string; value: string }[] {
  const hit = title
    ? STACK_SUGGESTIONS.find((s) => s.match.test(title))
    : undefined;
  const chips = hit?.chips ?? [
    ["Python + SQL", "Python, SQL"],
    ["TypeScript + React", "TypeScript, React"],
    ["Java + Spring", "Java, Spring"],
    ["Node + Postgres", "Node, PostgreSQL"],
  ];
  return [
    ...chips.map(([label, value]) => ({ label, value })),
    // Every other slot has a way past. This one did not, so a recruiter whose
    // answer was "none of those" had nowhere to go but repeat themselves.
    { label: "No hard requirement", value: "skip:stack" },
  ];
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
        // "Skills" rather than a stack, because not every role has one.
        question: `Which skills or tools are non-negotiable for the ${role}?`,
        options: stackChipsFor(spec.title),
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
    case "salary": {
      // An internship is paid monthly, and LPA bands are unusable for one —
      // which is exactly why a recruiter typed "20k" into a slot that read it
      // as a yearly figure. Chip values stay annual rupees; only the bands and
      // the labels change.
      if (isMonthlyContext(spec)) {
        return {
          question: "What's the monthly stipend for this internship?",
          options: [
            { label: "₹10–20k / month", value: "salary:120000-240000" },
            { label: "₹20–30k / month", value: "salary:240000-360000" },
            { label: "₹30–50k / month", value: "salary:360000-600000" },
            { label: "₹50k+ / month", value: "salary:600000-1200000" },
            { label: "Skip", value: "skip:salary" },
          ],
        };
      }
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
    }
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
      const bandValue = band ? `${band.min}-${band.max}` : null;
      const generic = [
        { label: "0–2 years", value: "0-2" },
        { label: "2–5 years", value: "2-5" },
        { label: "5–8 years", value: "5-8" },
        { label: "8+ years", value: "8-25" },
      ].filter((o) => o.value !== bandValue);
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
                  value: bandValue!,
                },
              ]
            : []),
          ...generic,
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
- "objection" — they are telling you the question itself is wrong for this role, or that the options do not fit. Say plainly that you got it wrong and what you are doing about it. Do NOT say "got it, noted" and move on; agreeing while changing nothing is what makes this feel rigid.
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
      enum: ["answer", "revise", "question", "objection", "unclear"],
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
  intent: "answer" | "revise" | "question" | "objection" | "unclear";
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
  locked: Set<HireSlot> = new Set(),
): JobSpec {
  const next: JobSpec = { ...base };
  const open = (slot: HireSlot) =>
    !locked.has(slot) && (revising || !isSlotFilled(base, slot));

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


/** Money as the recruiter wrote it, for reading back. */
export function formatSpecSalary(spec: JobSpec): string | null {
  const lo = spec.salaryMin;
  const hi = spec.salaryMax;
  if (lo == null && hi == null) return null;
  if (lo === 0 && hi === 0) return "not specified";

  const monthly = spec.salaryPeriod === "MONTHLY";
  const fmt = (annual: number) => {
    const v = monthly ? Math.round(annual / 12) : annual;
    return monthly
      ? `₹${v.toLocaleString("en-IN")}`
      : `₹${(v / 100_000) % 1 === 0 ? v / 100_000 : (v / 100_000).toFixed(1)} LPA`;
  };
  const suffix = monthly ? " a month" : "";
  const a = lo ?? hi!;
  const b = hi ?? lo!;
  return a === b ? `${fmt(a)}${suffix}` : `${fmt(a)}–${fmt(b)}${suffix}`;
}

/**
 * A deterministic read-back for slots where the answer had to be interpreted.
 *
 * The model was told not to restate the spec, which is right for most answers
 * and wrong for a figure it just inferred: "Got it — budget noted." hid a
 * twelve-fold misreading of "20k". This does not depend on the model, so the
 * confirmation survives the AI being wrong, slow, or absent.
 */
function slotConfirmation(spec: JobSpec, slot: HireSlot): string | null {
  if (slot !== "salary") return null;
  const money = formatSpecSalary(spec);
  return money && money !== "not specified" ? `Noted: ${money}.` : null;
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
    case "salary": {
      const money = formatSpecSalary(spec);
      return money && money !== "not specified"
        ? `Noted: ${money}.`
        : "No problem, skipping budget.";
    }
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
const POST_INTAKE_PROMPT =
  "I can search now, change any part of the brief, or answer questions about the pool.";

function turnFor(
  spec: JobSpec,
  ack: string,
  extra?: { action?: "search" | "reset" | null; notice?: string | null },
): ScoutTurn {
  const upcoming = nextSlot(spec);
  const summary = summarize(spec);
  const action = extra?.action ?? null;
  const notice = extra?.notice ?? null;

  if (!upcoming) {
    // Intake is done, and this is where the conversation used to die.
    //
    // The old branch returned the model's one-line acknowledgement as the
    // entire turn, and the system prompt forbids that sentence from asking
    // anything or mentioning any candidate — so every message after the last
    // question got "Noted — X it is." forever, including "ok then show me".
    // A standing prompt with real options means there is always something to
    // do and something to say.
    return {
      spec,
      // The standing prompt always survives. An acknowledgement on its own
      // leaves the recruiter with a dead end — "Got it, noted." was the entire
      // reply to "ok then show me" — so whatever was said, the next line says
      // what can be done about it.
      nextQuestion: [ack, POST_INTAKE_PROMPT]
        .filter((part) => Boolean(part && part.trim()))
        .join("\n\n"),
      options: [
        { label: "Search verified talent", value: "action:search" },
        { label: "Change the stack", value: "edit:mustHaveStack" },
        { label: "Change the budget", value: "edit:salary" },
        { label: "Start a new search", value: "action:reset" },
      ],
      allowFreeText: true,
      readyToSearch: true,
      summary,
      action,
      notice,
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
    action,
    notice,
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

/**
 * Answer a recruiter's question from figures the engine computed first.
 *
 * Deliberately not tool calling. The facts are a fixed, small, exactly
 * computable set, so they are fetched up front and handed to the model as
 * data — one round trip inside the Server Action budget, and no way for the
 * model to choose a filter or invent a row. It phrases; the engine counts.
 *
 * Falls back to a plain sentence built from the same numbers when the model is
 * unreachable, so a question is never met with silence.
 */
async function answerQuestion(
  question: string,
  spec: JobSpec,
  history: ChatMessage[],
): Promise<string> {
  const { poolSnapshot, previewMatch } = await import(
    "@/features/hire/pool-facts"
  );

  const [snap, preview] = await Promise.all([
    poolSnapshot(),
    // Only worth previewing once there is something to match on.
    (spec.mustHaveStack?.length ?? 0) > 0 || spec.title
      ? previewMatch(spec)
      : Promise.resolve(null),
  ]);

  const facts = {
    searchablePool: snap.eligibleCount,
    stillBelowEvidenceBar: snap.belowFloorCount,
    cohortDay: snap.cohortDay,
    ofDays: snap.ofDays,
    topDeclaredSkills: snap.topSkills,
    verifiedWorkingLanguages: snap.workingLanguages,
    roleFamilies: snap.roleFamilies,
    experienceMix: snap.experienceMix,
    evidenceCoverage: snap.coverageNote,
    matchesForCurrentBrief: preview
      ? {
          strong: preview.strong,
          partial: preview.partial,
          skillsNobodyHas: preview.topMissingMustHave,
        }
      : null,
  };

  const deterministic = snap.eligibleCount
    ? `There are ${snap.eligibleCount} searchable candidate(s) right now${
        snap.belowFloorCount
          ? `, plus ${snap.belowFloorCount} who opted in but are still below the evidence bar`
          : ""
      }. ${SUPPORTED_SUMMARY}`
    : `Nobody has cleared the bar to be searchable yet. ${SUPPORTED_SUMMARY}`;

  if (!groqConfigured()) return deterministic;

  const ai = await askGroqJson<{ answer: string }>({
    system: `You are Scout, ABTalks' hiring assistant, answering a recruiter's question.

You are given a FACTS object computed from the live database. Answer only from it.

Rules:
- Every number you write must appear in FACTS. Never estimate, round differently, or invent one.
- If FACTS does not contain the answer, say plainly that you cannot see that, and say what you can search on instead.
- Two or three sentences. No bullet points.
- Never name a candidate. You have never been given a name.
- Never promise a hire or predict performance.
- Match the recruiter's language — reply in Hinglish if they wrote Hinglish.`,
    messages: [
      ...history.slice(-4).map((m) => ({ role: m.role, content: m.content })),
      {
        role: "user" as const,
        content: [
          `FACTS: ${JSON.stringify(facts)}`,
          `Requirement so far: ${JSON.stringify(spec)}`,
          `Recruiter asked: ${question}`,
        ].join("\n"),
      },
    ],
    schemaName: "scout_answer",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["answer"],
      properties: { answer: { type: "string" } },
    },
    maxTokens: 600,
    temperature: 0.2,
  });

  if (!ai.ok || !ai.data.answer.trim()) return deterministic;

  // Same guard as the match rationales: a figure the platform did not produce
  // is the failure that matters, and it always surfaces as a digit.
  const allowed = new Set(JSON.stringify(facts).match(/\d+/g) ?? []);
  const invented = (ai.data.answer.match(/\d+/g) ?? []).filter(
    (n) => !allowed.has(n),
  );
  if (invented.length > 0) {
    logger.error("[hire] scout answer invented figures", {
      invented: invented.slice(0, 5).join(","),
    });
    return deterministic;
  }

  return ai.data.answer.trim().slice(0, 700);
}

/**
 * Unset one slot so the engine asks about it again.
 *
 * "Change the stack" was rendered as a chip from the day the post-intake turn
 * existed and was never wired to anything: `isChipAnswer` waved `edit:` through,
 * and the handler behind it was guarded by a pending slot that, after intake,
 * is always null. Tapping it did nothing at all.
 *
 * Also clears the slot from the skipped list — re-opening a question the
 * recruiter previously declined has to actually re-ask it.
 */
function clearSlot(spec: JobSpec, slot: HireSlot): JobSpec {
  const next: JobSpec = { ...spec };
  const skipped = [...skippedSlots(spec)].filter((s) => s !== slot);
  next.extra = { ...(spec.extra ?? {}), skipped };

  switch (slot) {
    case "title":
      next.title = undefined;
      break;
    case "seniority":
      next.seniority = null;
      break;
    case "mustHaveStack":
      next.mustHaveStack = [];
      break;
    case "evidencePriority":
      next.evidencePriority = [];
      break;
    case "salary":
      next.salaryMin = null;
      next.salaryMax = null;
      break;
    case "employmentType":
      next.employmentType = null;
      break;
    case "workMode":
      next.workMode = null;
      break;
    case "locationCity":
      next.locationCity = null;
      break;
    case "noticePeriodDays":
      next.noticePeriodDays = null;
      break;
    case "experience":
      next.minExperience = null;
      next.maxExperience = null;
      break;
  }
  return next;
}

/**
 * Instructions the engine acts on directly, with no model in the loop.
 *
 * Deliberately handled before any "is a question pending" check, because the
 * moment intake finishes there is no pending slot and every one of these used
 * to fall through to the model — which replied "Noted" and changed nothing.
 */
function engineAction(spec: JobSpec, msg: string): ScoutTurn | null {
  const m = msg.trim();

  if (/^action:search$/i.test(m)) {
    return turnFor(spec, "Searching the verified pool now.", {
      action: "search",
    });
  }

  if (/^action:reset$/i.test(m)) {
    return turnFor({}, "Starting fresh — tell me about the new role.", {
      action: "reset",
    });
  }

  const edit = /^edit:(.+)$/i.exec(m);
  if (edit?.[1]) {
    const raw = edit[1].trim();
    const slot =
      HIRE_SLOTS.find((s) => s.toLowerCase() === raw.toLowerCase()) ??
      // Older chips said "stack"; the slot is mustHaveStack.
      (raw.toLowerCase() === "stack" ? ("mustHaveStack" as HireSlot) : null);
    if (slot) {
      return turnFor(clearSlot(spec, slot), "");
    }
  }

  return null;
}

/**
 * "Show me", "dikhao", "run it" — a search asked for in words.
 *
 * The chip carried the literal value `action:search`, which the client
 * intercepted; nothing turned an English or Hinglish sentence into that
 * string, so typing it did nothing. Kept deterministic so it still works with
 * the model unreachable.
 */
/**
 * Unambiguous even mid-question. Nobody answers "which skills?" with these.
 */
const SEARCH_COMMAND_STRICT =
  /\b(search now|run the search|show me the (profiles?|candidates?|results?|matches)|show the (profiles?|candidates?|results?|matches)|profiles? (dikhao|dikha do)|candidates? dikhao)\b/i;

/**
 * Looser phrasing, only trusted once intake is finished.
 *
 * During intake nearly every message is an answer, and a verb list is a
 * minefield there: "Go" is a search verb and also the language the recruiter
 * just named as a must-have. The first version of this regex ate "Go, Postgres"
 * as a command and left the stack empty.
 */
const SEARCH_COMMAND_LOOSE =
  /^(ok(ay)?[,\s]*)?(then\s+)?(show|search|find|dikhao|dikha do|dekhao|chalao)\b|^(show|search|find|run)\s+(me|it|them|now|candidates?|profiles?)\b|\b(go ahead|let'?s go)\b/i;

const RESET_COMMAND =
  /\b(start over|start again|new search|another role|different role|naya|nayi|reset|fresh (search|brief))\b/i;

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

  // 0 — engine instructions, before anything else.
  //
  // These used to sit behind `if (asking && …)`, so once intake finished and
  // `asking` went null they were unreachable: "Change the stack" did nothing
  // and "Search verified talent" only worked because the client intercepted
  // its literal value before sending.
  const direct = engineAction(args.priorSpec, msg);
  if (direct) return checked(direct, unchanged);

  // 0b — a filter we do not have. Never written into the spec: accepting it
  // silently is how "Noted — US location it is" happened for a field no
  // candidate has ever filled.
  const blocked = findUnsupported(msg);
  if (blocked.length > 0) {
    return checked(
      turnFor(args.priorSpec, "", { notice: unsupportedReply(blocked) }),
      unchanged,
    );
  }

  // 0c — a search asked for in words rather than by tapping the chip. Loose
  // phrasing is only trusted once nothing is pending; see the regex comments.
  const wantsSearch = asking
    ? SEARCH_COMMAND_STRICT.test(msg)
    : SEARCH_COMMAND_STRICT.test(msg) || SEARCH_COMMAND_LOOSE.test(msg);
  if (wantsSearch) {
    if (asking) {
      return checked(
        turnFor(args.priorSpec, "", {
          notice: `I can search as soon as I have ${stillNeeded(args.priorSpec).join(", ")}.`,
        }),
        unchanged,
      );
    }
    return checked(
      turnFor(args.priorSpec, "Searching the verified pool now.", {
        action: "search",
      }),
      unchanged,
    );
  }

  if (RESET_COMMAND.test(msg)) {
    return checked(
      turnFor({}, "Starting fresh — tell me about the new role.", {
        action: "reset",
      }),
      unchanged,
    );
  }

  // 1 — chip tap
  if (asking && isChipAnswer(asking, args.priorSpec, msg)) {
    const spec = mergedBySlot(args.priorSpec, asking, msg);
    const ack = isSlotFilled(spec, asking) ? chipAck(asking, spec) : "";
    return checked(turnFor(spec, ack), unchanged);
  }

  // 1b — a question, answered from facts the engine computed.
  //
  // `intent: "question"` has been in the schema and the prompt since the start
  // and was never routed anywhere: it fell into the same acknowledge-only path
  // as everything else, and the prompt forbids that sentence from mentioning
  // any count. So Scout could not answer "how many Python people do you have"
  // even in principle.
  if (looksLikeQuestion(msg)) {
    const answer = await answerQuestion(msg, args.priorSpec, args.history);
    return checked(turnFor(args.priorSpec, "", { notice: answer }), unchanged);
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
      // Money never comes from the model. It is asked for lakhs per annum,
      // which is the wrong unit for an internship, and its attempts to convert
      // "20k" produced a twelvefold error. parseMoney is exact and testable, so
      // the engine decides the figure and the slot is locked against the model.
      const answeringSalary = asking === "salary";
      const seed = answeringSalary
        ? mergedBySlot(args.priorSpec, "salary", msg)
        : args.priorSpec;
      let spec = applyUnderstood(
        seed,
        ai.data.understood,
        ai.data.intent === "revise",
        answeringSalary ? new Set<HireSlot>(["salary"]) : undefined,
      );

      // A plain answer the model did not recognise is still an answer. Without
      // this, typing something the model does not read as a skill left the slot
      // empty and re-asked the same question — and it makes "say it in your own
      // words and I'll take it as-is" true rather than a promise we break.
      if (
        asking &&
        ai.data.intent === "answer" &&
        !isSlotFilled(spec, asking) &&
        !looksLikeQuestion(msg)
      ) {
        spec = mergedBySlot(spec, asking, msg);
      }
      // nextQuestion is capped at 500 chars and the canonical question must
      // always survive, so the acknowledgement is what gets trimmed.
      const modelAck = ai.data.ack.trim().slice(0, 200);
      // The read-back leads, so an interpreted figure is confirmed even when
      // the model's own sentence says nothing useful about it.
      const confirm = asking ? slotConfirmation(spec, asking) : null;
      let ack = confirm ? `${confirm} ${modelAck}`.trim() : modelAck;

      // An objection that leaves the slot empty means the same question is
      // about to be asked again. Saying the options changed — they do, because
      // the chips are drawn from the role — is the difference between a retry
      // and a loop.
      // Post-intake, a message that changed nothing gets no sentence from the
      // model at all.
      //
      // Four bare "yes" replies produced four different recaps that
      // contradicted each other — US, then flexible, then Delhi — because with
      // no new information and nothing pending, the model fills the space by
      // restating the brief, and restates it differently each time. The brief
      // is already on screen; the standing prompt is what is actually useful.
      if (!asking && JSON.stringify(spec) === JSON.stringify(args.priorSpec)) {
        return checked(turnFor(spec, ""), unchanged);
      }

      const stillStuck = asking != null && nextSlot(spec) === asking;
      if (ai.data.intent === "objection" && stillStuck) {
        // The model's own sentence is dropped here on purpose. Told it got the
        // question wrong it still answers "Got it — noted", which agrees and
        // changes nothing; that is the exact behaviour being complained about.
        // A recruiter pushing back needs a way forward, not agreement.
        ack = "Fair enough — say it in your own words and I'll take it as-is, or skip this one.";
      }
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
