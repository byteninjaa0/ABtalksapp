"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MatchResults } from "@/components/hire/match-results";
import { readGuestMatches } from "@/components/hire/guest-matches-store";
import { readGuestCart } from "@/components/hire/guest-cart";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GuestMatchesPage() {
  const [ready, setReady] = useState(false);
  const [store, setStore] = useState(readGuestMatches());
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    setStore(readGuestMatches());
    setCartCount(readGuestCart().length);
    setReady(true);
    const sync = () => setCartCount(readGuestCart().length);
    window.addEventListener("abtalks-hire-cart", sync);
    return () => window.removeEventListener("abtalks-hire-cart", sync);
  }, []);

  if (!ready) return null;

  const matches = store?.matches ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/hire"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 gap-1.5",
        )}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to the requirement
      </Link>

      <div className="space-y-2">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Step 2 · Matched profiles
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {matches.length} matched{" "}
          {matches.length === 1 ? "candidate" : "candidates"}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Ranked for {store?.title || "your requirement"} on verified platform
          evidence — missions, commits, projects and interviews.
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No matches saved for this search. Run Scout again.
        </p>
      ) : (
        <>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
            <strong className="font-semibold">Privacy protected.</strong>{" "}
            Candidates are shown by reference ID. Names and contact details stay
            hidden until you place a request and our team confirms the
            engagement.
          </p>
          <MatchResults matches={matches} cartCount={cartCount} />
        </>
      )}
    </div>
  );
}
