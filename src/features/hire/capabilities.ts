/**
 * What Scout can actually filter on — and what it must admit it cannot.
 *
 * A recruiter asked for "profiles who are in US" and Scout replied "Noted — US
 * location it is", which the search could not keep and the recruiter had no way
 * to check. Accepting an unsupported filter is worse than refusing it: the
 * shortlist that comes back looks like an answer to the question that was asked.
 *
 * The opposite failure is just as bad and this file caused it. The location
 * entry claimed "nobody in the pool has shared a city" — a hard-coded fact that
 * stopped being true, and that contradicted `criteria.ts`, which evaluates
 * cities against opted-in `preferredCities` and `openToRelocate`. Scout refused
 * a filter it was in fact applying. Nothing in this list may assert a
 * *quantity* about the pool: state the capability, and let the search report
 * the numbers.
 *
 * Every gap here is a fact about the data, not a limitation of the model, so
 * this list is the honest one and it lives in exactly one place.
 *
 * Shared, not server-only — the chat renders these strings. `hireChallengePool`
 * only reads `process.env`, which is inlined at build time for anything the
 * client bundles.
 */
import { hireChallengePool } from "@/lib/feature-flags";

export type UnsupportedFilter = {
  id: string;
  /** Patterns that mean the recruiter is asking for this. */
  match: RegExp;
  /** What Scout says. Plain, specific, no apology theatre. */
  reply: string;
  /**
   * The nearest thing we *can* do. Omitted where offering an alternative would
   * be wrong rather than merely unhelpful.
   */
  instead?: string;
  /**
   * When this limit still applies.
   *
   * A gap can be closed — the challenge track was unsearchable until it wasn't
   * — and a stale refusal costs more than the original gap did, because the
   * recruiter is turned away from something that now works. Absent means
   * always.
   */
  onlyWhen?: () => boolean;
};

/**
 * Ordered: the first match wins, so the refusal that must never be softened is
 * tested before anything that might offer a workaround.
 */
export const UNSUPPORTED_FILTERS: UnsupportedFilter[] = [
  {
    // Not a data gap. A line.
    id: "protected_attribute",
    match:
      /\b(gender|male candidates|female candidates|males?\b|females?\b|caste|religion|muslim|hindu|christian|sikh|marital|married|unmarried|age (under|over|below|above)|younger|older candidates)\b/i,
    reply:
      "I don't filter people by gender, age, caste, religion or marital status, and I won't approximate it another way.",
  },
  {
    /**
     * Where a candidate *currently lives* — as opposed to where they have said
     * they are willing to work.
     *
     * These are different questions and only the second is answerable. The
     * only location data on this platform is opted-in willingness
     * (`CandidatePreference.preferredLocations` / `willingToRelocate`); a
     * candidate's actual residence is on their private profile and is never
     * read on a recruiter path. Answering "who lives in Pune" from
     * "who is willing to work in Pune" would be a quiet substitution the
     * recruiter has no way to detect, so it is refused precisely instead.
     */
    id: "current_residence",
    match:
      /\b(currently|presently|right now)\s+(based|living|located|residing)\b|\b(who|candidates?|people|profiles?)\s+(who\s+)?(live|lives|living|reside|residing)\s+in\b|\bbased out of\b|\bhome ?town\b|\blocal (?:to|candidates)\b|\bnearby\b/i,
    reply:
      "I can't tell you where someone currently lives — we don't collect it, and I won't guess it from anything else.",
    instead:
      "I can match on the cities a candidate has said they're willing to work in, and on whether they're open to relocating.",
  },
  {
    /**
     * Places we have no pool for at all.
     *
     * Deliberately NOT a list of Indian cities any more. This entry used to
     * match nine of them plus "relocat" and "onsite in", and told the recruiter
     * "nobody in the pool has shared a city" — a hard-coded claim that was both
     * unverified and, by the time `criteria.ts` grew a location evaluator,
     * false. Scout was refusing a filter the engine then quietly applied.
     *
     * India / US route to the challenge vs cohort pools in pool-brief.ts and
     * must not land here.
     */
    id: "candidate_location",
    match:
      /\b(in|from|based in|located in|living in|hiring in)\s+(the\s+)?(uk|united kingdom|canada|europe|australia|singapore|uae|dubai|germany|japan)\b/i,
    reply:
      "I don't have a candidate pool in that country — the tracks I can search are in India, plus the US cohort.",
    instead:
      "Say India or US, or name the track (Claude challenge, cohort, hackathon).",
  },
  {
    id: "challenge_track",
    match:
      /\b(claude challenge|60[- ]day|sixty[- ]day|challenge track|certificate holders?|certified)\b/i,
    reply:
      "I can only search the AI Cohort right now. The 60-day and Claude challenge tracks aren't in the searchable pool yet — those members haven't been asked for recruiter visibility.",
    instead:
      "I can save this as a requirement so you're told when that pool opens.",
    // The challenge cohort *is* searchable once the pool is open, and a refusal
    // that has stopped being true is worse than no refusal: the recruiter is
    // turned away from the largest thing the platform has.
    onlyWhen: () => !hireChallengePool().enabled,
  },
  {
    id: "education",
    match:
      /\b(college|university|iit|nit|bits|tier[- ]?[123]|degree|b\.?tech|graduat(e|ion) year|cgpa|gpa|marks|percentage)\b/i,
    reply:
      "I don't rank on college or degree. The whole point of the evidence scoring is that it doesn't need them.",
    instead:
      "If you want a proxy for depth, weight code correctness or first-attempt passes instead — those are measured.",
  },
  {
    id: "resume",
    match: /\b(resume|cv|upload|parse|attach)\b/i,
    reply:
      "There's no resume search here. Four members of the pool have even uploaded one, and a resume is a claim rather than evidence.",
    instead:
      "Everything I rank on is work the platform verified — missions passed, first-attempt rate, commit days, graded projects.",
  },
  {
    id: "notice_of_candidate",
    match: /\b(notice period of|serving notice|when can they join|joining date|availability of)\b/i,
    reply:
      "Candidate notice periods aren't shared with me — that's opt-in and currently unfilled.",
    instead:
      "Your notice ceiling is on the requirement, and each match is flagged availability-unconfirmed.",
  },
];

/**
 * Every unsupported thing this message asks for.
 *
 * One message routinely asks for two — "students from india who completed the
 * claude challenge" is both a location filter and a track we cannot search.
 * Answering only the first leaves the recruiter believing the second was
 * accepted, which is the same failure in a smaller form.
 *
 * A protected-attribute request short-circuits the list: it is a refusal, not
 * a capability gap, and it must not arrive softened by offers about something
 * else in the same sentence.
 */
export function findUnsupported(message: string): UnsupportedFilter[] {
  const m = message.trim();
  if (!m) return [];
  const hits = UNSUPPORTED_FILTERS.filter(
    (f) => f.match.test(m) && (f.onlyWhen?.() ?? true),
  );
  const protectedHit = hits.find((f) => f.id === "protected_attribute");
  return protectedHit ? [protectedHit] : hits;
}

/** The reply for one or more unsupported asks, ready to show. */
export function unsupportedReply(found: UnsupportedFilter[]): string {
  if (found.length === 0) return "";
  if (found.length === 1) {
    const f = found[0]!;
    return f.instead ? `${f.reply} ${f.instead}` : f.reply;
  }
  // Several gaps: state each plainly, then a single way forward, so the reply
  // does not become a wall of apologies.
  const reasons = found.map((f) => f.reply).join(" ");
  const instead = found.find((f) => f.instead)?.instead;
  return instead ? `${reasons} ${instead}` : reasons;
}

/**
 * What Scout *can* do, in the recruiter's words.
 *
 * Used when someone asks what it is capable of, and as the tail of an
 * unsupported answer so the conversation has somewhere to go.
 */
export const SUPPORTED_SUMMARY =
  "I match on the role and stack you need, the seniority band, and verified work from the platform — missions passed, first-attempt rate, commit days, graded projects and interview scores. You choose which of those to weight most.";
