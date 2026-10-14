"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/shared/wordmark";

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
            <span className="hidden sm:inline">Back to dashboard</span>
            <span className="sm:hidden">Back</span>
          </button>

          <span
            className="hidden h-5 w-px shrink-0 bg-border/80 sm:block"
            aria-hidden="true"
          />

          <Link
            href="/"
            className="logo-link focus-spark shrink-0"
            aria-label="Klymb AI home"
          >
            <Wordmark size="lg" className="logo-image" />
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
