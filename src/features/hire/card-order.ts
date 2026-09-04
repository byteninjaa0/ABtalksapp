/**
 * The one comparator every surface that shows candidate cards must use.
 *
 * Cards reach a screen from three places — a live search, the guest session
 * store, and persisted `TalentRequestMatch` rows — and each of them re-sorts.
 * Every one of them was sorting on `score`, and `score` is the wrong number.
 *
 * `score` is ROLE FIT: how well the candidate meets the stated requirement,
 * deliberately ignoring how much of that requirement we could verify.
 * `rankKey` is the engine's own final POSITION (`rankCandidates107` in
 * rank.ts) — which is what keeps a thoroughly-evidenced 85 above a
 * barely-evidenced 88.
 *
 * It is the position rather than the sort score on purpose. The engine breaks
 * ties on `evidenceStrength` and then `standing`, and a card carries neither;
 * exporting the score meant every tie collapsed to an alphabetical fallback
 * here and the screen showed a different order from the one computed. The
 * benchmark's order-integrity gate failed 8 of 8 queries on exactly that.
 *
 * Sorting by `score` therefore threw the ranking away at the last step and put
 * the least reliable results on top — the ranking equivalent of the location
 * filter that claimed one thing and did another. Keeping the rule in one pure
 * function means it can be tested, and means the next surface that renders
 * cards cannot quietly reintroduce it.
 *
 * Pure and shared: no `server-only`, because `match-results.tsx` is a client
 * component. It touches nothing but two plain numbers and a string.
 */

export type OrderableCard = {
  candidateRef: string;
  score: number;
  rankKey?: number;
};

/**
 * Descending by confidence-adjusted rank, then by role fit, then by a stable
 * arbitrary key so a list never shuffles between renders.
 *
 * The `?? score` fallback is for cards written before `rankKey` existed —
 * persisted rows and stored guest sessions — so an upgrade degrades to the old
 * ordering rather than to an empty or random one.
 */
export function compareCards(a: OrderableCard, b: OrderableCard): number {
  return (
    (b.rankKey ?? b.score) - (a.rankKey ?? a.score) ||
    b.score - a.score ||
    a.candidateRef.localeCompare(b.candidateRef)
  );
}

/** Convenience: a new array in display order. */
export function orderCards<T extends OrderableCard>(cards: T[]): T[] {
  return [...cards].sort(compareCards);
}
