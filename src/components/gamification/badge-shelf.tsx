"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { markBadgesSeenAction } from "@/app/actions/gamification-actions";
import type { BadgeView } from "@/features/gamification/loaders";
import { cn } from "@/lib/utils";
import { TierShape } from "./tier-shape";

type Evidence = { label?: string; href?: string; sourceType?: string };

function evidenceOf(badge: BadgeView): Evidence | null {
  const raw = badge.evidence;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  const label = typeof e.label === "string" ? e.label : undefined;
  const href = typeof e.href === "string" && e.href.startsWith("/") ? e.href : undefined;
  const sourceType = typeof e.sourceType === "string" ? e.sourceType : undefined;
  return label || href || sourceType ? { label, href, sourceType } : null;
}

/**
 * Plan 151 §11 — badges with the evidence behind them. Rarity is shape + text,
 * never colour alone. Newly earned badges open once, then are marked seen so
 * they never re-announce themselves.
 */
export function BadgeShelf({
  badges,
  compact,
}: {
  badges: BadgeView[];
  compact?: boolean;
}) {
  const earned = useMemo(() => badges.filter((b) => b.earnedAt), [badges]);
  const unseen = useMemo(
    () => earned.filter((b) => !b.seenAt && b.userBadgeId),
    [earned],
  );
  const [modal, setModal] = useState<BadgeView | null>(null);
  const [copied, setCopied] = useState(false);
  const announced = useRef(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Announce the newest unseen badge once, then mark the whole batch seen.
  useEffect(() => {
    if (announced.current || unseen.length === 0) return;
    announced.current = true;
    setModal(unseen[0]);
    const ids = unseen
      .map((b) => b.userBadgeId)
      .filter((id): id is string => Boolean(id))
      .slice(0, 50);
    if (ids.length > 0) void markBadgesSeenAction({ ids });
  }, [unseen]);

  const close = useCallback(() => {
    setModal(null);
    setCopied(false);
  }, []);

  useEffect(() => {
    if (!modal) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, close]);

  async function share(badge: BadgeView) {
    const text = `I earned the “${badge.name}” badge on ABTalks — ${badge.description}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const shown = compact ? earned : badges;
  const modalEvidence = modal ? evidenceOf(modal) : null;

  return (
    <section
      aria-label="Badges"
      className="rounded-2xl border border-[#E0E0E0] bg-white p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
          Badges
        </p>
        <span className="text-xs font-medium tabular-nums text-[#8F8F8F]">
          {earned.length} earned
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-[#626262]">
          No badges yet. They arrive with checked work — a first pass, a first
          build, a finished programme.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((badge) => {
            const isEarned = Boolean(badge.earnedAt);
            return (
              <li key={badge.slug}>
                <button
                  type="button"
                  onClick={() => setModal(badge)}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-colors",
                    isEarned
                      ? "border-[#E0E0E0] bg-white hover:bg-[#EEF6F6]"
                      : "border-[#EDEDED] bg-[#FAFAFA] hover:bg-[#F4F4F4]",
                  )}
                >
                  <TierShape rarity={badge.rarity} earned={isEarned} className="size-10">
                    {isEarned ? <Check className="size-4" strokeWidth={3} aria-hidden /> : null}
                  </TierShape>
                  <span
                    className={cn(
                      "text-xs font-medium leading-tight",
                      isEarned ? "text-[#111111]" : "text-[#8F8F8F]",
                    )}
                  >
                    {badge.name}
                  </span>
                  <span className="text-[10px] text-[#8F8F8F]">{badge.rarity}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(3,30,34,0.55)] p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="badge-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-[0_24px_60px_rgba(3,40,46,0.2)] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#03535F]">
              {modal.earnedAt ? "Badge earned" : "Badge"}
            </p>
            <TierShape
              rarity={modal.rarity}
              earned={Boolean(modal.earnedAt)}
              className="mx-auto mt-4 size-24"
            >
              {modal.earnedAt ? <Check className="size-8" strokeWidth={3} aria-hidden /> : null}
            </TierShape>
            <h2
              id="badge-modal-title"
              className="mt-4 font-display text-2xl font-bold text-[#111111]"
            >
              {modal.name}
            </h2>
            <p className="mt-1.5 text-sm text-[#4B4B4B]">{modal.description}</p>
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-[#353535]">
              <TierShape rarity={modal.rarity} earned className="size-4" />
              {modal.rarity} · {modal.category.toLowerCase()}
            </p>

            {modalEvidence || modal.earnedAt ? (
              <p className="mt-4 rounded-xl border border-[#E0E0E0] bg-[#F4F4F4] px-3 py-2 text-left text-xs leading-relaxed text-[#4B4B4B]">
                <span className="font-semibold text-[#111111]">Evidence · </span>
                {modalEvidence?.label ?? "Earned from checked work"}
                {modal.earnedAt ? (
                  <>
                    {" · "}
                    {new Date(modal.earnedAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </>
                ) : null}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="h-11 rounded-xl border border-[#E0E0E0] bg-white text-sm font-semibold text-[#111111] hover:bg-[#F4F4F4]"
              >
                Close
              </button>
              {modal.earnedAt ? (
                <button
                  type="button"
                  onClick={() => share(modal)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#03535F] text-sm font-semibold text-white shadow-[inset_0_-5px_14px_rgba(0,0,0,0.34)] hover:bg-[#076573]"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" aria-hidden /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" aria-hidden /> Share
                    </>
                  )}
                </button>
              ) : null}
            </div>
            <p aria-live="polite" className="sr-only">
              {copied ? "Badge text copied to clipboard" : ""}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
