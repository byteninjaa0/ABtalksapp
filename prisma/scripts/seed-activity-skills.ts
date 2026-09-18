/**
 * Plan 151 Phase 0 — populate `ActivitySkill`, which has had no rows since the
 * table was created. Without it a passed activity can evidence nothing.
 *
 * Two sources, both idempotent:
 *   1. Activity tags matched to a Skill slug or alias → weight 3 (specific).
 *   2. The programme's own ProgramSkill links → weight 1 (broad fallback).
 *
 * Usage:
 *   npx tsx prisma/scripts/seed-activity-skills.ts [--dry] [--allow-production]
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry");
const ALLOW_PRODUCTION = process.argv.includes("--allow-production");

const TAG_WEIGHT = 3;
const PROGRAM_WEIGHT = 1;

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

async function main() {
  const host = new URL(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgres://x")
    .hostname;
  if (!ALLOW_PRODUCTION && !DRY) {
    console.log(
      `Refusing to write without --allow-production (host ${host}). Re-run with --dry to preview.`,
    );
    return;
  }

  const skills = await prisma.skill.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, aliases: true },
  });
  const bySlug = new Map<string, string>();
  for (const skill of skills) {
    bySlug.set(normalize(skill.slug), skill.id);
    bySlug.set(normalize(skill.name), skill.id);
    for (const alias of skill.aliases) bySlug.set(normalize(alias), skill.id);
  }

  const activities = await prisma.activity.findMany({
    select: {
      id: true,
      tags: true,
      module: {
        select: {
          programVersion: { select: { programId: true } },
        },
      },
    },
  });

  const programSkills = await prisma.programSkill.findMany({
    select: { programId: true, skillId: true },
  });
  const byProgram = new Map<string, string[]>();
  for (const link of programSkills) {
    byProgram.set(link.programId, [...(byProgram.get(link.programId) ?? []), link.skillId]);
  }

  const rows: { activityId: string; skillId: string; weight: number }[] = [];
  for (const activity of activities) {
    const fromTags = new Set<string>();
    for (const tag of activity.tags) {
      const skillId = bySlug.get(normalize(tag));
      if (skillId) fromTags.add(skillId);
    }
    for (const skillId of fromTags) {
      rows.push({ activityId: activity.id, skillId, weight: TAG_WEIGHT });
    }
    const programId = activity.module.programVersion.programId;
    for (const skillId of byProgram.get(programId) ?? []) {
      if (fromTags.has(skillId)) continue;
      rows.push({ activityId: activity.id, skillId, weight: PROGRAM_WEIGHT });
    }
  }

  console.log(
    `${activities.length} activities · ${skills.length} skills · ${rows.length} links to ensure`,
  );
  if (DRY) {
    const sample = rows.slice(0, 5);
    console.log("sample:", sample);
    return;
  }

  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const result = await prisma.activitySkill.createMany({
      data: batch,
      skipDuplicates: true,
    });
    written += result.count;
  }
  console.log(`ActivitySkill rows written: ${written} (existing links left alone)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
