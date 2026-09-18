/**
 * Plan 151 §11.4 — closed criteria language. No eval, no DSL, no SQL.
 * Pure evaluators + Zod discriminated union. Depth of `all_of` ≤ 2.
 */
import { z } from "zod";

const payloadFilter = z
  .record(z.string().max(64), z.union([z.string(), z.number(), z.boolean()]))
  .optional();

const eventCount = z.object({
  kind: z.literal("event_count"),
  eventType: z.string().min(1),
  count: z.number().int().min(1).max(10_000),
  filter: payloadFilter,
});

const distinctDays = z.object({
  kind: z.literal("distinct_days"),
  eventTypes: z.array(z.string().min(1)).min(1).max(20),
  days: z.number().int().min(1).max(366),
  withinDays: z.number().int().min(1).max(366).optional(),
});

const distinctValues = z.object({
  kind: z.literal("distinct_values"),
  eventType: z.string().min(1),
  payloadKey: z.string().min(1).max(64),
  count: z.number().int().min(1).max(100),
});

const weekStreak = z.object({
  kind: z.literal("week_streak"),
  weeks: z.number().int().min(1).max(520),
});

const levelReached = z.object({
  kind: z.literal("level_reached"),
  level: z.number().int().min(1).max(7),
});

const hackathonPlacement = z.object({
  kind: z.literal("hackathon_placement"),
  atLeast: z.enum([
    "top10pct",
    "finalist",
    "top5",
    "third",
    "second",
    "winner",
  ]),
});

const seasonPercentile = z.object({
  kind: z.literal("season_percentile"),
  board: z.string().min(1),
  atMost: z.number().min(0).max(100),
});

const skillStage = z.object({
  kind: z.literal("skill_stage"),
  stage: z.string().min(1),
  count: z.number().int().min(1).max(100),
  categorySlug: z.string().min(1).optional(),
});

const profileCompleteness = z.object({
  kind: z.literal("profile_completeness"),
  atLeast: z.number().int().min(0).max(100),
  requiredSections: z.array(z.string().min(1)).max(20),
});

const leafCriterion = z.discriminatedUnion("kind", [
  eventCount,
  distinctDays,
  distinctValues,
  weekStreak,
  levelReached,
  hackathonPlacement,
  seasonPercentile,
  skillStage,
  profileCompleteness,
]);

export const badgeCriterionSchema: z.ZodType<BadgeCriterion> = z.lazy(() =>
  z.union([
    leafCriterion,
    z.object({
      kind: z.literal("all_of"),
      criteria: z.array(z.lazy(() => badgeCriterionSchema)).min(1).max(8),
    }),
  ]),
);

export type BadgeCriterion =
  | z.infer<typeof eventCount>
  | z.infer<typeof distinctDays>
  | z.infer<typeof distinctValues>
  | z.infer<typeof weekStreak>
  | z.infer<typeof levelReached>
  | z.infer<typeof hackathonPlacement>
  | z.infer<typeof seasonPercentile>
  | z.infer<typeof skillStage>
  | z.infer<typeof profileCompleteness>
  | { kind: "all_of"; criteria: BadgeCriterion[] };

export type EventFact = {
  type: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export type CriteriaContext = {
  events: EventFact[];
  weekStreak: number;
  level: number;
  profileCompleteness: number;
  completedSections: string[];
  skillStageCounts: Record<string, number>;
  skillStageCountsByCategory: Record<string, number>;
  seasonPercentile: Record<string, number>;
  now: Date;
};

const PLACEMENT_RANK: Record<string, number> = {
  top10pct: 1,
  finalist: 2,
  top5: 3,
  third: 4,
  second: 5,
  winner: 6,
};

function payloadMatches(
  payload: Record<string, unknown>,
  filter: Record<string, string | number | boolean> | undefined,
): boolean {
  if (!filter) return true;
  for (const [k, v] of Object.entries(filter)) {
    if (payload[k] !== v) return false;
  }
  return true;
}

function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function istDayKeyFromUtc(d: Date): string {
  // Shift to IST (+05:30) then take the calendar day.
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return dayKey(shifted);
}

export function evaluateCriterion(
  criterion: BadgeCriterion,
  ctx: CriteriaContext,
  depth = 0,
): boolean {
  if (criterion.kind === "all_of") {
    if (depth >= 2) return false;
    return criterion.criteria.every((c) => evaluateCriterion(c, ctx, depth + 1));
  }
  switch (criterion.kind) {
    case "event_count": {
      const n = ctx.events.filter(
        (e) =>
          e.type === criterion.eventType &&
          payloadMatches(e.payload, criterion.filter),
      ).length;
      return n >= criterion.count;
    }
    case "distinct_days": {
      const types = new Set(criterion.eventTypes);
      let events = ctx.events.filter((e) => types.has(e.type));
      if (criterion.withinDays) {
        const cutoff = new Date(
          ctx.now.getTime() - criterion.withinDays * 24 * 60 * 60 * 1000,
        );
        events = events.filter((e) => e.occurredAt >= cutoff);
      }
      const days = new Set(events.map((e) => istDayKeyFromUtc(e.occurredAt)));
      return days.size >= criterion.days;
    }
    case "distinct_values": {
      const values = new Set(
        ctx.events
          .filter((e) => e.type === criterion.eventType)
          .map((e) => e.payload[criterion.payloadKey])
          .filter((v) => v != null)
          .map((v) => String(v)),
      );
      return values.size >= criterion.count;
    }
    case "week_streak":
      return ctx.weekStreak >= criterion.weeks;
    case "level_reached":
      return ctx.level >= criterion.level;
    case "hackathon_placement": {
      const need = PLACEMENT_RANK[criterion.atLeast] ?? 99;
      return ctx.events.some((e) => {
        if (e.type !== "hackathon.placed" && e.type !== "credential.issued") {
          return false;
        }
        const variant = String(
          e.payload.variant ?? e.payload.hackathonVariant ?? "",
        );
        const got = PLACEMENT_RANK[variant] ?? 0;
        return got >= need;
      });
    }
    case "season_percentile": {
      const value = ctx.seasonPercentile[criterion.board];
      return typeof value === "number" && value <= criterion.atMost;
    }
    case "skill_stage": {
      if (criterion.categorySlug) {
        const n =
          ctx.skillStageCountsByCategory[
            `${criterion.categorySlug}:${criterion.stage}`
          ] ?? 0;
        return n >= criterion.count;
      }
      return (ctx.skillStageCounts[criterion.stage] ?? 0) >= criterion.count;
    }
    case "profile_completeness": {
      if (ctx.profileCompleteness < criterion.atLeast) return false;
      return criterion.requiredSections.every((s) =>
        ctx.completedSections.includes(s),
      );
    }
    default:
      return false;
  }
}

export function parseBadgeCriteria(
  raw: unknown,
): { ok: true; data: BadgeCriterion } | { ok: false; message: string } {
  const parsed = badgeCriterionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "invalid criteria" };
  return { ok: true, data: parsed.data };
}

export const RARITY_BANDS = [
  { minExclusive: 40, name: "Common" },
  { minExclusive: 15, name: "Uncommon" },
  { minExclusive: 5, name: "Rare" },
  { minExclusive: 1, name: "Epic" },
  { minExclusive: 0, name: "Legendary" },
] as const;

export function measuredRarityBand(
  holders: number,
  eligibleActive: number,
): string {
  if (eligibleActive <= 0) return "Common";
  const pct = (holders / eligibleActive) * 100;
  if (pct > 40) return "Common";
  if (pct > 15) return "Uncommon";
  if (pct > 5) return "Rare";
  if (pct > 1) return "Epic";
  return "Legendary";
}

export function displayRarity(input: {
  baseRarity: string;
  measuredRarity: string | null;
  earnedCount: number;
  eligibleActive: number;
  badgeAgeDays: number;
}): string {
  if (input.eligibleActive >= 200 && input.badgeAgeDays >= 30 && input.measuredRarity) {
    return input.measuredRarity;
  }
  return input.baseRarity;
}
