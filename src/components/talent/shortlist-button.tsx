"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { toggleShortlistAction } from "@/app/actions/talent-actions";
import { guestCartHas, toggleGuestCart } from "@/components/hire/guest-cart";
import { useHireAuth } from "@/components/hire/hire-auth-provider";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Add / remove a candidate from the cart.
 *
 * Program members still go through RecruiterShortlistItem (FK to
 * ProgramMember). Everyone else — Claude, 60-day, hackathon — lives in
 * the device cart keyed on candidateRef. Never write those ids into
 * memberId: that column addresses a ProgramMember row.
 */
export function ShortlistButton({
  candidateRef,
  programMemberId,
  initialShortlisted,
  compact = false,
  jobRole,
  totalScore,
  onToggle,
}: {
  candidateRef: string;
  /** Set only for US-cohort / program members. */
  programMemberId?: string | null;
  initialShortlisted: boolean;
  jobRole?: string;
  totalScore?: number;
  /** Icon-only, for dense rows. */
  compact?: boolean;
  onToggle?: (inCart: boolean) => void;
}) {
  const { approved } = useHireAuth();
  const useDb = Boolean(approved && programMemberId);
  const [inCart, setInCart] = useState(initialShortlisted);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (useDb) return;
    setInCart(guestCartHas(candidateRef));
  }, [candidateRef, useDb]);

  function toggleLocal() {
    const next = toggleGuestCart({
      candidateRef,
      jobRole: jobRole ?? "Candidate",
      totalScore: totalScore ?? 0,
    });
    setInCart(next);
    onToggle?.(next);
    toast.success(next ? "Added to cart" : "Removed from cart");
  }

  function toggle() {
    if (!useDb) {
      toggleLocal();
      return;
    }
    startTransition(async () => {
      const result = await toggleShortlistAction({ memberId: programMemberId! });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setInCart(result.data.shortlisted);
      onToggle?.(result.data.shortlisted);
      toast.success(
        result.data.shortlisted ? "Added to cart" : "Removed from cart",
      );
    });
  }

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
