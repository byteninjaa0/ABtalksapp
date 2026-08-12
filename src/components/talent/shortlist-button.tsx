"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { toggleShortlistAction } from "@/app/actions/talent-actions";
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
}: {
  memberId: string;
  initialShortlisted: boolean;
  /** Icon-only, for dense rows. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [inCart, setInCart] = useState(initialShortlisted);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await toggleShortlistAction({ memberId });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setInCart(result.data.shortlisted);
      toast.success(result.data.shortlisted ? "Added to cart" : "Removed from cart");
      router.refresh();
    });
  }

  const label = inCart ? "In cart" : "Add to cart";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={toggle}
      aria-label={inCart ? "Remove from cart" : "Add to cart"}
      title={label}
      className={cn(
        buttonVariants({
          variant: inCart ? "secondary" : "outline",
          size: compact ? "icon" : "sm",
        }),
        "shrink-0 gap-1.5 disabled:opacity-50",
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : inCart ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <ShoppingCart className="size-3.5" aria-hidden="true" />
      )}
      {!compact && label}
    </button>
  );
}
