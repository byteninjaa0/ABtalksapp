"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setCookieConsentAction } from "@/app/actions/legal-actions";
import { COOKIE_POLICY_VERSION } from "@/lib/legal-constants";

export type CookieChoice = "all" | "limited" | "essential";

const CONSENT_COOKIE_NAME = "klymb_consent";

type ConsentContextValue = {
  /** null while unread (SSR + first paint) or when no valid choice is stored. */
  choice: CookieChoice | null;
  /** True once the cookie has been read on the client. */
  ready: boolean;
  /** True when the chooser should be visible. */
  isOpen: boolean;
  open: () => void;
  /** Closes a chooser reopened from /cookies. No-op while undecided. */
  close: () => void;
  /** True when the category-level preferences dialog is open. */
  isPreferencesOpen: boolean;
  openPreferences: () => void;
  closePreferences: () => void;
  decide: (choice: CookieChoice) => Promise<void>;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

function readStoredChoice(): CookieChoice | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`))
    ?.slice(CONSENT_COOKIE_NAME.length + 1);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot === -1) return null;
  // A policy bump invalidates every stored choice and re-prompts.
  if (raw.slice(dot + 1) !== COOKIE_POLICY_VERSION) return null;

  const stored = raw.slice(0, dot);
  return stored === "all" || stored === "limited" || stored === "essential"
    ? stored
    : null;
}

export function CookieConsentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [choice, setChoice] = useState<CookieChoice | null>(null);
  const [ready, setReady] = useState(false);
  const [manuallyOpened, setManuallyOpened] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);

  // Read on mount rather than via cookies() in the root layout — that would
  // opt the entire app into dynamic rendering and deopt every static page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readStoredChoice());
    setReady(true);
  }, []);

  const open = useCallback(() => setManuallyOpened(true), []);
  const close = useCallback(() => setManuallyOpened(false), []);
  const openPreferences = useCallback(() => setIsPreferencesOpen(true), []);
  const closePreferences = useCallback(() => setIsPreferencesOpen(false), []);

  const decide = useCallback(async (next: CookieChoice) => {
    // Attribution params are only on the URL at first landing; middleware no
    // longer captures them pre-consent, so replay them through the action.
    const params = new URLSearchParams(window.location.search);
    const result = await setCookieConsentAction({
      choice: next,
      ref: params.get("ref"),
      src: params.get("s"),
    });
    if (!result.ok) return;

    setChoice(next);
    setManuallyOpened(false);
    setIsPreferencesOpen(false);
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({
      choice,
      ready,
      isOpen: ready && (manuallyOpened || choice === null),
      open,
      close,
      isPreferencesOpen,
      openPreferences,
      closePreferences,
      decide,
    }),
    [choice, ready, manuallyOpened, isPreferencesOpen, open, close, openPreferences, closePreferences, decide],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useCookieConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) {
    throw new Error("useCookieConsent must be used within CookieConsentProvider");
  }
  return ctx;
}
