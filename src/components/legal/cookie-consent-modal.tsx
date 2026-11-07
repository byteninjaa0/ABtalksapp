"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useCookieConsent,
  type CookieChoice,
} from "@/components/legal/cookie-consent-provider";

/**
 * Bottom-corner cookie banner.
 * Mobile: compact card (short copy, tight padding, smaller buttons) so it
 * does not dominate the screen. Desktop: slightly roomier CodeSignal-style card.
 *
 * Not a dialog: no overlay, no focus trap. Ignoring it means no attribution
 * cookies until a choice is made (middleware gates on consent).
 */
export function CookieConsentModal() {
  const { isOpen, choice, decide, close, isPreferencesOpen, openPreferences } =
    useCookieConsent();
  const [pending, setPending] = useState<CookieChoice | null>(null);

  // Only closable once a choice exists — i.e. when reopened from /cookies.
  const dismissible = choice !== null;

  useEffect(() => {
    if (!isOpen || !dismissible || isPreferencesOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, dismissible, isPreferencesOpen, close]);

  if (!isOpen || isPreferencesOpen) return null;

  async function onChoose(next: CookieChoice) {
    setPending(next);
    try {
      await decide(next);
    } finally {
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className={cn(
        // Mobile: ~19rem; desktop: up to 23rem.
        "fixed z-100 w-[min(calc(100%-1.5rem),19rem)] sm:w-[min(calc(100%-2rem),23rem)]",
        "left-3 right-auto sm:left-4",
        "bottom-3 sm:bottom-5 md:bottom-6",
        "overflow-hidden rounded-lg border border-border/80 bg-background shadow-xl sm:rounded-xl sm:shadow-2xl",
        "theme-klymb-brand",
      )}
    >
      <div className="h-1 w-full bg-primary sm:h-1.5" aria-hidden="true" />

      <div className="p-3.5 sm:p-4">
        <div className="flex items-start gap-2">
          <div className="flex-1 space-y-1">
            <p className="text-xs font-semibold text-foreground sm:text-sm">
              Cookie &amp; Privacy Choices
            </p>
            <p className="text-xs leading-snug text-muted-foreground sm:text-[13px] sm:leading-relaxed">
              <span className="sm:hidden">
                We use essential cookies for sign-in and security, plus optional
                analytics to improve Klymb AI.{" "}
                <Link
                  href="/cookies"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Details
                </Link>
                .
              </span>
              <span className="hidden sm:inline">
                We use cookies to make Klymb AI work. Essential cookies are required
                for sign-in, security, and keeping your session active. We also use
                optional analytics cookies to understand product usage and improve the platform.{" "}
                <Link
                  href="/terms"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Terms
                </Link>
                {" · "}
                <Link
                  href="/privacy"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Privacy
                </Link>
                {" · "}
                <Link
                  href="/cookies"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Cookie Policy
                </Link>
                .
              </span>
            </p>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={close}
              aria-label="Close cookie choices"
              className="shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:p-1"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose("all")}
            className={cn(
              "flex h-9 w-full items-center justify-center rounded-md sm:h-9",
              "bg-primary px-3 text-xs font-semibold tracking-wide sm:text-xs",
              "text-primary-foreground transition-colors hover:bg-primary/90",
              "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              choice === "all" &&
                "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
            )}
          >
            {pending === "all" ? "…" : "Accept all"}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onChoose("essential")}
              className={cn(
                "inline-flex h-8.5 items-center justify-center rounded-md border border-border sm:h-9",
                "bg-background px-2 text-[11px] font-semibold tracking-wide sm:px-3 sm:text-xs",
                "text-foreground transition-colors hover:bg-muted",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                choice === "essential" && "ring-1 ring-primary/50",
              )}
            >
              {pending === "essential" ? "…" : "Necessary only"}
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={openPreferences}
              className={cn(
                "inline-flex h-8.5 items-center justify-center rounded-md border border-border sm:h-9",
                "bg-muted/50 px-2 text-[11px] font-semibold tracking-wide sm:px-3 sm:text-xs",
                "text-foreground transition-colors hover:bg-muted",
                "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
