"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ShoppingCart } from "lucide-react";
import { MatchCard, type MatchCardData } from "@/components/hire/match-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Show the best match, then the rest on request.
 *
 * A wall of near-identical cards makes a recruiter skim and leave; leading with
 * one and asking whether they want more is the difference between reading a
 * result and scrolling past it.
 */
const INITIAL_VISIBLE = 1;

export function MatchResults({
  matches,
  cartCount,
}: {
  matches: MatchCardData[];
  /**
   * Server-rendered, and correct after every toggle because the shortlist
   * action revalidates the /hire layout. A local delta on top of it counted
   * each change twice once that revalidation started working.
   */
  cartCount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  // Seeded from the server once, then owned here. Reading it from the prop on
  // every render double-counted: the toggle moved it, and the refresh that
  // followed moved it again.
  const [count, setCount] = useState(cartCount);
  const visible = showAll ? matches : matches.slice(0, INITIAL_VISIBLE);
  const hidden = matches.length - visible.length;

  return (
    <div className="space-y-4">
      <ul className="space-y-4">
        {visible.map((m, i) => (
          <li key={`${m.programMemberId ?? "unknown"}-${i}`}>
            <MatchCard
              match={m}
              onCartToggle={(inCart) => setCount((c) => Math.max(0, c + (inCart ? 1 : -1)))}
            />
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full gap-1.5",
          )}
        >
          View {hidden} more {hidden === 1 ? "candidate" : "candidates"}
          <ChevronDown className="size-4" aria-hidden="true" />
        </button>
      )}

      {showAll && matches.length > INITIAL_VISIBLE && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mx-auto block text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Show fewer
        </button>
      )}

      {/* The cart is only worth pointing at once something is in it. */}
      {count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold">{count}</span>{" "}
            {count === 1 ? "candidate" : "candidates"} in your cart — send
            one request for all of them.
          </p>
          <Link
            href="/talent/shortlist"
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
          >
            <ShoppingCart className="size-3.5" aria-hidden="true" />
            Review &amp; request
          </Link>
        </div>
      )}
    </div>
  );
}
