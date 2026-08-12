import fs from "node:fs";
import path from "node:path";
import { PrismaClient, type PracticeDifficulty } from "@prisma/client";

type ContentTestCase = {
  ordinal: number;
  isSample: boolean;
  input: string;
  expected: string;
  explanation?: string;
};

type ContentProblem = {
  slug: string;
  title: string;
  difficulty: PracticeDifficulty;
  maxScore: number;
  sortOrder: number;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: string;
  testCases: ContentTestCase[];
};

type ContentFile = {
  track: {
    slug: string;
    title: string;
    description: string;
    sortOrder: number;
  };
  topic: {
    slug: string;
    title: string;
    description: string;
    sortOrder: number;
  };
  problems: ContentProblem[];
};

const CONTENT_DIR = path.join(process.cwd(), "prisma", "content", "practice");

function loadContentFiles(): ContentFile[] {
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();

  return files.map((name) => {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, name), "utf-8");
    return JSON.parse(raw) as ContentFile;
  });
}

async function main() {
  const host = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).host
    : "(DATABASE_URL unset)";
  console.log(`Seeding practice content on: ${host}`);

  const prisma = new PrismaClient();
  const files = loadContentFiles();

  let problemCount = 0;
  let testCaseCount = 0;

  try {
    for (const file of files) {
      const track = await prisma.practiceTrack.upsert({
        where: { slug: file.track.slug },
        create: {
          slug: file.track.slug,
          title: file.track.title,
          description: file.track.description,
          sortOrder: file.track.sortOrder,
        },
        update: {
          title: file.track.title,
          description: file.track.description,
          sortOrder: file.track.sortOrder,
          isActive: true,
        },
        select: { id: true, slug: true },
      });

      const topic = await prisma.practiceTopic.upsert({
        where: {
          trackId_slug: { trackId: track.id, slug: file.topic.slug },
        },
        create: {
          trackId: track.id,
          slug: file.topic.slug,
          title: file.topic.title,
          description: file.topic.description,
          sortOrder: file.topic.sortOrder,
        },
        update: {
          title: file.topic.title,
          description: file.topic.description,
          sortOrder: file.topic.sortOrder,
        },
        select: { id: true, slug: true },
      });

      for (const problem of file.problems) {
        const upserted = await prisma.practiceProblem.upsert({
          where: { slug: problem.slug },
          create: {
            topicId: topic.id,
            slug: problem.slug,
            title: problem.title,
            statement: problem.statement,
            inputFormat: problem.inputFormat,
            outputFormat: problem.outputFormat,
            constraintsMd: problem.constraints,
            starterCode: problem.starterCode,
            difficulty: problem.difficulty,
            maxScore: problem.maxScore,
            sortOrder: problem.sortOrder,
          },
          update: {
            topicId: topic.id,
            title: problem.title,
            statement: problem.statement,
            inputFormat: problem.inputFormat,
            outputFormat: problem.outputFormat,
            constraintsMd: problem.constraints,
            starterCode: problem.starterCode,
            difficulty: problem.difficulty,
            maxScore: problem.maxScore,
            sortOrder: problem.sortOrder,
            isActive: true,
          },
          select: { id: true, slug: true },
        });
        problemCount += 1;

        for (const testCase of problem.testCases) {
          await prisma.practiceTestCase.upsert({
            where: {
              problemId_ordinal: {
                problemId: upserted.id,
                ordinal: testCase.ordinal,
              },
            },
            create: {
              problemId: upserted.id,
              ordinal: testCase.ordinal,
              isSample: testCase.isSample,
              input: testCase.input,
              expected: testCase.expected,
              explanation: testCase.explanation ?? null,
            },
            update: {
              isSample: testCase.isSample,
              input: testCase.input,
              expected: testCase.expected,
              explanation: testCase.explanation ?? null,
            },
          });
          testCaseCount += 1;
        }

        console.log(
          `upserted problem ${upserted.slug} (${problem.testCases.length} cases)`,
        );
      }

      console.log(`upserted track=${track.slug} topic=${topic.slug}`);
    }

    const [tracks, topics, problems, cases] = await Promise.all([
      prisma.practiceTrack.count(),
      prisma.practiceTopic.count(),
      prisma.practiceProblem.count(),
      prisma.practiceTestCase.count(),
    ]);

    console.log(
      `Done. DB counts — tracks: ${tracks}, topics: ${topics}, problems: ${problems}, testCases: ${cases}`,
    );
    console.log(
      `This run upserted ${problemCount} problems / ${testCaseCount} test case rows from ${files.length} file(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
