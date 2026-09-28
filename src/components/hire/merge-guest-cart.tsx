"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  adoptGuestScoutSessionAction,
  recordSampleDemandAction,
} from "@/app/actions/hire-actions";
import {
  clearGuestSession,
  readGuestSession,
} from "@/components/hire/guest-session";
import {
  clearGuestMatches,
  readGuestMatches,
} from "@/components/hire/guest-matches-store";
import { mergeGuestCartAction } from "@/app/actions/talent-actions";
import { placeBulkEngagementRequestAction } from "@/app/actions/hire-request-actions";
import {
  guestCartProgramIds,
  guestCartWithoutMerged,
  readGuestCart,
  writeGuestCart,
} from "@/components/hire/guest-cart";
import {
  clearPendingDemand,
  readPendingDemand,
} from "@/components/hire/pending-demand";
import {
  clearPendingCheckout,
  readPendingCheckout,
  saveCheckoutFlash,
} from "@/components/hire/pending-checkout";

/**
 * After an approved sign-in: move the guest cart onto the account, and if they
 * had already hit Request, place that request so they do not have to click again.
 *
 * The guest cart is the only copy of a shortlist somebody built before they had
 * an account, so nothing here removes an item until the server has confirmed
 * that item is on the account. It used to drop every program candidate whenever
 * the action returned `ok` — and the action returned `ok` even when it had
 * merged nothing, which is exactly what happens while a recruiter is still
 * waiting on approval. That combination erased the shortlist they signed up to
 * keep, silently, on the ordinary signup path.
 */
export function MergeGuestCart() {
  const running = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    // `running` stops two renders racing; `done` latches only on success, so a
    // failed merge is retried on the next mount instead of being lost for the
    // rest of the session.
    if (running.current || done.current) return;
    running.current = true;

    void (async () => {
      try {
        const pendingDemand = readPendingDemand();
        if (pendingDemand) {
          const recorded = await recordSampleDemandAction({
            spec: pendingDemand.spec,
          });
          if (recorded.ok) {
            clearPendingDemand();
            toast.success("Noted — we'll be in touch when someone matches.");
          } else {
            toast.error(recorded.message);
          }
        }

        const items = readGuestCart();
        const programIds = guestCartProgramIds(items);

        if (programIds.length > 0) {
          const merged = await mergeGuestCartAction(programIds);

          if (!merged.ok) {
            // Cart untouched, so the next visit retries with everything intact.
            toast.error(
              `${merged.message} Your ${programIds.length} shortlisted candidate(s) are still saved here.`,
            );
            return;
          }

          // Keep anything the server did not confirm. A partial merge used to
          // report success and take the failures down with it.
          writeGuestCart(guestCartWithoutMerged(items, merged.data.mergedIds));

          if (merged.data.failedIds.length > 0) {
            toast.error(
              `${merged.data.failedIds.length} of ${programIds.length} candidate(s) could not be added yet — they are still saved here.`,
            );
            return;
          }
        }

        const guestBrief = readGuestSession();
        // `searched` as well as a typed turn. The guard used to require a
        // `role: "user"` message, so a guest who built their requirement
        // entirely from the suggestion chips — never typing anything — had a
        // finished search that adoption silently skipped, and it died with the
        // browser copy. A search that ran is work worth keeping however the
        // requirement was assembled.
        if (
          guestBrief &&
          (guestBrief.searched ||
            guestBrief.messages.some((m) => m.role === "user"))
        ) {
          // Identity only. The scores, tiers and ranking this browser is holding
          // are the server's to decide again — it re-tests every ref against the
          // same visibility and eligibility rules the search itself applies.
          const candidateRefs = (readGuestMatches()?.matches ?? [])
            .map((m) => m.candidateRef)
            .filter(Boolean)
            // A sample card names nobody — `decodeCandidateRef` rejects a
            // `SAMPLE:` ref by design. Sending them anyway only inflates the
            // server's `skipped` count and makes the "still available" message
            // report a loss that never happened.
            .filter((ref) => !ref.startsWith("SAMPLE:"));

          const adopted = await adoptGuestScoutSessionAction({
            spec: guestBrief.spec,
            summary: guestBrief.summary,
            searched: guestBrief.searched,
            messages: guestBrief.messages,
            ...(candidateRefs.length > 0 ? { candidateRefs } : {}),
          });

          if (!adopted.ok) {
            // The recruiter who is still awaiting approval lands here, and this
            // used to be silent: the result was discarded and the latch had
            // already been set, so the search they had just run was dropped
            // without a word and never retried.
            //
            // Nothing local is cleared, so the work is still here and the next
            // visit adopts it. The message says "on this device" because that
            // is the truth — approval usually arrives hours later, and if they
            // come back on another machine this browser's copy is all there was.
            toast.error(
              `${adopted.message} Your search is kept on this device and will be saved to your account when access is approved.`,
            );
            return;
          }

          // Only now. Latching before the call meant a failure was never retried
          // for the rest of the session.
          done.current = true;

          if (adopted.data.skipped > 0 && adopted.data.adopted > 0) {
            toast.info(
              `${adopted.data.adopted} of the ${adopted.data.adopted + adopted.data.skipped} candidates you saw are still available.`,
            );
          }

          // Move to the saved copy, THEN forget the browser's.
          //
          // Order matters. `/hire/[requestId]` is server-rendered from the
          // request and its matches, and ScoutChat skips guest hydration
          // entirely when it has an `initialRequestId` — so the recruiter lands
          // on the adopted work rather than on an empty desk.
          //
          // Clearing is what makes the count above mean anything. Leaving the
          // guest copy in place would keep rendering all twenty candidates from
          // localStorage while the account holds eighteen, so the recruiter
          // would be told two were dropped and then shown twenty anyway, and
          // would go on working against a copy nothing writes to.
          //
          // Only on success. A recruiter still awaiting approval returned above
          // with everything untouched — that copy is the only one there is, and
          // it is what the next visit adopts.
          // A full navigation, not router.replace. The session cookie is
          // minutes old and `/hire/[requestId]` is server-rendered behind
          // `requireRecruiter`; the sign-in forms already take this route for
          // the same reason, noting that an App Router transition landing on a
          // server-gated page does not settle. A soft transition here left the
          // recruiter on /hire — the adopted search showed in the side panel,
          // because the request really had been created, while the desk stayed
          // empty. That is the reported bug.
          //
          // Navigate first, clear second, as before: if the unload beats these
          // two calls the browser copy simply survives and the next visit
          // re-adopts it, which the action already deduplicates. Clearing first
          // would risk throwing away the only copy if the navigation failed.
          window.location.href = `/hire/${adopted.data.requestId}`;
          clearGuestSession();
          clearGuestMatches();
        } else {
          done.current = true;
        }

        const pending = readPendingCheckout();
        if (!pending || pending.candidateRefs.length === 0) return;

        const placed = await placeBulkEngagementRequestAction({
          candidateRefs: pending.candidateRefs,
          note: pending.note,
        });
        if (!placed.ok) {
          toast.error(placed.message);
          return;
        }
        clearPendingCheckout();
        saveCheckoutFlash({
          placed: placed.data.placed,
          skipped: placed.data.skipped,
        });
        window.location.href = "/hire/requests";
      } finally {
        running.current = false;
      }
    })();
    // Once per mount, which is what the `running` / `done` refs above assume.
    // The dependency used to be `[router]`, which was stable and so meant the
    // same thing; the router is gone now that the hand-off is a full
    // navigation.
  }, []);

  return null;
}
