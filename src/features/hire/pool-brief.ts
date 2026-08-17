import type { JobSpec } from "@/lib/validations/hire";
import {
  HIRE_SLOTS,
  isSlotFilled,
  skippedSlots,
  type HireSlot,
} from "@/lib/validations/hire";
import type { CandidateSource } from "@/features/hire/candidate-ref";

export type PoolGeo = "IN" | "US";

export type PoolBrief = {
  sources: CandidateSource[];
  geo: PoolGeo | null;
  minEvidenceDays: number | null;
  resultLimit: number | null;
  title: string | null;
  mustHaveStack: string[];
};

const EMPTY: PoolBrief = {
  sources: [],
  geo: null,
  minEvidenceDays: null,
  resultLimit: null,
  title: null,
  mustHaveStack: [],
};

/**
 * Pull a searchable brief out of free text. No model.
 *
 * Geography is a *track*, not GPS. This platform's challenge / hackathon
 * people are Indian students; the /program cohort is the US professional
 * track. We do not pretend anyone filled in a city.
 */
export function extractPoolBrief(raw: string): PoolBrief {
  const msg = raw.trim().toLowerCase();
  if (!msg) return EMPTY;

  const sources: CandidateSource[] = [];
  if (/\bclaude\b/.test(msg)) {
    sources.push("CLAUDE");
  }
  if (
    /\b(60[-\s]?day|sixty[-\s]?day|se track|ds track|ai track|submissions?)\b/.test(
      msg,
    ) &&
    !/\bclaude\b/.test(msg)
  ) {
    sources.push("CHALLENGE_60");
  }
  if (/\b(hackathon|hackathoners?|vibe code)\b/.test(msg)) {
    sources.push("HACKATHON");
  }
  if (
    /\b(cohort|program|b2b|working professional|professionals?)\b/.test(msg)
  ) {
    sources.push("PROGRAM");
  }

  let geo: PoolGeo | null = null;
  const wantsIndia = /\b(india|indian|bharat)\b/.test(msg);
  const wantsUs = /\b(usa|u\.s\.a|united states|\bus\b|america|american)\b/.test(
    msg,
  );
  if (wantsIndia && !wantsUs) geo = "IN";
  if (wantsUs && !wantsIndia) geo = "US";

  let minEvidenceDays: number | null = null;
  // "60-day challenge" is a track name, not a floor. Prefer "at least N",
  // then "N+ days", then a bare "N days" after stripping the track phrase.
  const prefixedDays = msg.match(
    /(?:at\s*least|atleast|minimum|min(?:\.|imum)?|over|more than|>=)\s*(\d{1,2})\s*days?/,
  );
  const plusDays = prefixedDays
    ? null
    : msg.match(/(\d{1,2})\s*\+\s*days?|(\d{1,2})\s*days?\s*\+/);
  const bareDays =
    prefixedDays || plusDays
      ? null
      : msg.replace(/\b60[-\s]?days?\b/g, " ").match(/(\d{1,2})\s*days?/);
  const dayN = prefixedDays
    ? Number(prefixedDays[1])
    : plusDays
      ? Number(plusDays[1] ?? plusDays[2])
      : bareDays
        ? Number(bareDays[1])
        : NaN;
  if (Number.isFinite(dayN) && dayN >= 1 && dayN <= 60) minEvidenceDays = dayN;

  let resultLimit: number | null = null;
  const capMatch = msg.match(
    /(?:only|just|top|first)\s*(\d{1,2})(?:\s*(?:candidates?|people|profiles?|students?))?/,
  );
  if (capMatch) {
    const n = Number(capMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 20) resultLimit = n;
  }

  const roleStack = extractRoleStack(msg);

  return { sources, geo, minEvidenceDays, resultLimit, ...roleStack };
}

const ROLE_HINTS: { re: RegExp; title: string }[] = [
  { re: /\bfull[-\s]?stack\b/, title: "Full-stack engineer" },
  { re: /\bback[-\s]?end\b/, title: "Backend engineer" },
  { re: /\bfront[-\s]?end\b/, title: "Frontend engineer" },
  { re: /\bdata\s*\/?\s*ml\b|\bdata engineer|\bml engineer\b/, title: "Data / ML engineer" },
  { re: /\bai engineer\b/, title: "AI engineer" },
];

const STACK_HINTS = [
  "python",
  "java",
  "javascript",
  "typescript",
  "react",
  "node",
  "nodejs",
  "sql",
  "golang",
  "go",
  "rust",
  "kotlin",
  "swift",
  "c++",
  "django",
  "flask",
  "spring",
  "fastapi",
];

function extractRoleStack(msg: string): {
  title: string | null;
  mustHaveStack: string[];
} {
  let title: string | null = null;
  for (const hint of ROLE_HINTS) {
    if (hint.re.test(msg)) {
      title = hint.title;
      break;
    }
  }
  const mustHaveStack: string[] = [];
  for (const token of STACK_HINTS) {
    const re =
      token === "go"
        ? /\bgo\b(?!lang)/
        : new RegExp(`\\b${token.replace(/\+/g, "\\+")}\\b`, "i");
    if (re.test(msg)) {
      mustHaveStack.push(token === "nodejs" ? "node" : token);
    }
  }
  return { title, mustHaveStack: dedupeStack(mustHaveStack) };
}

function dedupeStack(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function briefTouched(brief: PoolBrief): boolean {
  return (
    brief.sources.length > 0 ||
    brief.geo !== null ||
    brief.minEvidenceDays !== null ||
    brief.resultLimit !== null
  );
}

/**
 * India → student tracks. US → the professional cohort.
 * An explicit source always wins over the geo default.
 */
export function resolveSources(brief: PoolBrief): CandidateSource[] {
  if (brief.sources.length > 0) return [...new Set(brief.sources)];
  if (brief.geo === "IN") return ["CLAUDE", "CHALLENGE_60", "HACKATHON"];
  if (brief.geo === "US") return ["PROGRAM"];
  return [];
}

export function applyPoolBrief(spec: JobSpec, brief: PoolBrief): JobSpec {
  const hasRole = Boolean(brief.title) || brief.mustHaveStack.length > 0;
  if (!briefTouched(brief) && !hasRole) return spec;
  const prior = (spec.extra ?? {}) as Record<string, unknown>;
  const sources = resolveSources(brief);
  return {
    ...spec,
    ...(brief.title ? { title: brief.title } : {}),
    ...(brief.mustHaveStack.length
      ? { mustHaveStack: brief.mustHaveStack }
      : {}),
    extra: briefTouched(brief)
      ? {
          ...prior,
          ...(sources.length > 0 ? { poolSources: sources } : {}),
          ...(brief.geo ? { poolGeo: brief.geo } : {}),
          ...(brief.minEvidenceDays != null
            ? { minEvidenceDays: brief.minEvidenceDays }
            : {}),
          ...(brief.resultLimit != null
            ? { resultLimit: brief.resultLimit }
            : {}),
        }
      : spec.extra,
  };
}

export function isSearchableBrief(spec: JobSpec): boolean {
  const extra = (spec.extra ?? {}) as Record<string, unknown>;
  const sources = extra.poolSources;
  return (
    (Array.isArray(sources) && sources.length > 0) ||
    typeof extra.minEvidenceDays === "number" ||
    typeof extra.resultLimit === "number"
  );
}

/** Mark every unanswered intake slot skipped so Scout does not restart the form. */
export function skipUnfilledIntake(spec: JobSpec): JobSpec {
  const already = skippedSlots(spec);
  const add: HireSlot[] = [];
  for (const slot of HIRE_SLOTS) {
    if (!already.has(slot) && !isSlotFilled(spec, slot)) add.push(slot);
  }
  if (add.length === 0) return spec;
  const prior = (spec.extra ?? {}) as Record<string, unknown>;
  const skipped = [...already, ...add];
  return { ...spec, extra: { ...prior, skipped } };
}

export function briefAck(brief: PoolBrief): string {
  const bits: string[] = [];
  const sources = resolveSources(brief);
  if (sources.includes("CLAUDE")) bits.push("Claude challenge");
  if (sources.includes("CHALLENGE_60")) bits.push("60-day submissions");
  if (sources.includes("HACKATHON")) bits.push("hackathon");
  if (sources.includes("PROGRAM")) bits.push("the professional cohort");
  if (brief.geo === "IN") bits.push("India track");
  if (brief.geo === "US" && !sources.includes("CLAUDE")) bits.push("US cohort");
  if (brief.minEvidenceDays != null) {
    bits.push(`${brief.minEvidenceDays}+ verified days`);
  }
  if (brief.resultLimit != null) bits.push(`top ${brief.resultLimit}`);
  const roleBits: string[] = [];
  if (brief.title) roleBits.push(brief.title);
  if (brief.mustHaveStack.length) roleBits.push(brief.mustHaveStack.join(" / "));
  if (bits.length === 0 && roleBits.length === 0) {
    return "Searching the verified pool.";
  }
  if (bits.length === 0) return `Re-ranking on ${roleBits.join(", ")}.`;
  const head = `Searching ${bits.join(", ")}`;
  return roleBits.length ? `${head} · ${roleBits.join(", ")}.` : `${head}.`;
}

/** US + Claude is a mixed ask: Claude is the India-student track. */
export function mixedTrackNotice(brief: PoolBrief): string | null {
  const sources = resolveSources(brief);
  if (brief.geo === "US" && sources.includes("CLAUDE")) {
    return "Claude is an India-student track. I'll search it anyway — US here is the professional cohort.";
  }
  return null;
}

export function readPoolExtra(spec: JobSpec): {
  sources: CandidateSource[];
  minEvidenceDays: number | null;
  resultLimit: number | null;
} {
  const extra = (spec.extra ?? {}) as Record<string, unknown>;
  const raw = extra.poolSources;
  const sources = Array.isArray(raw)
    ? raw.filter(
        (s): s is CandidateSource =>
          s === "PROGRAM" ||
          s === "CLAUDE" ||
          s === "CHALLENGE_60" ||
          s === "HACKATHON",
      )
    : [];
  const min =
    typeof extra.minEvidenceDays === "number" ? extra.minEvidenceDays : null;
  const limit =
    typeof extra.resultLimit === "number" ? extra.resultLimit : null;
  return { sources, minEvidenceDays: min, resultLimit: limit };
}
