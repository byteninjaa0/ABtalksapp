import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadStatement(id: string): string {
  const full = path.join(
    process.cwd(),
    "prisma",
    "content",
    "hackathon",
    `${id}.md`,
  );
  return fs.readFileSync(full, "utf-8").replace(/^\uFEFF/, "").trimEnd() + "\n";
}

const CANONICAL = [
  {
    id: "HACKPS2608001",
    sortOrder: 1,
    title: "Redesign Klymb AI",
    statement: loadStatement("HACKPS2608001"),
  },
  {
    id: "HACKPS2608002",
    sortOrder: 2,
    title: "The Interview Agent",
    statement: loadStatement("HACKPS2608002"),
  },
  {
    id: "HACKPS2608003",
    sortOrder: 3,
    title: "Autonomous AI Creator",
    statement: loadStatement("HACKPS2608003"),
  },
] as const;

type CanonicalId = (typeof CANONICAL)[number]["id"];

/** Legacy seed IDs → current product IDs. BRIEF n is UI-only (sort order). */
const ID_REMAP: ReadonlyArray<{ oldId: string; newId: CanonicalId }> = [
  { oldId: "brief-1", newId: "HACKPS2608001" },
  { oldId: "brief-2", newId: "HACKPS2608002" },
  { oldId: "brief-3", newId: "HACKPS2608003" },
];

async function main() {
  const host = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).host
    : "(DATABASE_URL unset)";
  console.log(`Seeding HackathonProblem on: ${host}`);

  const prisma = new PrismaClient();
  const canonicalById = new Map(CANONICAL.map((row) => [row.id, row]));
  const canonicalIds = CANONICAL.map((row) => row.id);

  for (const { oldId, newId } of ID_REMAP) {
    const canonical = canonicalById.get(newId);
    if (!canonical) {
      throw new Error(`Missing CANONICAL row for ${newId}`);
    }

    await prisma.$transaction(async (tx) => {
      const oldRow = await tx.hackathonProblem.findUnique({
        where: { id: oldId },
        select: { title: true, statement: true, sortOrder: true },
      });

      await tx.hackathonProblem.upsert({
        where: { id: newId },
        create: {
          id: newId,
          title: oldRow?.title ?? canonical.title,
          statement: oldRow?.statement ?? canonical.statement,
          sortOrder: oldRow?.sortOrder ?? canonical.sortOrder,
        },
        update: {},
      });

      const remapped = await tx.hackathonSubmission.updateMany({
        where: { problemId: oldId },
        data: { problemId: newId },
      });
      if (remapped.count > 0) {
        console.log(
          `remapped ${remapped.count} submission(s): ${oldId} → ${newId}`,
        );
      }

      if (oldRow) {
        await tx.hackathonProblem.delete({ where: { id: oldId } });
        console.log(`deleted legacy: ${oldId}`);
      }
    });
  }

  for (const row of CANONICAL) {
    await prisma.hackathonProblem.upsert({
      where: { id: row.id },
      create: row,
      update: {
        title: row.title,
        statement: row.statement,
        sortOrder: row.sortOrder,
      },
    });
    console.log(`upserted: ${row.id} (${row.statement.length} chars)`);
  }

  const strays = await prisma.hackathonProblem.findMany({
    where: { id: { notIn: [...canonicalIds] } },
    select: {
      id: true,
      title: true,
      _count: { select: { submissions: true } },
    },
    orderBy: { sortOrder: "asc" },
  });

  for (const row of strays) {
    if (row._count.submissions > 0) {
      console.warn(
        `skipped stray brief ${row.id} (${row.title}) with ${row._count.submissions} submission(s)`,
      );
      continue;
    }

    await prisma.hackathonProblem.delete({ where: { id: row.id } });
    console.log(`deleted stray: ${row.id}`);
  }

  const rows = await prisma.hackathonProblem.findMany({
    select: { id: true, title: true, sortOrder: true, statement: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  console.log(`total briefs now: ${rows.length}`);
  for (const row of rows) {
    console.log(
      `  - ${row.sortOrder}: ${row.id} (${row.title}) [${row.statement.length} chars]`,
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
