"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { mergeGuestCartAction } from "@/app/actions/talent-actions";
import { placeBulkEngagementRequestAction } from "@/app/actions/hire-request-actions";
import { clearGuestCart, readGuestCart } from "@/components/hire/guest-cart";
import {
  clearPendingCheckout,
  readPendingCheckout,
  saveCheckoutFlash,
} from "@/components/hire/pending-checkout";

/**
 * After an approved sign-in: move the guest cart onto the account, and if they
 * had already hit Request, place that request so they do not have to click again.
 */
export function MergeGuestCart() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const items = readGuestCart();
      if (items.length > 0) {
        const merged = await mergeGuestCartAction(items.map((i) => i.memberId));
        if (merged.ok) clearGuestCart();
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
    })();
  }, []);

  return null;
}

