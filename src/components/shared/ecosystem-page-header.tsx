"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function EcosystemPageHeader({ className }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function handleBack() {
    if (typeof window !== "undefined") {
      if (window.history.length > 1) {
        router.back();
        return;
      }
      if (document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (refUrl.origin === window.location.origin) {
            router.push(refUrl.pathname + refUrl.search);
            return;
          }
        } catch {
          // ignore invalid URL
        }
      }
    }
    router.push("/");
  }

  return (
    <header className={cn("abt-header z-40", className)}>
      <div className="abt-header-inner">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <button
            type="button"
            onClick={handleBack}
            className="focus-spark inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-xs transition-colors hover:bg-white hover:text-foreground active:scale-[0.98] sm:px-3 sm:py-1.5 sm:text-sm"
            aria-label="Go back to previous page"
            title="Back to previous page"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            {/* "Back", not "Back to dashboard". The handler is `router.back()`
                — it returns to whatever page you came from and has never gone
                to the dashboard, so the old label was wrong for a student
                arriving from /jobs as much as for a recruiter, who has no
                student dashboard to be sent to at all.

                It also disagreed with this button's own `aria-label` and
                `title`, both of which already said "previous page": a visible
                label that is not contained in the accessible name is what
                WCAG 2.5.3 is about, and it breaks voice control — saying
                "click Back to dashboard" matched nothing.

                One span now, because both breakpoints say the same word. */}
            <span>Back</span>
          </button>

          <span
            className="hidden h-5 w-px shrink-0 bg-border/80 sm:block"
            aria-hidden="true"
          />

          <Link
            href="/"
            className="logo-link focus-spark shrink-0"
            aria-label="ABTalks home"
          >
            <Image
              src="/abtalks-logo.png"
              alt="ABTalks"
              width={300}
              height={84}
              priority
              className="logo-image"
            />
          </Link>
        </div>

        <nav
          className="flex shrink-0 items-center gap-3 text-xs font-medium sm:gap-4 sm:text-sm text-muted-foreground"
          aria-label="Legal and support links"
        >
          <Link
            href="/terms"
            className={cn(
              "transition-colors hover:text-foreground",
              pathname === "/terms" && "text-foreground font-semibold",
            )}
          >
            Terms
          </Link>
          <Link
            href="/privacy"
            className={cn(
              "transition-colors hover:text-foreground",
              pathname === "/privacy" && "text-foreground font-semibold",
            )}
          >
            Privacy
          </Link>
          <Link
            href="/contact"
            className={cn(
              "transition-colors hover:text-foreground",
              pathname === "/contact" && "text-foreground font-semibold",
            )}
          >
            Contact
          </Link>
        </nav>
      </div>
    </header>
  );
}
