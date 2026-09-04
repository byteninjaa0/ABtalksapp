/**
 * The one gate on opted-in availability.
 *
 * `CandidatePreference` holds the only logistics data on the platform:
 * open-to-work, preferred cities, willingness to relocate, work mode, notice
 * and salary expectation. `docs/legal/hire-availability-privacy-note.md` makes
 * two promises about it that were being kept in neither place:
 *
 *   1. **"Turning `openToWork` off removes the candidate from
 *      availability-filtered results immediately."** It did not. `evaluateLocation`
 *      never read `openToWork` at all, and `openToRelocate` short-circuited to a
 *      MET verdict before any other check — so a candidate who had switched
 *      open-to-work off was still matched on, and still labelled, by the exact
 *      fields they had withdrawn.
 *   2. **"Approved recruiters only… not shown on public marketing pages or
 *      unauthenticated routes."** Guest Scout is public and called the same
 *      `toPublicMatch` as the signed-in desk, so a preferred city and a work
 *      mode were rendered to anyone who opened `/hire`.
 *
 * Both are one-line mistakes that no amount of prompt wording can prevent, so
 * the rule lives here as a function every read path calls instead of as a
 * convention every read path has to remember.
 *
 * Deliberately NOT `server-only`: `to-public-match.ts` is the DTO boundary and
 * carries no marker either. Nothing here reaches a database or an environment
 * variable — it is a pure predicate over data the caller already holds.
 */
import type { AvailabilitySnapshot } from "@/features/hire/types";

/**
 * Who is looking.
 *
 * Guest Scout is a public, unauthenticated surface. An approved recruiter is
 * behind a session. There is no third state — a pending recruiter is a guest
 * for this purpose, because approval is what the privacy note gates on.
 */
export type AvailabilityViewer = "guest" | "recruiter";

/**
 * The availability that may be used for matching, or null.
 *
 * A row with `openToWork: false` is a candidate who has withdrawn from
 * availability matching. It is not "unknown" in the sense of never collected,
 * but it must behave identically to unknown everywhere downstream: it cannot
 * make someone a location or work-mode match, and it cannot appear on a card.
 * Returning null rather than a flag is deliberate — a caller that forgets the
 * flag still gets the safe answer.
 */
export function activeAvailability(
  a: AvailabilitySnapshot,
): AvailabilitySnapshot {
  if (!a) return null;
  return a.openToWork ? a : null;
}

/** Only an approved recruiter may see opted-in logistics on a card. */
export function canSeeAvailability(viewer: AvailabilityViewer): boolean {
  return viewer === "recruiter";
}

/**
 * Availability a given viewer may both match on and see rendered.
 *
 * Fails closed: an omitted viewer is a guest. Every call site that wants the
 * recruiter view has to say so.
 */
export function visibleAvailability(
  a: AvailabilitySnapshot,
  viewer: AvailabilityViewer = "guest",
): AvailabilitySnapshot {
  return canSeeAvailability(viewer) ? activeAvailability(a) : null;
}
