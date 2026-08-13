"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { RecruiterAccountMenu } from "@/components/hire/recruiter-account-menu";
import { useHireAuth } from "@/components/hire/hire-auth-provider";
import { readGuestCart } from "@/components/hire/guest-cart";
import { signOutAction } from "@/app/actions/auth-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import type { RecruiterAccountSnapshot } from "@/features/hire/recruiter-account-types";
import { cn } from "@/lib/utils";

export function HireChrome({
  account,
  serverCartCount,
  pendingName,
  children,
}: {
  account: RecruiterAccountSnapshot | null;
  serverCartCount: number;
  pendingName: string | null;
  children: React.ReactNode;
}) {
  const { approved, openAuth } = useHireAuth();
  const [guestCount, setGuestCount] = useState(0);

  useEffect(() => {
    const sync = () => setGuestCount(readGuestCart().length);
    sync();
    window.addEventListener("abtalks-hire-cart", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("abtalks-hire-cart", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const cartCount = approved ? serverCartCount : guestCount;

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="logo-link focus-spark shrink-0">
              <Image
                src="/abtalks-logo.png"
                alt="ABTalks"
                width={300}
                height={84}
                priority
                className="logo-image"
              />
            </Link>
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Hire
            </span>
          </div>

          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            {approved && (
              <Link
                href="/hire/requests"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Requests
              </Link>
            )}
            <Link
              href="/talent/shortlist"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5",
              )}
            >
              <ShoppingCart className="size-3.5" aria-hidden="true" />
              Cart
              {cartCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
            <ThemeToggle />
            {account ? (
              <RecruiterAccountMenu account={account} />
            ) : pendingName ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="rounded-lg px-2 py-1 text-left text-xs"
                  title="Application pending review"
                >
                  <span className="block font-medium">{pendingName}</span>
                  <span className="text-muted-foreground">Pending · Sign out</span>
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("nav")}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
