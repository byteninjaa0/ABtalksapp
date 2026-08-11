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
 * Phase C: grounded rationales from scoreBreakdown + evidence only.
 * Optional Claude polish — never invents numbers (prompt + post-check).
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

export async function explainMatches(
  matches: ScoredCandidate[],
  nearMisses: ScoredCandidate[],
  spec: JobSpec,
): Promise<ExplainResult> {
  const base = explainMatchesDeterministic(matches, nearMisses, spec);
  if (!process.env.ANTHROPIC_API_KEY || matches.length === 0) return base;

  try {
    const { askClaudeAgentJson } = await import("@/lib/claude-agent");
    const payload = {
      role: spec.title,
      mustHaveStack: spec.mustHaveStack,
      matches: matches.map((m) => ({
        id: m.programMemberId,
        fullName: m.fullName,
        score: m.score,
        tier: m.tier,
        evidence: m.evidence,
        gaps: m.gaps,
        availabilityUnknown: m.availabilityUnknown,
      })),
      nearMissCount: nearMisses.length,
    };
    const ai = await askClaudeAgentJson<{
      rationales?: { id: string; rationale: string }[];
      overallGap?: string;
    }>({
      system: `You write recruiter-facing match rationales for ABTalks Scout.
Rules: ONLY cite fields present in the JSON you are given. Never invent scores, projects, or skills.
If you cannot support a claim from the payload, omit it. Return JSON:
{ "rationales": [{"id": string, "rationale": string}], "overallGap": string }`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
      maxTokens: 1200,
    });
    if (!ai.ok || !ai.data.rationales) return base;

    const byId = new Map(
      ai.data.rationales.map((r) => [r.id, r.rationale] as const),
    );
    return {
      matches: base.matches.map((m) => ({
        ...m,
        rationale: byId.get(m.programMemberId) ?? m.rationale,
      })),
      overallGap:
        typeof ai.data.overallGap === "string" && ai.data.overallGap.length > 20
          ? ai.data.overallGap
          : base.overallGap,
    };
  } catch {
    return base;
  }
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
