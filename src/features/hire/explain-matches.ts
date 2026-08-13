import "server-only";

import { candidatePublicId } from "@/features/hire/public-id";
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
 * What the pool looked like when this search ran.
 *
 * Without it the gap paragraph could only say "no matches", which reads as a
 * fault of the platform. "Five people opted in, three are still below the
 * evidence bar" is the same fact with the reason attached — and the reason is
 * what tells the owner whether to run a consent drive or a training push.
 */
export type ExplainContext = {
  totalEligible: number;
  belowEvidenceFloor: number;
  coverageNote: string;
  stage: "PUBLISHED" | "OPEN_MIDCOHORT" | null;
};

/**
 * Phase C: grounded rationales from scoreBreakdown + evidence only.
 * Optional Claude polish — never invents numbers (prompt + post-check).
 */
export function explainMatchesDeterministic(
  matches: ScoredCandidate[],
  nearMisses: ScoredCandidate[],
  spec: JobSpec,
  context?: ExplainContext,
): ExplainResult {
  const explained: ExplainedMatch[] = matches.map((m) => ({
    ...m,
    rationale: buildRationale(m, spec),
  }));

  const overallGap = buildOverallGap(matches, nearMisses, spec, context);
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
    // The public id is digits the model is *told* to quote. Without it here the
    // guard rejects every rationale for citing the label we asked it to use.
    publicId: candidatePublicId(m.programMemberId),
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
  context?: ExplainContext,
): Promise<ExplainResult> {
  const base = explainMatchesDeterministic(matches, nearMisses, spec, context);
  if (matches.length === 0) return base;

  const { askGroqJson, groqConfigured } = await import("@/lib/groq");
  if (!groqConfigured()) return base;

  try {
    const payload = {
      role: spec.title,
      mustHaveStack: spec.mustHaveStack,
      // No name goes to the model, so no name can come back in a rationale
      // that a recruiter then reads. It refers to candidates by public id.
      matches: matches.map((m) => ({
        id: m.programMemberId,
        publicId: candidatePublicId(m.programMemberId),
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
- Refer to each candidate by their publicId (e.g. AB-1234). You are not given names and must never invent one.
- Provenance matters and must be worded correctly. Missions passed, first-attempt passes, commit days, project scores and interview scores are VERIFIED by the platform — state them as fact. Skills, job role and years of experience are SELF-DECLARED — write them as "declared" or "says they know". Never present a declared skill as proven.
- "missionsPassed" is the number of missions they actually completed. Never quote "missionPoints" — it includes days waived to everyone at enrolment and overstates the work.
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
  // Public id, not the name: this string is rendered to recruiters and stored
  // on the match row, so it must not carry identity.
  parts.push(
    `${candidatePublicId(m.programMemberId)} scores ${m.score}/100 (${m.tier}) for ${spec.title ?? "this role"}.`,
  );
  if (e.skills.length) {
    parts.push(`Declared skills: ${e.skills.slice(0, 8).join(", ")}.`);
  }
  // Earned passes, not mission points. Points include the three days waived at
  // enrolment, so quoting them credits every member with work none of them did.
  parts.push(
    `Verified: ${e.missionsPassed} missions passed of ${e.missionsAttempted} attempted, ${e.cleanPassCount} on the first run, ${e.commitDayCount} commit days.`,
  );
  if (e.workingLanguages.length) {
    parts.push(
      `Worked in ${e.workingLanguages.map((l) => l.toLowerCase()).join(", ")} on the missions they passed.`,
    );
  }
  if (e.projectScores.length) {
    parts.push(
      `Graded projects: ${e.projectScores.join(", ")} (platform rubric scores).`,
    );
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
  context?: ExplainContext,
): string {
  const stack = (spec.mustHaveStack ?? []).join(", ") || "your stack";

  // Say why the pool is the size it is. "No matches" alone gives the recruiter
  // nothing to judge and gives us nothing to fix — whereas "five opted in,
  // three are below the evidence bar" points straight at the thing to do next.
  const poolNote = context
    ? context.totalEligible === 0
      ? context.belowEvidenceFloor > 0
        ? ` ${context.belowEvidenceFloor} member(s) have opted in but have not yet passed enough verified missions to be ranked.`
        : " No members of an open cohort have opted into recruiter visibility yet."
      : ` Searched ${context.totalEligible} opted-in candidate(s) with verified work.${
          context.belowEvidenceFloor > 0
            ? ` A further ${context.belowEvidenceFloor} opted in but are still below the evidence bar.`
            : ""
        }`
    : "";

  if (matches.length === 0 && nearMisses.length === 0) {
    return (
      `No one matches yet for ${spec.title ?? "this role"} (must-have: ${stack}).${poolNote} ` +
      `I've saved this requirement so we can train and alert you when people clear the bar. ` +
      `Scout ranks verified work, not resumes.`
    );
  }
  if (matches.length === 0 && nearMisses.length > 0) {
    const sample = nearMisses[0]!;
    return (
      `No strong matches for ${stack}. Closest profile: ${candidatePublicId(sample.programMemberId)} ` +
      `(score ${sample.score}) — ${sample.gaps.slice(0, 3).join("; ") || "see gaps"}.${poolNote} ` +
      `Save this demand and we can train a cohort toward this stack.`
    );
  }
  const coverage = context?.coverageNote ? ` ${context.coverageNote}` : "";
  const partial = matches.filter((m) => m.tier === "PARTIAL").length;
  if (partial > 0) {
    return (
      `Found ${matches.length} candidate(s); ${partial} are partial.${poolNote}${coverage} ` +
      `Review gaps on each card — confirm availability offline before outreach.`
    );
  }
  return `Found ${matches.length} candidate(s) ranked by verified ABTalks evidence.${poolNote}${coverage}`;
}
