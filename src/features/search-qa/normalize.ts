/**
 * Normalization the QA oracles are allowed to assume, and nothing more.
 *
 * Every mapping here is one of three kinds, and the kind is part of the
 * contract rather than a comment:
 *
 *   SAME    — the same string after case / spacing / punctuation folding.
 *   RENAME  — an official rename or an unambiguous spelling of one place or
 *             thing ("Bangalore" → "Bengaluru", "golang" → "Go").
 *   TYPO    — a misspelling that cannot mean anything else ("banglore").
 *
 * Anything that could mean two things is AMBIGUOUS and is reported, never
 * merged: "Delhi NCR" is a region that contains Noida, but a recruiter who asks
 * for Noida has not necessarily agreed to Gurugram. Those cases surface as
 * `PRODUCT DECISION REQUIRED` rather than as search failures.
 *
 * PURE — imported by the offline suite, the audit and the admin page.
 */
import { canonicalSkillName } from "@/lib/skill-catalog";
import { WORK_MODES, canonicalDegree } from "@/lib/candidate-vocab";

export type NormKind = "SAME" | "RENAME" | "TYPO";

/** Lower-case, trimmed, inner whitespace collapsed, trailing punctuation dropped. */
export function normKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "");
}

/** Letters and digits only — "Tailwind CSS", "tailwindcss" and "TAILWIND-CSS" collide. */
export function squash(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ── work mode ───────────────────────────────────────────────────────────── */

export type WorkModeEnum = "REMOTE" | "HYBRID" | "ONSITE" | "FLEXIBLE";

const WORK_MODE_BY_SQUASH: Record<string, WorkModeEnum> = {
  remote: "REMOTE",
  wfh: "REMOTE",
  workfromhome: "REMOTE",
  hybrid: "HYBRID",
  onsite: "ONSITE",
  inoffice: "ONSITE",
  office: "ONSITE",
  flexible: "FLEXIBLE",
  any: "FLEXIBLE",
};

/**
 * What a stored `CandidatePreference.remotePreference` means as the recruiter
 * enum. The profile writes the picker LABELS ("Remote", "On-site"), the recruiter
 * spec carries ENUMS ("REMOTE", "ONSITE") — the two were never reconciled.
 */
export function normalizeWorkMode(raw: string | null | undefined): WorkModeEnum | null {
  if (!raw || !raw.trim()) return null;
  return WORK_MODE_BY_SQUASH[squash(raw)] ?? null;
}

/** Is this exactly a value the platform's own profile picker writes? */
export function isPickerWorkMode(raw: string | null | undefined): boolean {
  return raw != null && (WORK_MODES as readonly string[]).includes(raw);
}

/* ── cities ──────────────────────────────────────────────────────────────── */

type CityAlias = { canonical: string; kind: NormKind };

/** Keyed by `squash`. Only unambiguous spellings of ONE city belong here. */
const CITY_ALIASES: Record<string, CityAlias> = {
  bengaluru: { canonical: "Bengaluru", kind: "SAME" },
  bangalore: { canonical: "Bengaluru", kind: "RENAME" },
  banglore: { canonical: "Bengaluru", kind: "TYPO" },
  bangaluru: { canonical: "Bengaluru", kind: "TYPO" },
  bengluru: { canonical: "Bengaluru", kind: "TYPO" },
  blr: { canonical: "Bengaluru", kind: "RENAME" },
  mumbai: { canonical: "Mumbai", kind: "SAME" },
  bombay: { canonical: "Mumbai", kind: "RENAME" },
  delhi: { canonical: "Delhi", kind: "SAME" },
  newdelhi: { canonical: "Delhi", kind: "RENAME" },
  gurugram: { canonical: "Gurugram", kind: "SAME" },
  gurgaon: { canonical: "Gurugram", kind: "RENAME" },
  noida: { canonical: "Noida", kind: "SAME" },
  greaternoida: { canonical: "Greater Noida", kind: "SAME" },
  ghaziabad: { canonical: "Ghaziabad", kind: "SAME" },
  faridabad: { canonical: "Faridabad", kind: "SAME" },
  hyderabad: { canonical: "Hyderabad", kind: "SAME" },
  hydrabad: { canonical: "Hyderabad", kind: "TYPO" },
  hyd: { canonical: "Hyderabad", kind: "RENAME" },
  chennai: { canonical: "Chennai", kind: "SAME" },
  madras: { canonical: "Chennai", kind: "RENAME" },
  kolkata: { canonical: "Kolkata", kind: "SAME" },
  calcutta: { canonical: "Kolkata", kind: "RENAME" },
  pune: { canonical: "Pune", kind: "SAME" },
  poona: { canonical: "Pune", kind: "RENAME" },
  mysuru: { canonical: "Mysuru", kind: "SAME" },
  mysore: { canonical: "Mysuru", kind: "RENAME" },
  lucknow: { canonical: "Lucknow", kind: "SAME" },
  kanpur: { canonical: "Kanpur", kind: "SAME" },
  ahmedabad: { canonical: "Ahmedabad", kind: "SAME" },
  kochi: { canonical: "Kochi", kind: "SAME" },
  cochin: { canonical: "Kochi", kind: "RENAME" },
  thiruvananthapuram: { canonical: "Thiruvananthapuram", kind: "SAME" },
  trivandrum: { canonical: "Thiruvananthapuram", kind: "RENAME" },
  vizag: { canonical: "Visakhapatnam", kind: "RENAME" },
  visakhapatnam: { canonical: "Visakhapatnam", kind: "SAME" },
  jaipur: { canonical: "Jaipur", kind: "SAME" },
  indore: { canonical: "Indore", kind: "SAME" },
  chandigarh: { canonical: "Chandigarh", kind: "SAME" },
};

/** Regions whose members are NOT interchangeable without a product decision. */
const NCR_REGION = new Set([
  "delhincr",
  "ncr",
  "delhi",
  "newdelhi",
  "noida",
  "greaternoida",
  "gurugram",
  "gurgaon",
  "ghaziabad",
  "faridabad",
]);

/** Values stored in a city field that are not a city at all. */
const NON_CITY = new Set([
  "any",
  "anywhere",
  "remote",
  "remoteindia",
  "wfh",
  "workfromhome",
  "pan india",
  "panindia",
  "india",
  "flexible",
  "na",
  "none",
]);

export type CityNorm = {
  raw: string;
  key: string;
  canonical: string;
  kind: NormKind | "UNKNOWN";
  nonCity: boolean;
  region: "NCR" | null;
};

export function normalizeCity(raw: string): CityNorm {
  const sq = squash(raw);
  const alias = CITY_ALIASES[sq];
  const nonCity = NON_CITY.has(sq) || /^remote\b/i.test(raw.trim());
  return {
    raw,
    key: alias ? squash(alias.canonical) : sq,
    canonical: alias?.canonical ?? raw.trim(),
    kind: alias?.kind ?? "UNKNOWN",
    nonCity,
    region: NCR_REGION.has(sq) ? "NCR" : null,
  };
}

/** Whole-word containment — "delhi" inside "delhi ncr", never "una" inside "tiruvannamalai". */
export function containsWholeWords(haystack: string, needle: string): boolean {
  const h = normKey(haystack).replace(/[^a-z0-9]+/g, " ").trim();
  const n = normKey(needle).replace(/[^a-z0-9]+/g, " ").trim();
  if (!n || !h) return false;
  return ` ${h} `.includes(` ${n} `);
}

export type CityMatch = "MATCH" | "NO_MATCH" | "AMBIGUOUS";

/**
 * The oracle's city semantics: the same city after safe normalization, or one
 * name containing the other as whole words ("Delhi" / "Delhi NCR"). Two
 * different members of the NCR region are AMBIGUOUS, never a match or a miss.
 */
export function citiesMatch(candidateCity: string, recruiterCity: string): CityMatch {
  const a = normalizeCity(candidateCity);
  const b = normalizeCity(recruiterCity);
  if (a.key && a.key === b.key) return "MATCH";
  if (
    containsWholeWords(a.canonical, b.canonical) ||
    containsWholeWords(b.canonical, a.canonical)
  ) {
    return "MATCH";
  }
  if (a.region && b.region) return "AMBIGUOUS";
  if (a.nonCity || b.nonCity) return "AMBIGUOUS";
  return "NO_MATCH";
}

/** The recruiter-side sentinels that mean "no city", not a city named that. */
export function isNoCitySentinel(raw: string | null | undefined): boolean {
  if (raw == null) return true;
  const sq = squash(raw);
  return sq === "" || sq === "any" || sq === "anycity" || sq === "anywhere";
}

/* ── skills ──────────────────────────────────────────────────────────────── */

export type SkillTokenMatch = {
  /** Same text, or the token as a whole word/phrase inside the skill name. */
  literal: boolean;
  /** The same catalog skill once aliases are folded ("golang" ↔ "Go"). */
  normalized: boolean;
  /** Set when the only link is the SKILL inside the TOKEN ("React" for "React Native"). */
  ambiguous: string | null;
};

const MIN_WORD_TOKEN = 3;

function words(raw: string): string {
  return normKey(raw);
}

/**
 * Independent of `stackTokensMatch` on purpose — an oracle that calls the code
 * under test cannot find a bug in it. The semantics are the ones the scorer
 * DOCUMENTS: whole words, single letters only by equality, "react" inside
 * "react.js" and "react native".
 */
export function skillMatchesToken(skillName: string, token: string): SkillTokenMatch {
  const s = words(skillName);
  const t = words(token);
  if (!t) return { literal: true, normalized: true, ambiguous: null };
  // A compound claim ("AI/ML", "C/C++", "Git & GitHub") is several whole
  // tokens: a requirement equal to one part is a literal match, at any length.
  const parts = skillName.split(/\s*\/\s*|\s+(?:and|&)\s+/i).map(words).filter(Boolean);
  const literal =
    s === t ||
    (t.length >= MIN_WORD_TOKEN && containsWholeWordsLoose(s, t)) ||
    (parts.length > 1 && parts.includes(t));
  // Squash equality folds "React.js" / "reactjs" but must never fold symbols
  // that ARE the name: "C", "C++" and "C#" all squash to "c".
  const symbolic = /[+#]/.test(skillName) || /[+#]/.test(token);
  const sameCatalogSkill = (a: string, b: string) =>
    canonicalSkillName(a).toLowerCase() === canonicalSkillName(b).toLowerCase();
  const normalized =
    literal ||
    sameCatalogSkill(skillName, token) ||
    // A part of a compound is a skill in its own right, so the catalog's aliases
    // apply to it: "AI/ML" answers "Machine Learning" because "ml" is its alias.
    (parts.length > 1 && parts.some((p) => sameCatalogSkill(p, token))) ||
    (!symbolic && squash(skillName).length >= 3 && squash(skillName) === squash(token)) ||
    // "&" for "and" and plurals never change the skill ("Data structures and
    // algorithm" = "Data Structures & Algorithms").
    (!symbolic && skillClusterKey(skillName).length >= 3 && skillClusterKey(skillName) === skillClusterKey(token));
  const ambiguous =
    !literal &&
    !normalized &&
    s.length >= MIN_WORD_TOKEN &&
    containsWholeWordsLoose(t, s)
      ? `"${skillName}" appears inside the requirement "${token}", e.g. React for React Native`
      : null;
  return { literal, normalized, ambiguous };
}

/** Whole-word containment where `.`, `/`, `+` and `#` stay part of a word (C++, C#, Node.js). */
function containsWholeWordsLoose(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  let from = 0;
  while (from <= haystack.length) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) return false;
    const before = i === 0 ? "" : haystack[i - 1]!;
    const after = haystack[i + needle.length] ?? "";
    const boundary = (c: string) => c === "" || !/[a-z0-9]/.test(c);
    if (boundary(before) && boundary(after)) return true;
    from = i + 1;
  }
  return false;
}

/* ── degrees ─────────────────────────────────────────────────────────────── */

export function normalizeDegree(raw: string): { canonical: string; changed: boolean } {
  const canonical = canonicalDegree(raw);
  return { canonical, changed: canonical !== raw.trim() };
}

/* ── clustering ──────────────────────────────────────────────────────────── */

export type ValueCount = { raw: string; count: number };

export type NormalizationCluster = {
  key: string;
  canonical: string;
  variants: ValueCount[];
  total: number;
  safety: "SAFE" | "SAFE_TYPO" | "AMBIGUOUS";
};

/**
 * Group raw values that fold to one key and report groups with more than one
 * spelling. `keyOf` decides the fold; `describe` decides the canonical label and
 * whether the fold is safe to act on.
 */
export function clusterValues(
  values: ValueCount[],
  keyOf: (raw: string) => string,
  describe: (variants: ValueCount[]) => { canonical: string; safety: NormalizationCluster["safety"] },
): NormalizationCluster[] {
  const groups = new Map<string, ValueCount[]>();
  for (const v of values) {
    const raw = v.raw ?? "";
    if (!raw.trim()) continue;
    const key = keyOf(raw);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    const same = list.find((x) => x.raw === raw);
    if (same) same.count += v.count;
    else list.push({ raw, count: v.count });
    groups.set(key, list);
  }
  const out: NormalizationCluster[] = [];
  for (const [key, variants] of groups) {
    if (variants.length < 2) continue;
    variants.sort((a, b) => b.count - a.count);
    const { canonical, safety } = describe(variants);
    out.push({
      key,
      canonical,
      variants,
      total: variants.reduce((n, v) => n + v.count, 0),
      safety,
    });
  }
  return out.sort((a, b) => b.total - a.total);
}

export function describeCityCluster(variants: ValueCount[]): {
  canonical: string;
  safety: NormalizationCluster["safety"];
} {
  const norms = variants.map((v) => normalizeCity(v.raw));
  const canonical = norms[0]?.canonical ?? variants[0]!.raw;
  if (norms.some((n) => n.nonCity)) return { canonical, safety: "AMBIGUOUS" };
  if (norms.some((n) => n.kind === "TYPO")) return { canonical, safety: "SAFE_TYPO" };
  return { canonical, safety: "SAFE" };
}

export function describeSkillCluster(variants: ValueCount[]): {
  canonical: string;
  safety: NormalizationCluster["safety"];
} {
  const names = new Set(variants.map((v) => canonicalSkillName(v.raw)));
  const canonical = canonicalSkillName(variants[0]!.raw);
  // Two catalog names folding to one squash key ("C/C++" and "C++" do not,
  // "Git & GitHub" and "Git and GitHub" do) are a merge the catalog has not
  // agreed to — report it, do not assume it.
  return { canonical, safety: names.size > 1 ? "AMBIGUOUS" : "SAFE" };
}

/** "Git & GitHub" ≡ "Git and GitHub"; "Data structures & algorithm" ≡ "…algorithms". */
export function skillClusterKey(raw: string): string {
  const folded = canonicalSkillName(raw)
    .toLowerCase()
    // Symbols are the name for C++ / C# / F#: spell them before squashing.
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/\s+&\s+|\s+and\s+/g, " and ")
    // Plural folding only on real words, so "CSS" never collides with "CS",
    // and never after s / j / u / i ("Express", "NestJS", "Status", "Analysis").
    .replace(/\b([a-z]{3,}[^\W\dsjui])s\b/g, "$1");
  return squash(folded);
}
