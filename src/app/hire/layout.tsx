import type { ReactNode } from "react";
import Image from "next/image";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRecruiter } from "@/lib/program-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HireLayout({ children }: { children: ReactNode }) {
  const { userId } = await requireRecruiter();

  // The cart is the whole point of shortlisting, so its size belongs in the
  // chrome. Without it there was no sign a cart existed at all.
  const cartCount = await prisma.recruiterShortlistItem.count({
    where: { recruiterUserId: userId },
  });

  return (
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* The recruiter portal has its own header rather than AppHeader —
              which is why the theme control and the mark were missing here.
              Both are the same components the rest of the app uses. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Link href="/" className="logo-link focus-spark shrink-0">
              {/* `logo-image` is not decoration: the asset is a light mark, and
                  that class carries the invert() that keeps it visible on a
                  light background. Sizing it with plain utilities made the logo
                  disappear the moment the new theme toggle switched to light. */}
              <Image
                src="/abtalks-logo.png"
                alt="ABTalks"
                width={300}
                height={84}
                priority
                className="logo-image"
              />
            </Link>
            <span className="hidden rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:inline">
              Hire
            </span>
          </div>

          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/hire"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              New search
            </Link>
            <Link
              href="/hire/requests"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Requests
            </Link>
            <Link
              href="/talent"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              <span className="hidden sm:inline">Browse pool</span>
              <span className="sm:hidden">Pool</span>
            </Link>
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
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
