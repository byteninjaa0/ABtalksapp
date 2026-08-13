"use client";

import { useState, useTransition } from "react";
import { Loader2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { toggleShortlistAction } from "@/app/actions/talent-actions";
import { toggleGuestCart } from "@/components/hire/guest-cart";
import { useHireAuth } from "@/components/hire/hire-auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Add / remove a candidate from the cart.
 *
 * This used to be an unlabelled star, which read as "favourite" and left no
 * sign that a cart existed at all — so the only way to request anyone was to
 * open their profile one at a time. It is a cart, and now says so.
 */
export function ShortlistButton({
  memberId,
  initialShortlisted,
  compact = false,
  jobRole,
  totalScore,
  onToggle,
}: {
  memberId: string;
  initialShortlisted: boolean;
  jobRole?: string;
  totalScore?: number;
  /** Icon-only, for dense rows. */
  compact?: boolean;
  /**
   * Lets a parent keep a live count. The server-rendered count in the nav is
   * revalidated too, but that round-trip lands a beat later — clicking should
   * not look like it did nothing while you wait for it.
   */
  onToggle?: (inCart: boolean) => void;
}) {
  const { approved } = useHireAuth();
  const [inCart, setInCart] = useState(initialShortlisted);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!approved) {
      const next = toggleGuestCart({
        memberId,
        jobRole: jobRole ?? "Candidate",
        totalScore: totalScore ?? 0,
      });
      setInCart(next);
      onToggle?.(next);
      toast.success(next ? "Added to cart" : "Removed from cart");
      return;
    }
    startTransition(async () => {
      const result = await toggleShortlistAction({ memberId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setInCart(result.data.shortlisted);
      onToggle?.(result.data.shortlisted);
      toast.success(
        result.data.shortlisted ? "Added to cart" : "Removed from cart",
      );
      // Deliberately no router.refresh(). It remounted the results list and
      // re-seeded its count from a server value that was itself a beat stale,
      // so every click rendered one behind. Live counts are client state; the
      // server-rendered nav badge catches up on the next navigation.
    });
  }

  // "In cart" states a fact and offers no way out. The label is the action.
  const label = inCart ? "Remove from cart" : "Add to cart";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn(
        buttonVariants({
          variant: "secondary",
          size: compact ? "icon" : "lg",
        }),
        "shrink-0 gap-1.5 disabled:opacity-50",
        // Solid in both states so it is legible on a dark card, but once the
        // candidate is in the cart it turns primary-tinted — the state is
        // readable at a glance instead of only from the icon.
        inCart &&
          "bg-primary/15 text-primary hover:bg-primary/25 dark:bg-primary/20 dark:hover:bg-primary/30",
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : inCart ? (
        <X className="size-3.5" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-3.5" aria-hidden="true" />
      )}
      {!compact && label}
    </button>
  );
}
