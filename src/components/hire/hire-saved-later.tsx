"use client";

import { useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronLeft, UserRound } from "lucide-react";
import { toast } from "sonner";
import { refPublicId } from "@/features/hire/candidate-ref";
import { useHireDesk } from "@/components/hire/hire-desk-context";
import {
  DESK_SHORTLIST_EVENT,
  DESK_SHORTLIST_KEY,
  readDeskShortlist,
  toggleDeskShortlist,
  type DeskShortlistItem,
} from "@/components/hire/desk-shortlist";
import {
  guestCartHas,
  toggleGuestCart,
} from "@/components/hire/guest-cart";

/**
 * A cached snapshot, because `useSyncExternalStore` compares by reference and
 * `readDeskShortlist()` parses a fresh array every call — returning that
 * directly is an infinite render loop. The raw string is the cache key: it
 * changes exactly when the list does.
 */
const EMPTY: DeskShortlistItem[] = [];
let cachedRaw: string | null = null;
let cachedRows: DeskShortlistItem[] = EMPTY;

function savedSnapshot(): DeskShortlistItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(DESK_SHORTLIST_KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedRows = readDeskShortlist();
  }
  return cachedRows;
}

function subscribeSaved(onChange: () => void): () => void {
  window.addEventListener(DESK_SHORTLIST_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DESK_SHORTLIST_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Saved for later — a private holding list on this device.
 *
 * Deliberately not the Shortlist. Nothing here has been shown to the ABTalks
 * team: a saved candidate is one the recruiter is still thinking about, and
 * moving them to the Shortlist is the act that puts them in front of anyone.
 * Keeping the two apart is what lets a recruiter browse without every click
 * feeling like a commitment.
 *
 * Storage is `desk-shortlist.ts` (localStorage), which already existed and
 * already fed the header count — this view is what that count was counting all
 * along. It stays device-local on purpose; the Shortlist is the thing that
 * survives sign-in, because that is the list the team acts on.
 */
export function HireSavedLater() {
  const { closePod, openPod } = useHireDesk();
  const [moving, setMoving] = useState(false);

  // The list lives in localStorage, so it is an external store — reading it in
  // an effect would set state on every mount and render twice for nothing.
  const rows = useSyncExternalStore(subscribeSaved, savedSnapshot, () => EMPTY);

  function remove(item: DeskShortlistItem) {
    toggleDeskShortlist(item);
    toast.success("Removed from Saved for later");
  }

  /**
   * Move one saved candidate onto the Shortlist.
   *
   * `toggleGuestCart` is a toggle, so it is only called when the candidate is
   * not already there — otherwise "move" would quietly remove them from the
   * Shortlist instead of adding them.
   */
  function promote(item: DeskShortlistItem): boolean {
    const already = guestCartHas(item.candidateRef);
    if (!already) {
      toggleGuestCart({
        candidateRef: item.candidateRef,
        jobRole: item.jobRole,
        totalScore: 0,
      });
    }
    toggleDeskShortlist(item);
    return !already;
  }

  function moveOne(item: DeskShortlistItem) {
    const added = promote(item);
    toast.success(
      added ? "Moved to Shortlist" : "Already on your Shortlist — removed here",
    );
  }

  function moveAll() {
    if (rows.length === 0 || moving) return;
    setMoving(true);
    const all = [...rows];
    let added = 0;
    for (const item of all) if (promote(item)) added += 1;
    setMoving(false);
    toast.success(
      added === all.length
        ? `Moved ${added} to your Shortlist`
        : `Moved ${added} — the rest were already on your Shortlist`,
    );
    openPod();
  }

  return (
    <section className="hire-pod hire-pod--saved" aria-label="Saved for Later">
      <header className="hire-pod__header">
        <button type="button" className="hire-back" onClick={closePod}>
          <ChevronLeft aria-hidden="true" />
          Back to Scout
        </button>
        <h1 className="hire-pod__title">Saved for Later</h1>
        <p className="hire-pod__sub">
          A private holding list on this device. Nothing is sent to our team from
          here — move a candidate to your Shortlist when you are ready to request
          them.
        </p>
      </header>

      <div className="hire-pod__main">
        <div className="hire-pod__col">
          <p className="hire-pod__privacy">
            <strong>Privacy protected.</strong> Candidates are shown by reference
            ID. Names and contact details stay hidden until you place a request
            and our team confirms the engagement.
          </p>

          <div className="hire-pod__list">
            {rows.length === 0 ? (
              <div className="pod-empty">
                <p className="pod-empty__copy">
                  Nothing saved yet. Use <strong>Save for later</strong> on a
                  card to keep someone here while you keep looking.
                </p>
                <button
                  type="button"
                  className="pod-empty__cta"
                  onClick={closePod}
                >
                  Back to Scout
                </button>
              </div>
            ) : (
              rows.map((row) => {
                const publicId = refPublicId(row.candidateRef);
                const onShortlist = guestCartHas(row.candidateRef);
                return (
                  <article key={row.candidateRef} className="hire-pod__card">
                    <div className="hire-pod__who">
                      <span className="desk-card__avatar" aria-hidden="true">
                        <UserRound className="size-6" />
                      </span>
                      <div>
                        <p className="hire-pod__role">{row.jobRole}</p>
                        <p className="hire-pod__ref">{publicId}</p>
                      </div>
                    </div>
                    <div className="hire-pod__actions">
                      <button
                        type="button"
                        className="hire-pod__move"
                        onClick={() => moveOne(row)}
                      >
                        {onShortlist ? "Already shortlisted" : "Move to Shortlist"}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="hire-pod__drop"
                        onClick={() => remove(row)}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <aside className="hire-pod__request">
          <p className="hire-pod__kicker">Saved for Later</p>
          <h2>Ready to request?</h2>

          <p className="hire-pod__savedcount">
            {rows.length} candidate{rows.length === 1 ? "" : "s"} saved
          </p>

          <p className="hire-pod__note">
            Saved candidates are just for you. Moving one to the Shortlist is what
            puts it in front of our team when you place a request.
          </p>

          <button
            type="button"
            className="hire-pod__submit"
            disabled={rows.length === 0 || moving}
            onClick={moveAll}
          >
            <ArrowRight className="size-4" aria-hidden="true" />
            Move all to Shortlist
          </button>
        </aside>
      </div>
    </section>
  );
}
