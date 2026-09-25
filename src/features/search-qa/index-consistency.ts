/**
 * Search document vs canonical profile, field by field.
 *
 * There is no separate search index: every search assembles a
 * `CandidateDossier` from live tables. "Stale" therefore means the document a
 * recruiter was ranked on says something the canonical 078 profile does not —
 * because a loader read a legacy mirror, fell back to `ProgramMember`, split a
 * skill name, or picked the wrong education row. None of these heal with time,
 * which is why each drift carries its cause.
 *
 * PURE.
 */
import type { ScoreableMember } from "@/features/hire/types";
import { isCanonicalSkill } from "@/lib/skill-catalog";
import {
  claimedSkillNames,
  declaredExperienceMonths,
  latestGraduationYear,
  type CanonicalCandidate,
} from "@/features/search-qa/canonical";
import type { KnownIssueId } from "@/features/search-qa/known-issues";
import { normKey } from "@/features/search-qa/normalize";
import type { QaCategory, Severity } from "@/features/search-qa/types";

export type DriftField = "skills" | "gradYear" | "yearsExperience" | "availability" | "links" | "roleTitles";

export type DocumentDrift = {
  field: DriftField;
  category: QaCategory;
  severity: Severity;
  cause: string;
  canonical: string;
  document: string;
  knownIssue?: KnownIssueId;
  productDecision?: boolean;
};

const GLUE = new Set(["and", "or", "with", "using", "for", "the", "in", "on", "of", "etc", "etc.", "basic", "basics"]);

/** The pieces a skill name turns into when a loader splits it like pasted legacy text. */
export function splitPieces(name: string): string[] {
  const out: string[] = [];
  for (const part of name.split(/[,;/|]+|\s+(?:and|&)\s+/i)) {
    const token = part.trim().replace(/\s+/g, " ");
    if (!token) continue;
    const ws = token.split(" ");
    for (const w of ws.length >= 4 ? ws : [token]) {
      if (w && !GLUE.has(w.toLowerCase())) out.push(w);
    }
  }
  return out;
}

/**
 * A claimed skill "name" that is really a pasted list ("python c++ html css js
 * react", "HTML, CSS"). Splitting it is what makes it searchable at all — a data
 * problem the loader happens to rescue. A catalog name ("UI/UX Design", "CI/CD")
 * split apart is the opposite: a real skill destroyed (QA-KI-004).
 */
export function isPastedSkillList(name: string): boolean {
  if (isCanonicalSkill(name)) return false;
  return name.trim().split(/\s+/).length >= 4 || /[,;|]/.test(name);
}

/** Every token the canonical claims legitimately produce once split. */
function canonicalTokenKeys(c: CanonicalCandidate): Set<string> {
  const keys = new Set<string>();
  for (const s of claimedSkillNames(c)) {
    keys.add(normKey(s));
    for (const p of splitPieces(s)) keys.add(normKey(p));
  }
  return keys;
}

/**
 * Is the document's skill list the historical StudentProfile skills snapshot
 * rather than the canonical claims? Original tables are dropped; this is a
 * data-quality check, not a runtime read-path switch.
 */
export function documentReadsLegacyMirror(c: CanonicalCandidate, m: ScoreableMember): boolean {
  const legacy = c.legacy?.studentProfileSkills;
  const doc = m.skills ?? [];
  if (!legacy || legacy.length === 0 || doc.length === 0) return false;
  const legacyKeys = new Set(legacy.flatMap((s) => splitPieces(s)).map(normKey));
  legacy.forEach((s) => legacyKeys.add(normKey(s)));
  const canonical = canonicalTokenKeys(c);
  return doc.every((d) => legacyKeys.has(normKey(d))) && doc.some((d) => !canonical.has(normKey(d)));
}

/** A cohort member whose canonical profile claims nothing, read from ProgramMember.skills. */
export function documentReadsCohortSkills(c: CanonicalCandidate, m: ScoreableMember): boolean {
  if ((m.source ?? "PROGRAM") !== "PROGRAM" || claimedSkillNames(c).length > 0) return false;
  const legacy = new Set((c.legacy?.programMemberSkills ?? []).map(normKey));
  return (m.skills ?? []).length > 0 && (m.skills ?? []).every((d) => legacy.has(normKey(d)));
}

export function documentDrift(c: CanonicalCandidate, m: ScoreableMember): DocumentDrift[] {
  const out: DocumentDrift[] = [];
  const source = m.source ?? "PROGRAM";

  /* skills */
  const doc = m.skills ?? [];
  const docKeys = new Set(doc.map(normKey));
  const claimed = claimedSkillNames(c);
  const claimedKeys = new Set(claimed.map(normKey));
  const unclaimedKeys = new Set(c.skills.filter((s) => !s.claimed).map((s) => normKey(s.name)));
  const pieceKeys = new Set<string>();
  const split: string[] = [];
  const missing: string[] = [];
  for (const s of claimed) {
    if (docKeys.has(normKey(s))) continue;
    const pieces = splitPieces(s).map(normKey);
    if (pieces.length > 1 && pieces.every((p) => docKeys.has(p))) {
      split.push(s);
      pieces.forEach((p) => pieceKeys.add(p));
    } else {
      missing.push(s);
    }
  }
  const destroyed = split.filter((s) => !isPastedSkillList(s));
  const rescued = split.filter((s) => isPastedSkillList(s));
  if (destroyed.length) {
    out.push({
      field: "skills",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: "LOADER_SPLIT_SKILL",
      canonical: destroyed.join(", "),
      document: destroyed.map((s) => splitPieces(s).join(" + ")).join(", "),
    });
  }
  if (rescued.length) {
    out.push({
      field: "skills",
      category: "DATA_QUALITY_ERROR",
      severity: "WARNING",
      cause: "PASTED_SKILL_LIST",
      canonical: rescued.join(", "),
      document: rescued.map((s) => splitPieces(s).join(" + ")).join(", "),
    });
  }
  // The cohort path keeps ProgramMember.skills when the profile has none; the
  // challenge / hackathon loaders fall back to the legacy mirror on the flag-off path.
  const extras = doc.filter((d) => {
    const k = normKey(d);
    return !claimedKeys.has(k) && !pieceKeys.has(k) && !claimed.some((s) => splitPieces(s).map(normKey).includes(k));
  });
  const unclaimedExtras = extras.filter((d) => unclaimedKeys.has(normKey(d)));
  const foreignExtras = extras.filter((d) => !unclaimedKeys.has(normKey(d)));
  const fromLegacy = documentReadsLegacyMirror(c, m);
  const fromCohort = documentReadsCohortSkills(c, m);
  if (fromCohort) {
    out.push({
      field: "skills",
      category: "DATA_QUALITY_ERROR",
      severity: "WARNING",
      cause: "CANONICAL_PROFILE_MISSING_COHORT_SKILLS",
      canonical: "n/a (no claimed skills)",
      document: doc.slice(0, 10).join(", "),
    });
  } else if (fromLegacy && (missing.length || extras.length)) {
    out.push({
      field: "skills",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: "LEGACY_MIRROR_READ",
      canonical: claimed.slice(0, 10).join(", ") || "n/a",
      document: doc.slice(0, 10).join(", "),
    });
  } else if (missing.length && doc.length === 0) {
    out.push({
      field: "skills",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: "DOCUMENT_HAS_NO_SKILLS",
      canonical: missing.join(", "),
      document: "n/a",
    });
  } else if (missing.length) {
    out.push({
      field: "skills",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: source === "PROGRAM" ? "COHORT_SKILLS_FALLBACK" : "CLAIMED_SKILL_MISSING",
      canonical: missing.join(", "),
      document: doc.slice(0, 10).join(", "),
    });
  }
  if (!fromLegacy && !fromCohort && unclaimedExtras.length) {
    out.push({
      field: "skills",
      category: "SEARCH_FILTER_ERROR",
      severity: "WARNING",
      cause: "UNCLAIMED_SKILL_IN_DOCUMENT",
      canonical: "(withdrawn)",
      document: unclaimedExtras.join(", "),
      productDecision: true,
    });
  }
  if (!fromLegacy && !fromCohort && foreignExtras.length) {
    out.push({
      field: "skills",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: source === "PROGRAM" ? "COHORT_SKILLS_FALLBACK" : "LEGACY_MIRROR_SKILL",
      canonical: claimed.slice(0, 10).join(", ") || "n/a",
      document: foreignExtras.slice(0, 10).join(", "),
    });
  }

  /* graduation year */
  const docGrad = m.dossier?.education.value.gradYear ?? null;
  const canonGrad = latestGraduationYear(c);
  if (docGrad !== canonGrad && c.profile) {
    const hasNullRow = c.education.some((e) => e.graduationYear == null);
    // On the cohort path a NULLS-FIRST pick yields null and then falls back to
    // ProgramMember.graduationYear, so the null never shows — the row does.
    const nullsFirst = hasNullRow && (docGrad == null || source === "PROGRAM");
    out.push({
      field: "gradYear",
      category: "SEARCH_INDEX_STALE",
      severity: "WARNING",
      cause: nullsFirst
        ? "NULLS_FIRST_EDUCATION_PICK"
        : source === "PROGRAM"
          ? "COHORT_EDUCATION_FALLBACK"
          : "EDUCATION_DRIFT",
      canonical: String(canonGrad ?? "n/a"),
      document: String(docGrad ?? "n/a"),
    });
  }

  /* years of experience */
  const months = declaredExperienceMonths(c);
  const declaredYears = months > 0 ? Math.round(months / 12) : 0;
  if (c.profile && m.yearsExperience !== declaredYears) {
    const fromGraduation = (source === "CLAUDE" || source === "CHALLENGE_60") && months === 0;
    out.push({
      field: "yearsExperience",
      category: fromGraduation ? "RANKING_ERROR" : "SEARCH_INDEX_STALE",
      severity: fromGraduation ? "INFO" : "WARNING",
      cause: fromGraduation ? "YEARS_INFERRED_FROM_GRADUATION" : source === "PROGRAM" ? "COHORT_YEARS_FALLBACK" : "YEARS_DRIFT",
      canonical: String(declaredYears),
      document: String(m.yearsExperience),
    });
  }

  /* availability */
  const a = m.availability;
  const p = c.preference;
  const docAvail = a
    ? JSON.stringify([a.openToWork, a.noticePeriodDays, a.preferredWorkMode, a.preferredCities, a.openToRelocate, [...a.opportunityTypes].sort(), a.expectedSalaryMin])
    : "none";
  const canonAvail = p
    ? JSON.stringify([p.openToWork, p.noticePeriodDays, p.remotePreference, p.preferredLocations, p.willingToRelocate, [...p.opportunityTypes].sort(), p.expectedSalaryMin])
    : "none";
  if (docAvail !== canonAvail) {
    out.push({
      field: "availability",
      category: "SEARCH_INDEX_STALE",
      severity: "ERROR",
      cause: "AVAILABILITY_DRIFT",
      canonical: canonAvail,
      document: docAvail,
    });
  }

  /* role titles — the role dimension ranks on these */
  const canonTitles = [
    c.profile?.headline ?? "",
    ...(c.preference?.preferredRoles ?? []),
    ...c.experience.map((e) => e.title),
  ]
    .map((t) => t.trim())
    .filter(Boolean);
  if (canonTitles.length > 0) {
    if (m.roleTitles === undefined) {
      out.push({
        field: "roleTitles",
        category: "SEARCH_INDEX_STALE",
        severity: "ERROR",
        cause: "ROLE_TITLES_NOT_ATTACHED",
        canonical: canonTitles.slice(0, 5).join(" | "),
        document: "n/a (attachRoleTitles did not run)",
      });
    } else {
      const docKeys = new Set(m.roleTitles.map((t) => t.trim().toLowerCase()));
      const missingTitles = canonTitles.filter((t) => !docKeys.has(t.toLowerCase()));
      if (missingTitles.length) {
        out.push({
          field: "roleTitles",
          category: "SEARCH_INDEX_STALE",
          severity: "WARNING",
          cause: "ROLE_TITLE_MISSING",
          canonical: missingTitles.slice(0, 5).join(" | "),
          document: m.roleTitles.slice(0, 5).join(" | ") || "n/a",
        });
      }
    }
  }

  /* links (booleans only) */
  const links = m.dossier?.links.value;
  if (links && c.profile) {
    const canonGithub = Boolean(c.profile.githubUsername?.trim());
    const canonLinkedin = Boolean(c.profile.linkedinUrl?.trim());
    if (links.github !== canonGithub || links.linkedin !== canonLinkedin) {
      out.push({
        field: "links",
        category: "SEARCH_INDEX_STALE",
        severity: "WARNING",
        cause: source === "PROGRAM" ? "COHORT_LINKS_FALLBACK" : "LINKS_DRIFT",
        canonical: `github=${canonGithub} linkedin=${canonLinkedin}`,
        document: `github=${links.github} linkedin=${links.linkedin}`,
      });
    }
  }

  return out;
}
