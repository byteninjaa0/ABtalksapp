/**
 * The quick replies under Scout's message.
 *
 * These used to BE the conversation: ten fixed slots, asked in order, and a
 * recruiter who stated four facts in one sentence still got asked about them one
 * at a time. That march is gone — the agent asks what it actually needs. Chips
 * are now suggestions computed from whatever the brief is still missing, and
 * typing is always allowed.
 *
 * They are not decoration. A tap is answered by the protocol layer with no model
 * call at all, which on an 8000-tokens-per-minute plan is the difference between
 * a conversation that costs nothing and one that costs a hop. Keeping the useful
 * ones on screen is a capacity decision as much as a UX one.
 *
 * Pure: no model, no database, no `server-only`. Same values the old chips used,
 * so the protocol handler in `scout-conversation.ts` is unchanged.
 */
import type { JobSpec } from "@/lib/validations/hire";
import { isSlotFilled, type HireSlot } from "@/lib/validations/hire";
import { isMonthlyContext } from "@/features/hire/spec-fields";
import { readPoolExtra } from "@/features/hire/pool-brief";

export type ScoutChip = { label: string; value: string };

/**
 * Stack suggestions chosen from the role the recruiter already named.
 *
 * The chips were once a fixed list of engineering stacks, so a UI/UX designer
 * was asked to choose between "Python + SQL" and "Java + Spring". The title was
 * in the spec and simply not read. This is a keyword map, not intelligence: it
 * covers the roles this platform trains for and falls back to the engineering
 * set.
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
      ["MLOps", "MLOps"],
    ],
  },
  {
    match: /\bfront[\s-]?end\b/i,
    chips: [
      ["TypeScript + React", "TypeScript, React"],
      ["Next.js", "Next.js"],
      ["Vue", "Vue"],
      ["CSS + accessibility", "CSS, Accessibility"],
    ],
  },
  {
    match: /\bback[\s-]?end\b/i,
    chips: [
      ["Python + SQL", "Python, SQL"],
      ["Node + Postgres", "Node, PostgreSQL"],
      ["Java + Spring", "Java, Spring"],
      ["Go", "Go"],
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
];

const DEFAULT_STACK_CHIPS: [string, string][] = [
  ["Python + SQL", "Python, SQL"],
  ["TypeScript + React", "TypeScript, React"],
  ["Java + Spring", "Java, Spring"],
  ["Node + Postgres", "Node, PostgreSQL"],
];

function stackChips(spec: JobSpec): ScoutChip[] {
  const title = spec.title ?? "";
  const hit = title
    ? STACK_SUGGESTIONS.find((s) => s.match.test(title))
    : undefined;
  return [
    ...(hit?.chips ?? DEFAULT_STACK_CHIPS).map(([label, value]) => ({
      label,
      value,
    })),
    // Every suggestion needs a way past it. Without this, a recruiter whose
    // answer was "none of those" had nowhere to go but repeat themselves.
    { label: "No hard requirement", value: "skip:mustHaveStack" },
  ];
}

function seniorityChips(): ScoutChip[] {
  return [
    { label: "Intern", value: "INTERN" },
    { label: "Junior (0-2 yrs)", value: "JUNIOR" },
    { label: "Mid (2-5 yrs)", value: "MID" },
    { label: "Senior (5+ yrs)", value: "SENIOR" },
  ];
}

/**
 * Budget bands, in the units the role is actually paid in.
 *
 * Chip values are always annual rupees; the period is read from the role rather
 * than the chip, so one set of values serves a salary and a stipend.
 */
function salaryChips(spec: JobSpec): ScoutChip[] {
  return isMonthlyContext(spec)
    ? [
        { label: "₹10-20k / month", value: "salary:120000-240000" },
        { label: "₹20-40k / month", value: "salary:240000-480000" },
        { label: "₹40-60k / month", value: "salary:480000-720000" },
        { label: "Not decided", value: "skip:salary" },
      ]
    : [
        { label: "₹5-10 LPA", value: "salary:500000-1000000" },
        { label: "₹10-20 LPA", value: "salary:1000000-2000000" },
        { label: "₹20-35 LPA", value: "salary:2000000-3500000" },
        { label: "Not decided", value: "skip:salary" },
      ];
}

/** Chips for a brief that can already be searched. */
function readyChips(): ScoutChip[] {
  return [
    { label: "Search verified talent", value: "action:search" },
    { label: "Change the stack", value: "edit:mustHaveStack" },
    { label: "Change the budget", value: "edit:salary" },
    { label: "Start a new search", value: "action:reset" },
  ];
}

/**
 * Up to four suggestions for where the conversation can go next.
 *
 * `ready` is the engine's judgement that a search would mean something — it is
 * not the model's, and not a claim that the brief is finished. A recruiter can
 * always keep talking instead of tapping.
 */
export function suggestChips(spec: JobSpec, ready: boolean): ScoutChip[] {
  if (ready) return readyChips();

  // Order is by how much the answer narrows the search, which is also the order
  // a recruiter naturally volunteers things.
  const wanted: HireSlot[] = ["mustHaveStack", "seniority", "salary"];
  for (const slot of wanted) {
    if (isSlotFilled(spec, slot)) continue;
    if (slot === "mustHaveStack") return stackChips(spec);
    if (slot === "seniority") return seniorityChips();
    if (slot === "salary") return salaryChips(spec);
  }

  // Nothing obvious left to suggest, but a pool brief with no role can still be
  // searched, so offer that rather than nothing.
  const extra = readPoolExtra(spec);
  if (extra.sources.length > 0) return readyChips();
  return [];
}
