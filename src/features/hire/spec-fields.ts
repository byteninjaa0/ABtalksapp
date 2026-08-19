/**
 * Pure parsers for the fields of a job spec.
 *
 * Lifted out of `scout-conversation.ts` so both it and `scout-tools.ts` can use
 * them without a cycle (`scout-conversation` → `scout-agent` → `scout-tools`
 * would otherwise close a loop back to this code).
 *
 * These are the deterministic half of the agent. The model never computes a
 * figure or decides whether a phrase is a job title — it quotes the recruiter and
 * these functions rule. Keeping them pure is what makes them testable without a
 * model, a database or a graph.
 */
import type { JobSpec } from "@/lib/validations/hire";

/** The evidence dimensions the ranker actually weights. */
export const EVIDENCE_KEYS: ReadonlySet<string> = new Set([
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

/**
 * Is this a role paid by the month rather than the year?
 *
 * An intern saying "20k" means twenty thousand a month. Read as an annual figure
 * it became ₹20,000 a year — a twelfth of the intent, and silent, because
 * nothing echoed the number back.
 */
export function isMonthlyContext(spec: JobSpec): boolean {
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
/**
 * The clause that is actually about money.
 *
 * "3 years experience, 12-18 lakhs" used to parse as ₹3L–₹18L: the 3 from "3
 * years" became the floor of the budget, silently, and the search then filtered
 * on a band nobody asked for. So when the text names a money unit, only the
 * clause carrying it is read, and clauses that are plainly about duration are
 * dropped.
 */
function moneyClause(lower: string): string {
  const UNIT = /\b\d+(?:\.\d+)?\s*(k|l|lac|lakh|lakhs|lpa|cr|crore|crores)\b|₹|rs\.?\b/;
  if (!UNIT.test(lower)) return lower;
  const clauses = lower.split(/\s*(?:,|;|\band\b|\bwith\b)\s*/);
  const withUnit = clauses.filter((c) => UNIT.test(c));
  return withUnit.length ? withUnit.join(" ") : lower;
}

export function parseMoney(
  msg: string,
  monthlyDefault: boolean,
): { min: number; max: number; period: "ANNUAL" | "MONTHLY" } | null {
  const lower = moneyClause(msg.toLowerCase());

  // Duration is not money. "3 years" in a budget sentence is the single most
  // common way a stray number reached the salary field.
  const cleaned = lower.replace(
    /\b\d+(?:\.\d+)?\s*\+?\s*(years?|yrs?|yr|months?|mos?|days?)\b/g,
    " ",
  );

  // "20k" / "1.5k" — the k was previously dropped, so 20k parsed as 20.
  // "cr" / "crore" — absent entirely, so "1.2 crore" parsed as ₹1,20,000: a
  // hundredfold error on the largest budgets anyone types.
  const matches = [
    ...cleaned.matchAll(
      /(\d+(?:\.\d+)?)\s*(k|lpa|lakhs|lakh|lac|crores|crore|cr|l)?/g,
    ),
  ].filter((m) => m[1] !== undefined && m[0].trim() !== "");
  if (matches.length === 0) return null;

  const full = msg.toLowerCase();
  const saysAnnual = /lpa|per annum|annual|\/\s*(yr|year)|a year|crore|\bcr\b/.test(full);
  const saysMonthly = /month|\/\s*mo\b|\bpm\b|stipend/.test(full);
  const period: "ANNUAL" | "MONTHLY" = saysAnnual
    ? "ANNUAL"
    : saysMonthly || monthlyDefault
      ? "MONTHLY"
      : "ANNUAL";

  // A range carries its unit on the last figure — "12-18 lakhs" marks only the
  // 18 — so an unmarked number inherits the unit the phrase does name.
  const namedUnit = matches.map((m) => m[2]).filter(Boolean).at(-1);

  const scale = (unit: string | undefined, n: number): number => {
    if (unit === "k") return n * 1_000;
    if (unit === "cr" || unit === "crore" || unit === "crores") {
      return n * 10_000_000;
    }
    if (unit) return n * 100_000; // l / lac / lakh / lakhs / lpa
    return n;
  };

  const values = matches.map((m) => {
    const n = Number(m[1]);
    const unit = m[2];
    if (unit) return scale(unit, n);
    if (namedUnit) return scale(namedUnit, n);
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

/**
 * A job title, or nothing.
 *
 * Strips the way people actually phrase a request — "I want a…", "we're looking
 * for…" — and then refuses anything still shaped like a sentence rather than a
 * role. Taking free text verbatim is how a 90-character requirement ended up as
 * the job title and followed the recruiter through every later question.
 */
export function asRoleTitle(raw: string): string | null {
  let s = raw.trim().replace(/\s+/g, " ");

  s = s
    .replace(/^(hi|hey|hello)[,!.\s]+/i, "")
    .replace(
      /^(i\s*(want|need|am looking for|'m looking for)|we\s*(want|need|are looking for|'re looking for)|looking for|show me|give me|find me|get me|hire|hiring for|need)\b\s*/i,
      "",
    )
    .replace(/^(a|an|the|some|few|couple of)\b\s*/i, "")
    .replace(/[.?!]+$/, "")
    .trim();

  if (!s) return null;
  // Sentence-shaped, not role-shaped.
  if (s.length > 60) return null;
  if (s.split(" ").length > 7) return null;
  if (
    /\b(who|whose|which|that has|that have|with at least|atleast|at least)\b/i.test(
      s,
    )
  ) {
    return null;
  }
  return s.slice(0, 200);
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
