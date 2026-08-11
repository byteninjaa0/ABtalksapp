import "server-only";

import type { ScoredCandidate } from "@/features/hire/types";
import type { JobSpec } from "@/lib/validations/hire";

export type ExplainedMatch = ScoredCandidate & {
  rationale: string;
};

export type ExplainResult = {
  matches: ExplainedMatch[];
  overallGap: string;
};

/**
 * Phase C without LLM: grounded rationales from scoreBreakdown + evidence only.
 * Claude can replace prose later; numbers always come from Phase B rows.
 */
export function explainMatchesDeterministic(
  matches: ScoredCandidate[],
  nearMisses: ScoredCandidate[],
  spec: JobSpec,
): ExplainResult {
  const explained: ExplainedMatch[] = matches.map((m) => ({
    ...m,
    rationale: buildRationale(m, spec),
  }));

  const overallGap = buildOverallGap(matches, nearMisses, spec);
  return { matches: explained, overallGap };
}

function buildRationale(m: ScoredCandidate, spec: JobSpec): string {
  const e = m.evidence;
  const parts: string[] = [];
  parts.push(
    `${m.fullName} scores ${m.score}/100 (${m.tier}) for ${spec.title ?? "this role"}.`,
  );
  if (e.skills.length) {
    parts.push(`Skills on file: ${e.skills.slice(0, 8).join(", ")}.`);
  }
  parts.push(
    `Missions: ${e.missionPoints} pts, ${e.cleanPassCount} first-attempt passes, ${e.commitDayCount} verified commit days.`,
  );
  if (e.projectScores.length) {
    parts.push(
      `Graded projects: ${e.projectScores.join(", ")} (platform rubric scores).`,
    );
  } else {
    parts.push("No graded project scores on file.");
  }
  if (e.interview?.overall != null) {
    parts.push(
      `Interview overall ${e.interview.overall} (comm ${e.interview.comm ?? "—"}, tech ${e.interview.tech ?? "—"}, problem ${e.interview.problem ?? "—"}).`,
    );
  }
  if (m.availabilityUnknown) {
    parts.push(
      "Availability (salary / notice / location) not shared — confirm at outreach.",
    );
  }
  if (m.gaps.length) {
    parts.push(`Gaps: ${m.gaps.slice(0, 4).join("; ")}.`);
  }
  return parts.join(" ");
}

function buildOverallGap(
  matches: ScoredCandidate[],
  nearMisses: ScoredCandidate[],
  spec: JobSpec,
): string {
  const stack = (spec.mustHaveStack ?? []).join(", ") || "your stack";
  if (matches.length === 0 && nearMisses.length === 0) {
    return (
      `No one in the published, consenting talent pool matches yet for ${spec.title ?? "this role"} ` +
      `(must-have: ${stack}). I've saved this requirement so we can train and alert you when people clear the bar. ` +
      `This is normal while the cohort pool is still filling — Scout ranks verified work, not resumes.`
    );
  }
  if (matches.length === 0 && nearMisses.length > 0) {
    const sample = nearMisses[0]!;
    return (
      `No strong matches for ${stack}. Closest profile: ${sample.fullName} ` +
      `(score ${sample.score}) — ${sample.gaps.slice(0, 3).join("; ") || "see gaps"}. ` +
      `Save this demand and we can train a cohort toward this stack.`
    );
  }
  const partial = matches.filter((m) => m.tier === "PARTIAL").length;
  if (partial > 0) {
    return (
      `Found ${matches.length} candidate(s); ${partial} are partial. ` +
      `Review gaps on each card — confirm availability offline before outreach.`
    );
  }
  return `Found ${matches.length} candidate(s) ranked by verified ABTalks evidence.`;
}
