/**
 * Plan 151 §7 — levels require XP AND proof. Pure.
 *
 * V1 exposes levels 1–4. Levels 5–7 are computed but hidden behind
 * ENABLE_SKILL_STAGES. XP alone never levels you up.
 */

export const LEVELS = [
  { level: 1, name: "Explorer", xp: 0 },
  { level: 2, name: "Learner", xp: 100 },
  { level: 3, name: "Practitioner", xp: 750 },
  { level: 4, name: "Builder", xp: 2500 },
  { level: 5, name: "Proven Builder", xp: 6000 },
  { level: 6, name: "Specialist", xp: 12000 },
  { level: 7, name: "Distinguished Builder", xp: 25000 },
] as const;

export const V1_MAX_VISIBLE_LEVEL = 4;

export type LevelGateSnapshot = {
  xpTotal: number;
  passedActivityCount: number;
  distinctVerifiedDays: number;
  hasVerifiedBuild: boolean;
  programCompletions: number;
  verifiedSkillCount: number;
  verifiedSkillsInOneCategory: number;
  hackathonTop25: boolean;
  advancedSkillCount: number;
  hackathonTop10OrFinalist: boolean;
  activeWeeksLast52: number;
};

export type GateStatus = {
  key: string;
  label: string;
  met: boolean;
};

export type LevelEvaluation = {
  level: number;
  name: string;
  xpRequired: number;
  xpMet: boolean;
  gates: GateStatus[];
  gatesMet: boolean;
  eligible: boolean;
};

function gatesFor(
  level: number,
  s: LevelGateSnapshot,
): GateStatus[] {
  switch (level) {
    case 1:
      return [{ key: "account", label: "Account exists", met: true }];
    case 2:
      return [
        {
          key: "first_pass",
          label: "1 verified activity passed",
          met: s.passedActivityCount >= 1,
        },
      ];
    case 3:
      return [
        {
          key: "seven_days",
          label: "Verified activity on 7 distinct IST days",
          met: s.distinctVerifiedDays >= 7,
        },
      ];
    case 4:
      return [
        {
          key: "first_build",
          label:
            "1 verified build (project / boss build / ship-it or valid hackathon submission)",
          met: s.hasVerifiedBuild,
        },
      ];
    case 5:
      return [
        {
          key: "completion",
          label: "1 program completion",
          met: s.programCompletions >= 1,
        },
        {
          key: "verified_skill",
          label: "1 skill at stage ≥ Verified",
          met: s.verifiedSkillCount >= 1,
        },
      ];
    case 6:
      return [
        {
          key: "category_depth",
          label: "3 skills at Verified in one skill category",
          met: s.verifiedSkillsInOneCategory >= 3,
        },
        {
          key: "breadth_or_place",
          label: "2 completions or a hackathon result in the top 25%",
          met: s.programCompletions >= 2 || s.hackathonTop25,
        },
      ];
    case 7:
      return [
        {
          key: "advanced",
          label: "Stage Advanced in ≥ 1 skill",
          met: s.advancedSkillCount >= 1,
        },
        {
          key: "external_judge",
          label: "Hackathon Top 10 / finalist or better",
          met: s.hackathonTop10OrFinalist,
        },
        {
          key: "sustained",
          label: "26 active weeks in the last 52",
          met: s.activeWeeksLast52 >= 26,
        },
      ];
    default:
      return [];
  }
}

export function evaluateLevel(
  level: number,
  snapshot: LevelGateSnapshot,
): LevelEvaluation {
  const def = LEVELS.find((l) => l.level === level) ?? LEVELS[0];
  const gates = gatesFor(level, snapshot);
  const xpMet = snapshot.xpTotal >= def.xp;
  const gatesMet = gates.every((g) => g.met);
  return {
    level: def.level,
    name: def.name,
    xpRequired: def.xp,
    xpMet,
    gates,
    gatesMet,
    eligible: xpMet && gatesMet,
  };
}

/** Highest level whose XP and gates are all met. Always ≥ 1. */
export function computeLevel(
  snapshot: LevelGateSnapshot,
  opts?: { skillStagesEnabled?: boolean },
): LevelEvaluation {
  const max = opts?.skillStagesEnabled ? 7 : V1_MAX_VISIBLE_LEVEL;
  let current = evaluateLevel(1, snapshot);
  for (let n = 2; n <= max; n++) {
    const next = evaluateLevel(n, snapshot);
    if (!next.eligible) break;
    current = next;
  }
  return current;
}

export function nextLevelTarget(
  snapshot: LevelGateSnapshot,
  opts?: { skillStagesEnabled?: boolean },
): LevelEvaluation | null {
  const current = computeLevel(snapshot, opts);
  const max = opts?.skillStagesEnabled ? 7 : V1_MAX_VISIBLE_LEVEL;
  if (current.level >= max) {
    if (!opts?.skillStagesEnabled && current.level >= V1_MAX_VISIBLE_LEVEL) {
      return evaluateLevel(5, snapshot);
    }
    return null;
  }
  return evaluateLevel(current.level + 1, snapshot);
}

export function unmetGates(evaluation: LevelEvaluation): GateStatus[] {
  return evaluation.gates.filter((g) => !g.met);
}
