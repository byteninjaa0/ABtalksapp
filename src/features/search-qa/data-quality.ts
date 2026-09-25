/**
 * Candidate-profile data quality — audited, never repaired.
 *
 * Nothing here decides whether recruiter search is correct. A candidate named
 * "test" who claims React and is returned for React is a data problem and a
 * search PASS. These rules exist so that a bad-looking result can be read as
 * "the profile is wrong" with evidence, instead of being filed as a search bug.
 *
 * Messages never contain an email address, phone number or full URL: an
 * offending value is truncated, and emails are reduced to their domain.
 *
 * PURE.
 */
import { canonicalSkillName } from "@/lib/skill-catalog";
import {
  gateReasons,
  hasUsableProfile,
  type CanonicalCandidate,
} from "@/features/search-qa/canonical";
import {
  isPickerWorkMode,
  normalizeCity,
  normalizeDegree,
  normalizeWorkMode,
  squash,
} from "@/features/search-qa/normalize";
import type { Severity } from "@/features/search-qa/types";

export type DataQualityRule =
  | "NAME_EMPTY"
  | "NAME_PLACEHOLDER"
  | "EMAIL_INVALID"
  | "TEST_ACCOUNT_SEARCHABLE"
  | "NON_CANDIDATE_ROLE_SEARCHABLE"
  | "GRAD_YEAR_OUT_OF_RANGE"
  | "GRAD_BEFORE_START"
  | "EDUCATION_CURRENT_BUT_GRADUATED"
  | "COLLEGE_MISSING"
  | "COLLEGE_PLACEHOLDER"
  | "COLLEGE_UNLINKED"
  | "DEGREE_UNNORMALIZED"
  | "EXPERIENCE_NEGATIVE"
  | "EXPERIENCE_IMPOSSIBLE"
  | "EXPERIENCE_CURRENT_WITH_END"
  | "EXPERIENCE_OVERLAP_DOUBLE_COUNTED"
  | "SKILLS_EMPTY"
  | "SKILL_PLACEHOLDER"
  | "SKILL_INACTIVE_CLAIMED"
  | "SKILL_DUPLICATE_SPELLING"
  | "GITHUB_INVALID"
  | "LINKEDIN_INVALID"
  | "URL_INVALID"
  | "CODING_PROFILE_URL_INVALID"
  | "WORK_MODE_INVALID"
  | "LOCATION_UNNORMALIZED"
  | "LOCATION_PLACEHOLDER"
  | "NOTICE_OUT_OF_RANGE"
  | "SALARY_RANGE_INVERTED"
  | "VISIBILITY_ROW_MISSING"
  | "DUPLICATE_ACCOUNT";

export type DataQualityIssue = {
  rule: DataQualityRule;
  severity: Severity;
  field: string;
  message: string;
};

/** Which search filters a rule can distort, for "returned, but the data is suspect". */
const RULE_FILTERS: Partial<Record<DataQualityRule, string[]>> = {
  SKILL_PLACEHOLDER: ["mustHaveStack"],
  SKILL_DUPLICATE_SPELLING: ["mustHaveStack"],
  SKILL_INACTIVE_CLAIMED: ["mustHaveStack"],
  WORK_MODE_INVALID: ["workMode"],
  LOCATION_UNNORMALIZED: ["locationCity"],
  LOCATION_PLACEHOLDER: ["locationCity"],
  NOTICE_OUT_OF_RANGE: ["noticePeriodDays"],
  SALARY_RANGE_INVERTED: ["salaryMax"],
  EXPERIENCE_IMPOSSIBLE: ["experience"],
  EXPERIENCE_NEGATIVE: ["experience"],
  EXPERIENCE_OVERLAP_DOUBLE_COUNTED: ["experience"],
};

export function issuesRelevantTo(
  issues: DataQualityIssue[],
  filterIds: readonly string[],
): DataQualityIssue[] {
  return issues.filter((i) =>
    (RULE_FILTERS[i.rule] ?? []).some((f) => filterIds.includes(f)),
  );
}

const PLACEHOLDERS = new Set([
  "test",
  "testing",
  "tester",
  "na",
  "n/a",
  "nil",
  "none",
  "null",
  "undefined",
  "-",
  "--",
  ".",
  "..",
  "x",
  "xx",
  "xxx",
  "xyz",
  "abc",
  "asdf",
  "qwerty",
  "demo",
  "sample",
  "user",
  "student",
  "candidate",
  "unknown",
  "no",
  "nothing",
  "123",
  "1234",
]);

export const TEST_EMAIL_DOMAINS = new Set([
  "abtalks.dev",
  "example.com",
  "example.org",
  "test.com",
  "mailinator.com",
]);

/** Single-letter language names that are real skills. */
const SHORT_REAL_SKILLS = new Set(["c", "r", "go", "js", "ts", "ai", "ml", "ui", "ux", "qa", "c#", "f#"]);

export function isPlaceholder(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const k = raw.trim().toLowerCase();
  if (!k) return true;
  if (PLACEHOLDERS.has(k)) return true;
  // Punctuation or a single repeated character only.
  if (/^[^a-z0-9]+$/i.test(k)) return true;
  if (/^(.)\1{2,}$/.test(k)) return true;
  return false;
}

function truncate(raw: string, n = 40): string {
  const t = raw.trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

const GITHUB_USERNAME = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;

const CODING_HOSTS: Record<string, string[]> = {
  LEETCODE: ["leetcode.com", "leetcode.cn"],
  CODECHEF: ["codechef.com"],
  CODEFORCES: ["codeforces.com"],
  KAGGLE: ["kaggle.com"],
  GITHUB: ["github.com"],
  LINKEDIN: ["linkedin.com"],
};

function hostMatches(u: URL, hosts: string[]): boolean {
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  return hosts.some((x) => h === x || h.endsWith(`.${x}`));
}

export function dataQualityIssues(
  c: CanonicalCandidate,
  now: Date = new Date(),
): DataQualityIssue[] {
  const out: DataQualityIssue[] = [];
  const push = (
    rule: DataQualityRule,
    severity: Severity,
    field: string,
    message: string,
  ) => out.push({ rule, severity, field, message });

  const searchable = gateReasons(c).length === 0;
  const year = now.getUTCFullYear();

  if (!c.emailValid) push("EMAIL_INVALID", "WARNING", "User.email", "email is not a valid address");
  if (searchable && c.emailDomain && TEST_EMAIL_DOMAINS.has(c.emailDomain)) {
    push("TEST_ACCOUNT_SEARCHABLE", "CRITICAL", "User.email", `test-domain account (@${c.emailDomain}) is recruiter-searchable`);
  }
  if (searchable && c.role !== "STUDENT") {
    push("NON_CANDIDATE_ROLE_SEARCHABLE", "ERROR", "User.role", `${c.role} account is recruiter-searchable`);
  }

  const p = c.profile;
  if (p) {
    if (!p.fullName.trim()) {
      push("NAME_EMPTY", searchable ? "CRITICAL" : "ERROR", "CandidateProfile.fullName", "name is blank");
    } else if (isPlaceholder(p.fullName) || p.fullName.trim().length < 2) {
      push("NAME_PLACEHOLDER", "WARNING", "CandidateProfile.fullName", `name looks like a placeholder ("${truncate(p.fullName, 20)}")`);
    }

    if (p.githubUsername != null && p.githubUsername.trim() !== "") {
      const g = p.githubUsername.trim();
      if (!GITHUB_USERNAME.test(g)) {
        push(
          "GITHUB_INVALID",
          "WARNING",
          "CandidateProfile.githubUsername",
          /github\.com|https?:|\//i.test(g)
            ? "a URL was stored where a GitHub username belongs"
            : `"${truncate(g, 30)}" is not a valid GitHub username`,
        );
      }
    }
    if (p.linkedinUrl != null && p.linkedinUrl.trim() !== "") {
      const u = parseHttpUrl(p.linkedinUrl);
      if (!u || !hostMatches(u, CODING_HOSTS.LINKEDIN!)) {
        push("LINKEDIN_INVALID", "WARNING", "CandidateProfile.linkedinUrl", "LinkedIn value is not a linkedin.com URL");
      }
    }
    if (p.portfolioUrl != null && p.portfolioUrl.trim() !== "" && !parseHttpUrl(p.portfolioUrl)) {
      push("URL_INVALID", "WARNING", "CandidateProfile.portfolioUrl", "portfolio URL is not a valid http(s) URL");
    }
    if (p.locationCity && isPlaceholder(p.locationCity)) {
      push("LOCATION_PLACEHOLDER", "WARNING", "CandidateProfile.locationCity", `city looks like a placeholder ("${truncate(p.locationCity, 20)}")`);
    }

    // Education.
    // Incomplete is not incorrect: an empty section is INFO, a wrong value is not.
    if (c.education.length === 0) {
      push("COLLEGE_MISSING", "INFO", "CandidateEducation", "no education entered");
    }
    for (const e of c.education) {
      if (isPlaceholder(e.institutionName)) {
        push("COLLEGE_PLACEHOLDER", "WARNING", "CandidateEducation.institutionName", `institution looks like a placeholder ("${truncate(e.institutionName, 20)}")`);
      } else if (!e.collegeId) {
        push("COLLEGE_UNLINKED", "INFO", "CandidateEducation.collegeId", `"${truncate(e.institutionName)}" is not linked to the college catalog`);
      }
      if (e.graduationYear != null && (e.graduationYear < 1960 || e.graduationYear > year + 6)) {
        push("GRAD_YEAR_OUT_OF_RANGE", "ERROR", "CandidateEducation.graduationYear", `graduation year ${e.graduationYear} is outside 1960–${year + 6}`);
      }
      if (e.graduationYear != null && e.startYear != null && e.graduationYear < e.startYear) {
        push("GRAD_BEFORE_START", "ERROR", "CandidateEducation.graduationYear", `graduates ${e.graduationYear} before starting ${e.startYear}`);
      }
      if (e.isCurrent && e.graduationYear != null && e.graduationYear < year - 1) {
        push("EDUCATION_CURRENT_BUT_GRADUATED", "WARNING", "CandidateEducation.isCurrent", `marked current but graduated ${e.graduationYear}`);
      }
      if (e.degree && normalizeDegree(e.degree).changed) {
        push("DEGREE_UNNORMALIZED", "INFO", "CandidateEducation.degree", `"${truncate(e.degree, 30)}" → "${normalizeDegree(e.degree).canonical}"`);
      }
    }

    // Experience.
    let months = 0;
    const ranges: [number, number][] = [];
    for (const x of c.experience) {
      const start = x.startedOn.getTime();
      const end = (x.endedOn ?? now).getTime();
      if (x.totalMonths < 0 || (x.endedOn && x.endedOn.getTime() < start)) {
        push("EXPERIENCE_NEGATIVE", "ERROR", "CandidateExperience", `"${truncate(x.title, 30)}" ends before it starts`);
      }
      if (start > now.getTime() + 31 * 86_400_000) {
        push("EXPERIENCE_IMPOSSIBLE", "ERROR", "CandidateExperience.startedOn", `"${truncate(x.title, 30)}" starts in the future`);
      }
      if (x.isCurrent && x.endedOn) {
        push("EXPERIENCE_CURRENT_WITH_END", "WARNING", "CandidateExperience.isCurrent", `"${truncate(x.title, 30)}" is current but has an end date`);
      }
      months += Math.max(0, x.totalMonths);
      if (end >= start) ranges.push([start, end]);
    }
    if (months > 600) {
      push("EXPERIENCE_IMPOSSIBLE", "ERROR", "CandidateExperience.totalMonths", `${Math.round(months / 12)} years of experience`);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ranges.length; i++) {
      if (ranges[i]![0] < ranges[i - 1]![1] - 31 * 86_400_000) {
        push(
          "EXPERIENCE_OVERLAP_DOUBLE_COUNTED",
          "INFO",
          "CandidateExperience.totalMonths",
          "overlapping roles are summed, overstating years of experience used by search",
        );
        break;
      }
    }

    // Skills.
    const claimed = c.skills.filter((s) => s.claimed);
    if (claimed.length === 0) {
      push("SKILLS_EMPTY", "INFO", "CandidateSkill", "no claimed skills, cannot match any skill requirement");
    }
    const byCanonical = new Map<string, string[]>();
    for (const s of claimed) {
      const k = s.name.trim().toLowerCase();
      if (isPlaceholder(s.name) || (/^\d+$/.test(k)) || (k.length === 1 && !SHORT_REAL_SKILLS.has(k)) || k.length > 60) {
        push("SKILL_PLACEHOLDER", "WARNING", "Skill.name", `"${truncate(s.name, 30)}" is not a skill`);
      }
      if (!s.isActive) {
        push("SKILL_INACTIVE_CLAIMED", "WARNING", "CandidateSkill.skillId", `claims deactivated catalog skill "${truncate(s.name, 30)}"`);
      }
      const key = squash(canonicalSkillName(s.name));
      if (key) byCanonical.set(key, [...(byCanonical.get(key) ?? []), s.name]);
    }
    for (const names of byCanonical.values()) {
      if (names.length > 1) {
        push("SKILL_DUPLICATE_SPELLING", "WARNING", "CandidateSkill", `same skill claimed ${names.length}× (${names.map((n) => `"${truncate(n, 20)}"`).join(", ")})`);
      }
    }

    for (const pr of c.projects) {
      for (const [field, url] of [["repoUrl", pr.repoUrl], ["liveUrl", pr.liveUrl]] as const) {
        if (url && url.trim() && !parseHttpUrl(url)) {
          push("URL_INVALID", "WARNING", `CandidateProjectEntry.${field}`, `project "${truncate(pr.title, 30)}" has an invalid ${field}`);
        }
      }
    }
    for (const link of c.links) {
      const u = parseHttpUrl(link.url);
      const hosts = CODING_HOSTS[link.type];
      if (!u) {
        push(hosts ? "CODING_PROFILE_URL_INVALID" : "URL_INVALID", "WARNING", `CandidateLink.${link.type}`, `${link.type} link is not a valid URL`);
      } else if (hosts && !hostMatches(u, hosts)) {
        push("CODING_PROFILE_URL_INVALID", "WARNING", `CandidateLink.${link.type}`, `${link.type} link points at ${u.hostname}`);
      }
    }
  }

  const pref = c.preference;
  if (pref) {
    if (pref.remotePreference && !isPickerWorkMode(pref.remotePreference)) {
      push(
        "WORK_MODE_INVALID",
        normalizeWorkMode(pref.remotePreference) ? "WARNING" : "ERROR",
        "CandidatePreference.remotePreference",
        `"${truncate(pref.remotePreference, 20)}" is not a work-mode picker value`,
      );
    }
    for (const city of pref.preferredLocations) {
      const n = normalizeCity(city);
      if (isPlaceholder(city)) {
        push("LOCATION_PLACEHOLDER", "WARNING", "CandidatePreference.preferredLocations", `"${truncate(city, 20)}" is not a city`);
      } else if (n.kind === "RENAME" || n.kind === "TYPO" || (n.kind === "SAME" && city.trim() !== n.canonical)) {
        push("LOCATION_UNNORMALIZED", "INFO", "CandidatePreference.preferredLocations", `"${truncate(city, 20)}" → "${n.canonical}" (${n.kind.toLowerCase()})`);
      }
    }
    if (pref.noticePeriodDays != null && (pref.noticePeriodDays < 0 || pref.noticePeriodDays > 180)) {
      push("NOTICE_OUT_OF_RANGE", "WARNING", "CandidatePreference.noticePeriodDays", `${pref.noticePeriodDays} days`);
    }
    if (
      pref.expectedSalaryMin != null &&
      pref.expectedSalaryMax != null &&
      pref.expectedSalaryMin > pref.expectedSalaryMax
    ) {
      push("SALARY_RANGE_INVERTED", "WARNING", "CandidatePreference.expectedSalary*", "minimum above maximum");
    }
  }

  if (!c.visibility && !c.deleted && !c.disabled && hasUsableProfile(c)) {
    push(
      "VISIBILITY_ROW_MISSING",
      "WARNING",
      "CandidateVisibility",
      "usable profile but no visibility row, invisible to recruiters (fails closed)",
    );
  }

  // One issue per (rule, field) per candidate: a profile with four unlinked
  // colleges is one profile with the problem, not four.
  const seen = new Set<string>();
  return out.filter((i) => {
    const key = `${i.rule}|${i.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const ISSUE_CACHE = new WeakMap<CanonicalCandidate, DataQualityIssue[]>();

/** Memoised per snapshot object — the comparison engine asks once per case. */
export function cachedDataQualityIssues(c: CanonicalCandidate): DataQualityIssue[] {
  let hit = ISSUE_CACHE.get(c);
  if (!hit) {
    hit = dataQualityIssues(c);
    ISSUE_CACHE.set(c, hit);
  }
  return hit;
}

/** Healthy = nothing above INFO; warnings = WARNING only; invalid = ERROR or CRITICAL. */
export function healthOf(issues: DataQualityIssue[]): "HEALTHY" | "WARNING" | "INVALID" {
  if (issues.some((i) => i.severity === "CRITICAL" || i.severity === "ERROR")) return "INVALID";
  if (issues.some((i) => i.severity === "WARNING")) return "WARNING";
  return "HEALTHY";
}

/**
 * Accounts that are very likely the same person: the same GitHub username or
 * LinkedIn profile on two users, or two Gmail addresses that Gmail delivers to
 * one inbox. Streams — call `observe` per candidate, `duplicates` at the end.
 */
export class DuplicateAccountDetector {
  private byKey = new Map<string, string[]>();

  observe(c: CanonicalCandidate, emailLocalKey: string | null | undefined = c.emailAliasKey): void {
    const keys: string[] = [];
    const gh = c.profile?.githubUsername?.trim().toLowerCase();
    if (gh && GITHUB_USERNAME.test(gh)) keys.push(`github:${gh}`);
    const li = c.profile?.linkedinUrl ? parseHttpUrl(c.profile.linkedinUrl) : null;
    if (li && hostMatches(li, CODING_HOSTS.LINKEDIN!)) {
      const path = li.pathname.toLowerCase().replace(/\/+$/, "");
      if (/^\/in\/[^/]+$/.test(path)) keys.push(`linkedin:${path}`);
    }
    if (emailLocalKey) keys.push(`gmail:${emailLocalKey}`);
    for (const k of keys) {
      const list = this.byKey.get(k) ?? [];
      if (!list.includes(c.userId)) list.push(c.userId);
      this.byKey.set(k, list);
    }
  }

  /** The identity itself is never returned — only which kind of identity collided. */
  duplicates(): { kind: string; userIds: string[] }[] {
    return [...this.byKey.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, userIds]) => ({ kind: key.split(":")[0]!, userIds }));
  }
}

/** Gmail ignores dots and "+tags" in the local part. Returns null for other providers. */
export function gmailLocalKey(email: string): string | null {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || (domain !== "gmail.com" && domain !== "googlemail.com")) return null;
  return local.split("+")[0]!.replace(/\./g, "");
}
