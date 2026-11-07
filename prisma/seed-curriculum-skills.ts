/**
 * Curriculum → core skills, seeded into the EXISTING `ProgramSkill` join table.
 *
 * `ProgramSkill` (LearningProgram → Skill) shipped with plan 078 and has never
 * had a writer. It is exactly the association the profile's Klymb AI Verified
 * Skills need, so this seed fills it rather than adding a parallel table.
 *
 * Every Klymb AI track already has a LearningProgram row: the four 60-day
 * challenges and the AI cohort were given theirs by the 078 migration
 * (migrate-2d-learning-content.ts), and the newer cohorts create theirs in
 * their own seed scripts. So one join table covers challenges AND cohorts.
 *
 * Idempotent, additive, and safe to re-run:
 *   - Skills are matched by slug, then by name/alias, and only CREATED when the
 *     catalog genuinely has no row — it never renames or recategorises one.
 *   - Links are upserted. Links this file no longer lists are REMOVED for the
 *     programs it names, so dropping a skill from the JSON actually drops it.
 *   - Programs absent from the database are reported and skipped, never created
 *     here: a LearningProgram is curriculum, and curriculum is owned by the
 *     program's own seed.
 *
 * Refuses the production Neon host, like every other seed in this directory.
 *
 * Run: npm run db:seed:curriculum-skills
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const PRODUCTION_NEON_HOST_ID = "ep-nameless-term-ams9a5e3";

const prisma = new PrismaClient();

type SkillEntry = { name: string; category?: string };
type ProgramEntry = {
  program: string;
  label?: string;
  source?: string;
  skills: SkillEntry[];
};
type Content = { programs: ProgramEntry[] };

/** Same fold as features/skill/resolve-skill.ts — kept local so a seed (plain
 *  node) never imports a "server-only" module. */
function skillSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function assertNotProduction(): void {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (process.env.SEED_ALLOW_PRODUCTION === "true") {
    console.warn("SEED_ALLOW_PRODUCTION=true — production guard bypassed");
    return;
  }
  if (dbUrl.toLowerCase().includes(PRODUCTION_NEON_HOST_ID)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL points at production (${PRODUCTION_NEON_HOST_ID}).`,
    );
  }
}

async function resolveSkillId(
  entry: SkillEntry,
  categoryIdBySlug: Map<string, string>,
): Promise<string> {
  const name = entry.name.trim();
  const slug = skillSlug(name);

  const bySlug = await prisma.skill.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (bySlug) return bySlug.id;

  // The catalog was seeded from free text, so the same skill can already exist
  // under a different slug. Fold onto it rather than minting a duplicate.
  const byNameOrAlias = await prisma.skill.findFirst({
    where: {
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        { aliases: { has: name.toLowerCase() } },
      ],
    },
    select: { id: true },
  });
  if (byNameOrAlias) return byNameOrAlias.id;

  const categoryId = entry.category
    ? (categoryIdBySlug.get(entry.category) ?? null)
    : null;
  if (entry.category && !categoryId) {
    console.warn(`  ! unknown SkillCategory "${entry.category}" for ${name}`);
  }
  const created = await prisma.skill.create({
    data: { slug, name, categoryId, isActive: true },
    select: { id: true },
  });
  return created.id;
}

async function main(): Promise<void> {
  assertNotProduction();

  const raw = readFileSync(
    join(process.cwd(), "prisma/content/curriculum-skills.json"),
    "utf8",
  );
  const content = JSON.parse(raw) as Content;

  const categories = await prisma.skillCategory.findMany({
    select: { id: true, slug: true },
  });
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  let linked = 0;
  let createdSkills = 0;
  let removed = 0;
  const missingPrograms: string[] = [];

  const skillCountBefore = await prisma.skill.count();

  for (const entry of content.programs) {
    const program = await prisma.learningProgram.findUnique({
      where: { slug: entry.program },
      select: { id: true, title: true },
    });
    if (!program) {
      missingPrograms.push(entry.program);
      continue;
    }

    const wantedIds: string[] = [];
    for (const skill of entry.skills) {
      wantedIds.push(await resolveSkillId(skill, categoryIdBySlug));
    }

    for (const skillId of wantedIds) {
      await prisma.programSkill.upsert({
        where: {
          programId_skillId: { programId: program.id, skillId },
        },
        create: { programId: program.id, skillId },
        update: {},
      });
      linked += 1;
    }

    // The JSON is the source of truth for THIS program's list.
    const stale = await prisma.programSkill.deleteMany({
      where: { programId: program.id, skillId: { notIn: wantedIds } },
    });
    removed += stale.count;

    console.log(
      `  ${entry.program.padEnd(32)} ${String(wantedIds.length).padStart(2)} skills` +
        (stale.count > 0 ? ` (${stale.count} removed)` : ""),
    );
  }

  createdSkills = (await prisma.skill.count()) - skillCountBefore;

  console.log(
    `\nProgramSkill links upserted: ${linked}` +
      (removed > 0 ? `, removed: ${removed}` : "") +
      `, new Skill rows: ${createdSkills}`,
  );
  if (missingPrograms.length > 0) {
    console.warn(
      `\nSkipped — no LearningProgram with these slugs:\n  ${missingPrograms.join("\n  ")}\n` +
        "Run that program's own seed first (or the 078 content migration for the legacy tracks).",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
