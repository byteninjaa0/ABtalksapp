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

const EXPLAIN_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rationales", "overallGap"],
  properties: {
    rationales: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "rationale"],
        properties: {
          id: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    overallGap: { type: "string" },
  },
};

/**
 * Every figure the model quotes must be one the platform actually gave it for
 * that candidate.
 *
 * This text names a real student and a recruiter acts on it, so "the prompt
 * said not to invent numbers" is not a control. An invented score, mission
 * count or interview rating is the failure that matters, and each one has to
 * surface as a digit — so a rationale introducing a digit the platform never
 * produced is discarded in favour of the deterministic one.
 *
 * Grounding is checked against the evidence payload rather than the
 * deterministic sentence: the sentence quotes only part of the payload, so
 * checking against it rejected honest rationales for citing a real figure the
 * template happened to leave out.
 */
function groundedFigures(m: ScoredCandidate): Set<string> {
  // Deliberately excludes id and fullName — a cuid carries arbitrary digits
  // and would whitelist almost anything.
  const source = JSON.stringify({
    score: m.score,
    tier: m.tier,
    evidence: m.evidence,
    gaps: m.gaps,
  });
  return new Set(source.match(/\d+/g) ?? []);
}

function inventsFigures(candidate: string, allowed: Set<string>): boolean {
  return (candidate.match(/\d+/g) ?? []).some((n) => !allowed.has(n));
}

export async function explainMatches(
  matches: ScoredCandidate[],
  nearMisses: ScoredCandidate[],
  spec: JobSpec,
): Promise<ExplainResult> {
  const base = explainMatchesDeterministic(matches, nearMisses, spec);
  if (matches.length === 0) return base;

  const { askGroqJson, groqConfigured } = await import("@/lib/groq");
  if (!groqConfigured()) return base;

  try {
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

    const ai = await askGroqJson<{
      rationales: { id: string; rationale: string }[];
      overallGap: string;
    }>({
      system: `You write recruiter-facing match rationales for ABTalks Scout, which ranks candidates on verified platform evidence — missions completed, first-attempt passes, commit days, graded projects, recorded interviews — never resumes or self-reported claims.

Rules:
- Cite ONLY fields present in the JSON you are given. Never invent a score, a number, a project, a skill or an employer.
- Every figure you write must appear verbatim in the payload. If you cannot support a claim, leave it out.
- Two or three sentences per candidate. Say what the evidence shows, then what is missing.
- Where availabilityUnknown is true, say salary, notice and location are unconfirmed.
- Never promise a hire, predict performance, or compare candidates as people.
- "overallGap" is one short paragraph on what this shortlist does and does not cover.`,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      schemaName: "match_rationales",
      schema: EXPLAIN_SCHEMA,
      maxTokens: 2000,
      temperature: 0.3,
    });
    if (!ai.ok) return base;

    const byId = new Map(ai.data.rationales.map((r) => [r.id, r.rationale]));
    return {
      matches: base.matches.map((m) => {
        const candidate = byId.get(m.programMemberId);
        if (!candidate || inventsFigures(candidate, groundedFigures(m))) {
          return m;
        }
        return { ...m, rationale: candidate };
      }),
      overallGap:
        ai.data.overallGap.length > 20 ? ai.data.overallGap : base.overallGap,
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
