import "server-only";

import { activeAvailability } from "@/features/hire/availability-access";
import {
  ROLE_FAMILY_LABEL,
  roleFamilyFor,
  type RoleFamily,
} from "@/features/hire/role-family";
import {
  canonicalizeDegree,
  canonicalizeLocation,
  canonicalizeRole,
  canonicalizeSeniority,
  canonicalizeSkill,
  canonicalizeWorkMode,
  type SkillAliasRow,
} from "@/features/hire/normalize";
import type { ScoreableMember } from "@/features/hire/types";
import type {
  Criterion,
  CriterionKind,
  CriterionValue,
  CriterionVerdict,
  HireEvidence,
} from "@/lib/validations/hire";

/**
 * Stage 5 — every criterion × every candidate → verdict + fit + evidence.
 *
 * Pure. Missing data is UNCLEAR, never NOT_MET. Verdict ≠ filtering: a junior
 * vs a VP is NOT_MET; whether that removes them is `absolute`'s job in rank.ts.
 */

export type Evidence = HireEvidence;
export type { CriterionVerdict };

export const EMPTY_VALUE: CriterionValue = {
  token: null,
  title: null,
  min: null,
  max: null,
  level: null,
  workMode: null,
  openToWork: null,
  city: null,
  currency: null,
  minMissions: null,
  minCommitDays: null,
  minCleanPassPct: null,
  text: null,
};

export function clamp01(n: number): number {
  if (!Number.isFinite(n) || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function ev(
  field: string,
  value: string,
  source: HireEvidence["source"],
  sourceLabel: string,
): HireEvidence {
  return { field, value, source, sourceLabel };
}

function unclear(
  criterionId: string,
  evidence: HireEvidence[],
  confidence = 0,
): CriterionVerdict {
  return {
    criterionId,
    verdict: "UNCLEAR",
    fit: null,
    confidence,
    evidence,
  };
}

function met(
  criterionId: string,
  fit: number,
  confidence: number,
  evidence: HireEvidence[],
): CriterionVerdict {
  return { criterionId, verdict: "MET", fit: clamp01(fit), confidence, evidence };
}

function notMet(
  criterionId: string,
  fit: number,
  confidence: number,
  evidence: HireEvidence[],
): CriterionVerdict {
  return {
    criterionId,
    verdict: "NOT_MET",
    fit: clamp01(fit),
    confidence,
    evidence,
  };
}

const UNSPECIFIC_ROLE = new Set<RoleFamily>(["OTHER", "STUDENT"]);

function evaluateSkill(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  const need = canonicalizeSkill(c.value.token ?? c.label, table);
  const declared = member.skills ?? [];
  const working = member.dossier?.evidence.workingLanguages.value ?? [];
  if (declared.length === 0 && working.length === 0) {
    return unclear(c.id, [
      ev("skills", "not recorded", "candidate_profile", "Profile"),
    ]);
  }
  const hitWorking = working.some((s) => canonicalizeSkill(s, table) === need);
  const hitDeclared = declared.some((s) => canonicalizeSkill(s, table) === need);
  if (hitWorking || hitDeclared) {
    return met(
      c.id,
      1,
      hitWorking ? 0.85 : 0.5,
      [
        ev(
          hitWorking ? "workingLanguages" : "skills",
          c.value.token ?? c.label,
          hitWorking ? "challenge_project" : "candidate_profile",
          hitWorking ? "Verified mission language" : "Declared skills",
        ),
      ],
    );
  }
  return notMet(c.id, 0, 0.6, [
    ev(
      "skills",
      declared.slice(0, 8).join(", ") || "none matching",
      "candidate_profile",
      "Declared skills",
    ),
  ]);
}

function evaluateRole(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  const raw = (member.dossier?.rawRoleLabel.value ?? member.jobRole ?? "").trim();
  const family = member.dossier?.roleFamily.value ?? roleFamilyFor(raw);
  if (!raw || raw === "Not stated" || UNSPECIFIC_ROLE.has(family)) {
    return unclear(c.id, [
      ev("jobRole", raw || "not stated", "candidate_profile", "Profile"),
    ]);
  }
  const need = canonicalizeRole(c.value.title ?? c.label, table);
  const have = canonicalizeRole(raw, table);
  const needFamily = roleFamilyFor(c.value.title ?? c.label);
  if (have === need || (needFamily !== "OTHER" && family === needFamily)) {
    return met(c.id, 1, 0.6, [
      ev("jobRole", raw, "candidate_profile", "Declared role"),
    ]);
  }
  return notMet(c.id, 0, 0.7, [
    ev(
      "jobRole",
      `${raw} (${ROLE_FAMILY_LABEL[family]})`,
      "candidate_profile",
      "Declared role",
    ),
  ]);
}

function yearsKnown(member: ScoreableMember): boolean {
  if (member.yearsExperienceKnown === false) return false;
  if (member.yearsExperienceKnown === true) return true;
  // Absent means "assume stated" so a hand-built member in a test still
  // behaves the way it always did.
  return true;
}

function evaluateExperience(c: Criterion, member: ScoreableMember): CriterionVerdict {
  if (!yearsKnown(member)) {
    return unclear(c.id, [
      ev("yearsExperience", "not stated", "candidate_profile", "Profile"),
    ]);
  }
  const years = member.yearsExperience;
  const min = c.value.min;
  const max = c.value.max;
  if (min == null && max == null) {
    return met(c.id, 1, 0.5, [
      ev("yearsExperience", String(years), "candidate_profile", "Declared years"),
    ]);
  }
  const evidence = [
    ev("yearsExperience", String(years), "candidate_profile", "Declared years"),
  ];
  if (min != null && years < min) {
    return notMet(c.id, min > 0 ? years / min : 0, 0.8, evidence);
  }
  if (max != null && years > max) {
    const over = (years - max) / Math.max(max, 3);
    return notMet(c.id, clamp01(1 - over), 0.8, evidence);
  }
  return met(c.id, 1, 0.8, evidence);
}

/** Ordered ranks so a junior never equals a VP. */
const SENIORITY_RANK: Record<string, number> = {
  "seniority.intern": 0,
  "seniority.junior": 1,
  "seniority.mid": 2,
  "seniority.senior": 3,
  "seniority.lead": 4,
  "seniority.manager": 5,
  "seniority.director": 6,
  "seniority.vp": 7,
};

function requestedSeniority(c: Criterion, table: SkillAliasRow[]): number {
  const raw = c.value.level ?? c.label;
  const slug = canonicalizeSeniority(raw, table);
  if (SENIORITY_RANK[slug] != null) return SENIORITY_RANK[slug]!;
  const lower = raw.toLowerCase();
  if (/\b(svp|evp|avp|vp|vice president)\b/.test(lower)) return 7;
  if (/\bdirector\b|\bhead\b/.test(lower)) return 6;
  if (/\bmanager\b/.test(lower)) return 5;
  if (/\blead\b|\bprincipal\b|\bstaff\b/.test(lower)) return 4;
  if (/\bsenior\b|\bsr\.?\b/.test(lower)) return 3;
  if (/\bmid\b/.test(lower)) return 2;
  if (/\bjunior\b|\bjr\.?\b/.test(lower)) return 1;
  if (/\bintern\b/.test(lower)) return 0;
  return 3;
}

/**
 * Infer a rank from years and title. Null only when we have nothing to go on.
 *
 * A junior with 2 years against a VP requirement is NOT_MET, not UNCLEAR —
 * the years are a known contradiction. A blank profile stays UNCLEAR.
 */
export function inferSeniorityRank(member: ScoreableMember): number | null {
  const title = (member.jobRole ?? "").toLowerCase();
  if (/\b(svp|evp|avp|vp|vice president)\b/.test(title)) return 7;
  if (/\bdirector\b/.test(title)) return 6;
  if (/\bmanager\b/.test(title)) return 5;
  if (/\blead\b|\bprincipal\b/.test(title)) return 4;
  if (/\bsenior\b|\bsr\.?\b/.test(title)) return 3;

  if (yearsKnown(member) && member.yearsExperience > 0) {
    const y = member.yearsExperience;
    if (y < 1) return 0;
    if (y < 3) return 1;
    if (y < 6) return 2;
    if (y < 10) return 3;
    if (y < 15) return 5;
    return 6;
  }

  if (/\bintern\b|\bstudent\b|\bfresher\b|\bjunior\b/.test(title)) return 1;
  return null;
}

function evaluateSeniority(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  const have = inferSeniorityRank(member);
  if (have == null) {
    return unclear(c.id, [
      ev("seniority", "not stated", "candidate_profile", "Profile"),
    ]);
  }
  const need = requestedSeniority(c, table);
  const evidence = [
    ev(
      "yearsExperience",
      yearsKnown(member) ? String(member.yearsExperience) : member.jobRole || "inferred",
      "candidate_profile",
      "Inferred seniority",
    ),
  ];
  if (have >= need) return met(c.id, 1, 0.7, evidence);
  const fit = need > 0 ? have / need : 0;
  return notMet(c.id, fit, 0.75, evidence);
}

function evaluateEducation(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  const level = member.dossier?.education.value.level?.trim() ?? null;
  if (!level) {
    return unclear(c.id, [
      ev("education.level", "not recorded", "candidate_profile", "Profile"),
    ]);
  }
  const want = c.value.level;
  if (!want) {
    return met(c.id, 1, 0.6, [
      ev("education.level", level, "candidate_profile", "Declared education"),
    ]);
  }
  const have = canonicalizeDegree(level, table);
  const need = canonicalizeDegree(want, table);
  if (have === need) {
    return met(c.id, 1, 0.6, [
      ev("education.level", level, "candidate_profile", "Declared education"),
    ]);
  }
  return notMet(c.id, 0, 0.6, [
    ev("education.level", level, "candidate_profile", "Declared education"),
  ]);
}

function evaluateAvailability(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  // An explicit "only people open to work" is answered from the raw row: a
  // candidate who said no is a genuine contradiction, not an unknown.
  if (c.value.openToWork === true && member.availability?.openToWork === false) {
    return notMet(c.id, 0, 0.8, [
      ev("openToWork", "false", "candidate_profile", "Availability"),
    ]);
  }
  // Everything below is logistics the candidate withdraws by turning
  // open-to-work off. The privacy note promises that takes effect immediately,
  // so a withdrawn row behaves exactly like a row that never existed.
  const avail = activeAvailability(member.availability);
  if (!avail) {
    return unclear(c.id, [
      ev(
        "availability",
        "no active availability shared",
        "candidate_profile",
        "Profile",
      ),
    ]);
  }
  const wantMode = c.value.workMode;
  if (wantMode && canonicalizeWorkMode(wantMode, table).split(".").pop() !== "flexible") {
    const haveRaw = avail.preferredWorkMode ?? "";
    if (!haveRaw) {
      return unclear(c.id, [
        ev("preferredWorkMode", "not stated", "candidate_profile", "Availability"),
      ]);
    }
    const have = canonicalizeWorkMode(haveRaw, table);
    const need = canonicalizeWorkMode(wantMode, table);
    if (have.split(".").pop() !== "flexible" && have !== need) {
      return notMet(c.id, 0, 0.8, [
        ev("preferredWorkMode", haveRaw, "candidate_profile", "Availability"),
      ]);
    }
  }
  return met(c.id, 1, 0.7, [
    ev(
      "preferredWorkMode",
      avail.preferredWorkMode ?? "shared",
      "candidate_profile",
      "Availability",
    ),
  ]);
}

function evaluateCompensation(c: Criterion, member: ScoreableMember): CriterionVerdict {
  const avail = activeAvailability(member.availability);
  if (!avail || (avail.expectedSalaryMin == null && avail.expectedSalaryMax == null)) {
    return unclear(c.id, [
      ev("expectedSalary", "not shared", "candidate_profile", "Availability"),
    ]);
  }
  const cap = c.value.max;
  const floor = avail.expectedSalaryMin;
  if (cap != null && floor != null && floor > cap) {
    return notMet(c.id, 0, 0.8, [
      ev("expectedSalaryMin", String(floor), "candidate_profile", "Availability"),
    ]);
  }
  return met(c.id, 1, 0.6, [
    ev(
      "expectedSalary",
      String(floor ?? avail.expectedSalaryMax),
      "candidate_profile",
      "Availability",
    ),
  ]);
}

/**
 * Location, and what it can honestly mean here.
 *
 * The only location data on the platform is opted-in *willingness*:
 * `preferredCities` ("I will work in these places") and `openToRelocate`
 * ("I will move"). A candidate's current residence lives on their private
 * profile and is deliberately never read on this path — see the
 * `current_residence` entry in capabilities.ts, which tells the recruiter so
 * rather than approximating it.
 *
 * So "hiring onsite in Pune" is answerable and "candidates currently based in
 * Pune" is not, and the two must not silently become the same query.
 *
 * Three earlier mistakes, all fixed here:
 *   - `openToRelocate` was tested FIRST and returned MET, so it outranked a
 *     candidate who had actually named the city, and it was reached without
 *     ever consulting `openToWork`.
 *   - `openToWork` was not consulted at all, so a withdrawn row still produced
 *     a location match.
 *   - a named-city match and a will-relocate match carried identical fit and
 *     confidence, so "willing to move somewhere" ranked level with "wants to be
 *     here".
 */
function evaluateLocation(
  c: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[],
): CriterionVerdict {
  const avail = activeAvailability(member.availability);
  if (!avail) {
    // Covers both "never opted in" and "opted out". Neither is a match, and
    // neither is a contradiction we can prove.
    return unclear(c.id, [
      ev(
        "location",
        "no active availability shared",
        "candidate_profile",
        "Profile",
      ),
    ]);
  }

  const cities = avail.preferredCities.map((x) => x.trim()).filter(Boolean);
  const need = canonicalizeLocation(c.value.city ?? c.label, table);
  const named = cities.some((city) => canonicalizeLocation(city, table) === need);

  // Strongest signal: they named this city themselves.
  if (named) {
    return met(c.id, 1, 0.75, [
      ev(
        "preferredCities",
        cities.join(", "),
        "candidate_profile",
        "Willing to work in",
      ),
    ]);
  }

  // Real, but weaker and honestly labelled: they will move, they just have not
  // said this city. Lower fit and lower confidence so a named match outranks it.
  if (avail.openToRelocate) {
    return met(c.id, 0.8, 0.55, [
      ev("openToRelocate", "true", "candidate_profile", "Open to relocating"),
      ...(cities.length
        ? [
            ev(
              "preferredCities",
              cities.join(", "),
              "candidate_profile",
              "Willing to work in",
            ),
          ]
        : []),
    ]);
  }

  // Opted in, but told us nothing about where. Unknown, not a refusal.
  if (cities.length === 0) {
    return unclear(c.id, [
      ev(
        "preferredCities",
        "not stated",
        "candidate_profile",
        "Availability",
      ),
    ]);
  }

  // Named other cities and will not relocate. This is a genuine contradiction.
  return notMet(c.id, 0, 0.75, [
    ev(
      "preferredCities",
      cities.join(", "),
      "candidate_profile",
      "Willing to work in",
    ),
    ev("openToRelocate", "false", "candidate_profile", "Open to relocating"),
  ]);
}

function evaluateEvidence(c: Criterion, member: ScoreableMember): CriterionVerdict {
  const bits: HireEvidence[] = [];
  let fit = 1;
  let metAll = true;
  if (c.value.minMissions != null) {
    const passed = member.missionsPassed;
    const f = c.value.minMissions > 0 ? passed / c.value.minMissions : 1;
    bits.push(
      ev("missionsPassed", String(passed), "program_mission", "Verified missions"),
    );
    if (f < 1) metAll = false;
    fit = Math.min(fit, clamp01(f));
  }
  if (c.value.minCommitDays != null) {
    const days = member.commitDayCount;
    const f = c.value.minCommitDays > 0 ? days / c.value.minCommitDays : 1;
    bits.push(
      ev("commitDays", String(days), "challenge_project", "Verified commit days"),
    );
    if (f < 1) metAll = false;
    fit = Math.min(fit, clamp01(f));
  }
  if (c.value.minCleanPassPct != null) {
    const pct =
      member.missionsPassed > 0
        ? (member.cleanPassCount / member.missionsPassed) * 100
        : 0;
    const f = pct / c.value.minCleanPassPct;
    bits.push(
      ev("cleanPassPct", `${Math.round(pct)}%`, "program_mission", "First-attempt passes"),
    );
    if (f < 1) metAll = false;
    fit = Math.min(fit, clamp01(f));
  }
  if (bits.length === 0) {
    bits.push(
      ev(
        "missionsPassed",
        String(member.missionsPassed),
        "program_mission",
        "Verified missions",
      ),
    );
  }
  return metAll ? met(c.id, fit, 0.9, bits) : notMet(c.id, fit, 0.9, bits);
}

function evaluateOther(c: Criterion): CriterionVerdict {
  return unclear(
    c.id,
    [
      ev(
        "other",
        c.value.text ?? c.label,
        "candidate_profile",
        "Not something we verify",
      ),
    ],
    0,
  );
}

export function evaluateCriterion(
  criterion: Criterion,
  member: ScoreableMember,
  table: SkillAliasRow[] = [],
): CriterionVerdict {
  switch (criterion.kind) {
    case "skill":
      return evaluateSkill(criterion, member, table);
    case "role":
      return evaluateRole(criterion, member, table);
    case "experience":
      return evaluateExperience(criterion, member);
    case "seniority":
      return evaluateSeniority(criterion, member, table);
    case "education":
      return evaluateEducation(criterion, member, table);
    case "availability":
      return evaluateAvailability(criterion, member, table);
    case "compensation":
      return evaluateCompensation(criterion, member);
    case "location":
      return evaluateLocation(criterion, member, table);
    case "evidence":
      return evaluateEvidence(criterion, member);
    case "other":
      return evaluateOther(criterion);
  }
}

export function evaluateAll(
  criteria: Criterion[],
  member: ScoreableMember,
  table: SkillAliasRow[] = [],
): CriterionVerdict[] {
  return criteria.map((c) => evaluateCriterion(c, member, table));
}

/**
 * Share of the pool that actually records a field. A criterion may only be
 * level 2 when this is ≥ the coverage gate.
 */
export function fieldCoverage(
  members: ScoreableMember[],
): Record<CriterionKind, number> {
  const empty: Record<CriterionKind, number> = {
    skill: 0,
    role: 0,
    experience: 0,
    seniority: 0,
    education: 0,
    availability: 0,
    compensation: 0,
    location: 0,
    evidence: 1,
    other: 0,
  };
  if (members.length === 0) return empty;
  const n = members.length;
  const frac = (pred: (m: ScoreableMember) => boolean) =>
    members.filter(pred).length / n;
  return {
    skill: frac(
      (m) =>
        m.skills.length > 0 ||
        (m.dossier?.evidence.workingLanguages.value.length ?? 0) > 0,
    ),
    role: frac((m) => {
      const raw = (m.jobRole ?? "").trim();
      const family = m.dossier?.roleFamily.value ?? roleFamilyFor(raw);
      return Boolean(raw) && !UNSPECIFIC_ROLE.has(family);
    }),
    experience: frac((m) => yearsKnown(m) && m.yearsExperience > 0),
    seniority: frac((m) => inferSeniorityRank(m) != null),
    education: frac((m) => Boolean(m.dossier?.education.value.level?.trim())),
    // Withdrawn rows are not coverage. Counting them could promote a location
    // criterion to a hard requirement on the strength of data the evaluator is
    // forbidden to read, which would exclude people on evidence nobody has.
    availability: frac((m) => activeAvailability(m.availability) != null),
    compensation: frac((m) => {
      const a = activeAvailability(m.availability);
      return a?.expectedSalaryMin != null || a?.expectedSalaryMax != null;
    }),
    location: frac((m) => {
      const a = activeAvailability(m.availability);
      return (a?.preferredCities.length ?? 0) > 0 || a?.openToRelocate === true;
    }),
    evidence: 1,
    other: 0,
  };
}

export const __test = {
  yearsKnown,
  inferSeniorityRank,
  requestedSeniority,
  clamp01,
};
