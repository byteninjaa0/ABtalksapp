"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  HUB_CARD_CTA_CLASS,
  HUB_CARD_HOVER_CLASS,
} from "@/components/dashboard-hub/nav-items";
import { GUIDANCE_CATALOG } from "@/features/career-guidance/catalog";
import type { GuidanceTargeting } from "@/features/career-guidance/catalog";
import {
  cardsForFrozenIds,
  emptyGuidanceMemory,
  pickDailyPack,
  pickRefillCard,
  rememberPack,
  rollGuidanceMemory,
  visibleDailyCards,
} from "@/features/career-guidance/pick-daily";
import type {
  DailyCard,
  DailyCardKind,
  GuidanceItem,
  GuidanceMemory,
} from "@/features/career-guidance/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<DailyCardKind, string> = {
  cohort: "Cohort",
  hackathon: "Hackathon",
  challenge: "Challenge",
  mock: "Mock",
  checkin: "Check-in",
  quote: "Quote",
};

function storageKey(userId: string): string {
  return `abtalks-guidance:${userId}`;
}

function readMemory(userId: string, istDay: string): GuidanceMemory {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyGuidanceMemory(istDay);
    const parsed = JSON.parse(raw) as Partial<GuidanceMemory>;
    if (typeof parsed.istDay !== "string") return emptyGuidanceMemory(istDay);
    return rollGuidanceMemory(
      {
        istDay: parsed.istDay,
        packIds: Array.isArray(parsed.packIds) ? parsed.packIds : null,
        dismissedIds: Array.isArray(parsed.dismissedIds)
          ? parsed.dismissedIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [],
        onceSeen: Array.isArray(parsed.onceSeen)
          ? parsed.onceSeen.filter((id): id is string => typeof id === "string")
          : [],
        weeklySeen:
          parsed.weeklySeen &&
          typeof parsed.weeklySeen === "object" &&
          !Array.isArray(parsed.weeklySeen)
            ? Object.fromEntries(
                Object.entries(parsed.weeklySeen).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              )
            : {},
        refillUsed: parsed.refillUsed === true,
      },
      istDay,
    );
  } catch {
    return emptyGuidanceMemory(istDay);
  }
}

function writeMemory(userId: string, memory: GuidanceMemory): void {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(memory));
  } catch {
    // Quota / private mode — dismissals last for this mount only.
  }
}

type CareerGuidanceDeckProps = {
  userId: string;
  istDay: string;
  istWeek: string;
  items: GuidanceItem[];
  targeting: GuidanceTargeting;
};

export function CareerGuidanceDeck({
  userId,
  istDay,
  istWeek,
  items,
  targeting,
}: CareerGuidanceDeckProps) {
  const isMockCard = (card: DailyCard) =>
    card.kind === "mock" || (card.href ? card.href.startsWith("/mock-interviews") : false);

  // Profile-first paint before localStorage hydrates (avoids null flash).
  const bootstrapPack = useMemo(
    () =>
      pickDailyPack({
        profileItems: items,
        catalog: [],
        targeting,
        istDay,
        istWeek,
        onceSeen: [],
        weeklySeen: {},
      }).filter((c) => !isMockCard(c)),
    [items, targeting, istDay, istWeek],
  );

  const [memory, setMemory] = useState<GuidanceMemory | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = readMemory(userId, istDay);
    const catalogById = new Map(GUIDANCE_CATALOG.map((c) => [c.id, c]));
    if (loaded.packIds !== null) {
      setMemory(loaded);
      setHydrated(true);
      return;
    }
    const pack = pickDailyPack({
      profileItems: items,
      catalog: GUIDANCE_CATALOG,
      targeting,
      istDay,
      istWeek,
      onceSeen: loaded.onceSeen,
      weeklySeen: loaded.weeklySeen,
    });
    const next = rememberPack(loaded, pack, catalogById, istWeek);
    writeMemory(userId, next);
    setMemory(next);
    setHydrated(true);
  }, [userId, istDay, istWeek, items, targeting]);

  const pack = useMemo(() => {
    if (!hydrated || !memory?.packIds) return bootstrapPack;
    return cardsForFrozenIds(memory.packIds, items, GUIDANCE_CATALOG);
  }, [hydrated, memory, items, bootstrapPack]);

  const visible = useMemo(() => {
    if (!hydrated || !memory) return bootstrapPack;
    return visibleDailyCards(pack, memory.dismissedIds).filter(
      (c) => !isMockCard(c),
    );
  }, [hydrated, memory, pack, bootstrapPack]);

  const dismiss = useCallback(
    (id: string) => {
      setMemory((current) => {
        const base =
          current ??
          rememberPack(
            emptyGuidanceMemory(istDay),
            pack,
            new Map(GUIDANCE_CATALOG.map((c) => [c.id, c])),
            istWeek,
          );
        if (base.dismissedIds.includes(id)) return base;

        let next: GuidanceMemory = {
          ...base,
          packIds: base.packIds ?? pack.map((c) => c.id),
          dismissedIds: [...base.dismissedIds, id],
        };

        const remaining = visibleDailyCards(
          cardsForFrozenIds(next.packIds ?? [], items, GUIDANCE_CATALOG),
          next.dismissedIds,
        );

        if (remaining.length < 4 && !next.refillUsed) {
          const refill = pickRefillCard({
            profileItems: items,
            catalog: GUIDANCE_CATALOG,
            targeting,
            istDay,
            istWeek,
            packIds: next.packIds ?? [],
            dismissedIds: next.dismissedIds,
            onceSeen: next.onceSeen,
            weeklySeen: next.weeklySeen,
          });
          if (refill) {
            const catalogById = new Map(GUIDANCE_CATALOG.map((c) => [c.id, c]));
            const withCard = rememberPack(
              {
                ...next,
                packIds: [...(next.packIds ?? []), refill.id],
                refillUsed: true,
              },
              [refill],
              catalogById,
              istWeek,
            );
            next = {
              ...withCard,
              packIds: [...(next.packIds ?? []), refill.id],
              dismissedIds: next.dismissedIds,
              refillUsed: true,
              onceSeen: withCard.onceSeen,
              weeklySeen: withCard.weeklySeen,
            };
          } else {
            next = { ...next, refillUsed: true };
          }
        }

        writeMemory(userId, next);
        return next;
      });
    },
    [userId, istDay, istWeek, items, targeting, pack],
  );

  if (visible.length === 0) return null;

  return (
    <section id="career-guidance" className="scroll-mt-24 space-y-4 pt-2">
      <h3 className="font-heading text-2xl font-bold tracking-tight text-black">
        Career <span className="text-[#03535F]">guidance</span>
      </h3>
      <ul className="no-scrollbar flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory">
        {visible.map((card) => (
          <DailyCardView key={card.id} card={card} onDismiss={dismiss} />
        ))}
      </ul>
    </section>
  );
}

function DailyCardView({
  card,
  onDismiss,
}: {
  card: DailyCard;
  onDismiss: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "relative flex w-[min(100%,320px)] shrink-0 snap-start flex-col justify-between rounded-3xl border border-[#E6E9E9] bg-white p-6 sm:w-[300px]",
        HUB_CARD_HOVER_CLASS,
      )}
    >
      <button
        type="button"
        aria-label={`Dismiss ${card.title}`}
        onClick={() => onDismiss(card.id)}
        className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg text-[#8F8F8F] transition-colors hover:bg-[#EEF6F6] hover:text-[#03535F] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#03535F]"
      >
        <X className="size-4" strokeWidth={2} aria-hidden />
      </button>
      <div className="min-h-0 pr-8">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#03535F]">
          {KIND_LABEL[card.kind]}
        </span>
        <p className="mt-2 font-heading text-lg font-bold text-black">{card.title}</p>
        <p className="mt-1 text-sm text-[#4B4B4B]">{card.body}</p>
      </div>
      {card.ctaLabel && card.href ? (
        <Link
          href={card.href}
          className={cn(HUB_CARD_CTA_CLASS, "mt-2 self-end")}
        >
          {card.ctaLabel}
        </Link>
      ) : card.ctaLabel ? (
        <button
          type="button"
          className={cn(HUB_CARD_CTA_CLASS, "mt-2 self-end")}
          onClick={() => onDismiss(card.id)}
        >
          {card.ctaLabel}
        </button>
      ) : null}
    </li>
  );
}
