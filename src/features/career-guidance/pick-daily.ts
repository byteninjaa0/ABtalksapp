/**
 * Daily Career Guidance pack (plan 146).
 *
 * Slot mix: NextStep (≤2 cohort/mock/hackathon) → Growth (≤1 challenge) →
 * Catalog (≤1 check-in else quote). Remaining capacity may fill from later
 * slots. Stable rotate by istDay. One-time refill helper for the deck.
 */

import {
  catalogSpecificity,
  catalogWhenMatches,
  pickRotated,
  type CatalogItem,
  type GuidanceTargeting,
} from "./catalog";
import {
  DAILY_CAP,
  type DailyCard,
  type GuidanceItem,
  type GuidanceKind,
  type GuidanceMemory,
} from "./types";

export type PickDailyInput = {
  profileItems: GuidanceItem[];
  catalog: CatalogItem[];
  targeting: GuidanceTargeting;
  istDay: string;
  istWeek: string;
  onceSeen: string[];
  weeklySeen: Record<string, string>;
  questCards?: DailyCard[];
};

function cadenceOk(
  item: CatalogItem,
  istWeek: string,
  onceSeen: Set<string>,
  weeklySeen: Record<string, string>,
): boolean {
  if (item.cadence === "once") return !onceSeen.has(item.id);
  if (item.cadence === "weekly") return weeklySeen[item.id] !== istWeek;
  return true;
}

function profileToCard(item: GuidanceItem): DailyCard {
  return {
    id: item.id,
    source: "profile",
    kind: item.kind,
    title: item.title,
    body: item.because,
    ctaLabel: item.cta,
    href: item.href,
  };
}

function catalogToCard(item: CatalogItem): DailyCard {
  return {
    id: item.id,
    source: "catalog",
    kind: item.kind,
    title: item.title,
    body: item.body,
    ctaLabel: item.ctaLabel ?? null,
    href: item.href ?? null,
  };
}

const NEXT_STEP: ReadonlySet<GuidanceKind> = new Set([
  "cohort",
  "mock",
  "hackathon",
]);

function takeRotated(
  items: GuidanceItem[],
  count: number,
  istDay: string,
  slotId: string,
  used: Set<string>,
): GuidanceItem[] {
  const available = items.filter((i) => !used.has(i.id));
  if (available.length === 0 || count <= 0) return [];
  if (available.length <= count) return available;
  // Rotate window: start at hash offset, take `count` wrapping.
  const start = Math.abs(
    Array.from(`${istDay}:${slotId}`).reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) | 0,
      0,
    ),
  ) % available.length;
  const out: GuidanceItem[] = [];
  for (let i = 0; i < count; i++) {
    out.push(available[(start + i) % available.length]!);
  }
  return out;
}

export function pickDailyPack(input: PickDailyInput): DailyCard[] {
  const onceSeen = new Set(input.onceSeen);
  const used = new Set<string>();
  const pack: DailyCard[] = [];

  const questCards = (input.questCards ?? []).slice(0, 1);
  for (const card of questCards) {
    pack.push(card);
    used.add(card.id);
  }

  const nextStepPool = input.profileItems.filter((i) => NEXT_STEP.has(i.kind));
  const growthPool = input.profileItems.filter((i) => i.kind === "challenge");

  // Slot 1: NextStep up to 2
  for (const item of takeRotated(nextStepPool, 2, input.istDay, "next", used)) {
    used.add(item.id);
    pack.push(profileToCard(item));
  }

  // Slot 2: Growth up to 1 (or fill remaining capacity later)
  const growthRoom = Math.min(1, DAILY_CAP - pack.length);
  for (const item of takeRotated(
    growthPool,
    growthRoom,
    input.istDay,
    "growth",
    used,
  )) {
    used.add(item.id);
    pack.push(profileToCard(item));
  }

  // Slot 3: Catalog — check-in preferred, else quote
  if (pack.length < DAILY_CAP) {
    const eligible = input.catalog.filter(
      (item) =>
        cadenceOk(item, input.istWeek, onceSeen, input.weeklySeen) &&
        catalogWhenMatches(item.when, input.targeting),
    );
    const checkins = eligible
      .filter((i) => i.kind === "checkin")
      .sort((a, b) => catalogSpecificity(b.when) - catalogSpecificity(a.when));
    const quotes = eligible
      .filter((i) => i.kind === "quote")
      .sort((a, b) => catalogSpecificity(b.when) - catalogSpecificity(a.when));

    const checkin = pickRotated(checkins, input.istDay, "checkin");
    if (checkin) {
      pack.push(catalogToCard(checkin));
    } else {
      const quote = pickRotated(quotes, input.istDay, "quote");
      if (quote) pack.push(catalogToCard(quote));
    }
  }

  // Fill remaining capacity from leftover profile (next-step then growth)
  if (pack.length < DAILY_CAP) {
    const leftover = [
      ...nextStepPool.filter((i) => !used.has(i.id)),
      ...growthPool.filter((i) => !used.has(i.id)),
      ...input.profileItems.filter(
        (i) => !used.has(i.id) && !NEXT_STEP.has(i.kind) && i.kind !== "challenge",
      ),
    ];
    for (const item of takeRotated(
      leftover,
      DAILY_CAP - pack.length,
      input.istDay,
      "fill",
      used,
    )) {
      used.add(item.id);
      pack.push(profileToCard(item));
      if (pack.length >= DAILY_CAP) break;
    }
  }

  return pack.slice(0, DAILY_CAP);
}

export function emptyGuidanceMemory(istDay: string): GuidanceMemory {
  return {
    istDay,
    packIds: null,
    dismissedIds: [],
    onceSeen: [],
    weeklySeen: {},
    refillUsed: false,
  };
}

export function rollGuidanceMemory(
  prev: GuidanceMemory,
  istDay: string,
): GuidanceMemory {
  if (prev.istDay === istDay) {
    return {
      ...prev,
      refillUsed: prev.refillUsed ?? false,
    };
  }
  return {
    istDay,
    packIds: null,
    dismissedIds: [],
    onceSeen: prev.onceSeen,
    weeklySeen: prev.weeklySeen,
    refillUsed: false,
  };
}

export function rememberPack(
  memory: GuidanceMemory,
  pack: DailyCard[],
  catalogById: Map<string, CatalogItem>,
  istWeek: string,
): GuidanceMemory {
  const onceSeen = [...memory.onceSeen];
  const weeklySeen = { ...memory.weeklySeen };
  for (const card of pack) {
    if (card.source !== "catalog") continue;
    const item = catalogById.get(card.id);
    if (!item) continue;
    if (item.cadence === "once" && !onceSeen.includes(item.id)) {
      onceSeen.push(item.id);
    }
    if (item.cadence === "weekly") {
      weeklySeen[item.id] = istWeek;
    }
  }
  return {
    ...memory,
    packIds: pack.map((c) => c.id),
    onceSeen,
    weeklySeen,
    refillUsed: memory.refillUsed ?? false,
  };
}

export function visibleDailyCards(
  pack: DailyCard[],
  dismissedIds: string[],
): DailyCard[] {
  const dismissed = new Set(dismissedIds);
  return pack.filter((card) => !dismissed.has(card.id));
}

export function cardsForFrozenIds(
  packIds: string[],
  profileItems: GuidanceItem[],
  catalog: CatalogItem[],
  extraCards: DailyCard[] = [],
): DailyCard[] {
  const profileById = new Map(profileItems.map((i) => [i.id, i]));
  const catalogById = new Map(catalog.map((i) => [i.id, i]));
  const extraById = new Map(extraCards.map((c) => [c.id, c]));
  const cards: DailyCard[] = [];
  const seen = new Set<string>();
  for (const extra of extraCards.slice(0, 1)) {
    cards.push(extra);
    seen.add(extra.id);
  }
  for (const id of packIds) {
    if (seen.has(id)) continue;
    const extra = extraById.get(id);
    if (extra) {
      cards.push(extra);
      seen.add(id);
      continue;
    }
    const profile = profileById.get(id);
    if (profile) {
      cards.push(profileToCard(profile));
      seen.add(id);
      continue;
    }
    const catalogItem = catalogById.get(id);
    if (catalogItem) {
      cards.push(catalogToCard(catalogItem));
      seen.add(id);
    }
  }
  return cards.slice(0, DAILY_CAP);
}

/**
 * One unused eligible card for refill. Prefer remaining profile, then catalog.
 */
export function pickRefillCard(input: {
  profileItems: GuidanceItem[];
  catalog: CatalogItem[];
  targeting: GuidanceTargeting;
  istDay: string;
  istWeek: string;
  packIds: string[];
  dismissedIds: string[];
  onceSeen: string[];
  weeklySeen: Record<string, string>;
}): DailyCard | null {
  const blocked = new Set([...input.packIds, ...input.dismissedIds]);
  const leftover = input.profileItems.filter((i) => !blocked.has(i.id));
  if (leftover[0]) return profileToCard(leftover[0]);

  const onceSeen = new Set(input.onceSeen);
  const eligible = input.catalog.filter(
    (item) =>
      !blocked.has(item.id) &&
      cadenceOk(item, input.istWeek, onceSeen, input.weeklySeen) &&
      catalogWhenMatches(item.when, input.targeting),
  );
  const checkins = eligible
    .filter((i) => i.kind === "checkin")
    .sort((a, b) => catalogSpecificity(b.when) - catalogSpecificity(a.when));
  const picked =
    pickRotated(checkins, input.istDay, "refill-checkin") ??
    pickRotated(
      eligible
        .filter((i) => i.kind === "quote")
        .sort(
          (a, b) => catalogSpecificity(b.when) - catalogSpecificity(a.when),
        ),
      input.istDay,
      "refill-quote",
    );
  return picked ? catalogToCard(picked) : null;
}
