/**
 * Match state survives a re-run — run with:
 *   npm run test:match-persistence
 *
 * No network, no database. The regression this guards is structural, not
 * numeric: `runMatchAction` used to `deleteMany` every row for a request and
 * `createMany` them back, which made `firstSeenAt`, `viewedAt` and `decision`
 * unkeepable — a re-run silently handed the recruiter a brand-new row and
 * erased what they had already decided. No value assertion catches that; what
 * catches it is the *shape* of the write, so this is a source scan, in the same
 * spirit as visibility.test.ts.
 *
 * It also pins the three columns and the unique key they depend on, because the
 * upsert is meaningless without `@@unique([requestId, candidateUserId])`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function assert(cond: boolean | undefined, msg: string) {
  if (!cond) throw new Error(msg);
}

function suite(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

const action = readFileSync(
  join(process.cwd(), "src/app/actions/hire-actions.ts"),
  "utf8",
);
const schema = readFileSync(
  join(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);
const reader = readFileSync(
  join(process.cwd(), "src/features/hire/load-request-matches.ts"),
  "utf8",
);

// Comments are allowed to describe the old write; code is not.
const actionCode = action
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

const STATE_COLUMNS = ["firstSeenAt", "viewedAt", "decision"] as const;

console.log("\nmatch persistence");

suite("the match run no longer recreates every row", () => {
  assert(
    !actionCode.includes("talentRequestMatch.createMany"),
    "createMany rebuilds rows from scratch and loses match state; upsert instead",
  );
  assert(
    actionCode.includes("talentRequestMatch.upsert"),
    "runMatchAction must upsert matches so existing rows keep their state",
  );
});

suite("only candidates that dropped out are deleted", () => {
  const deletes = actionCode.match(
    /talentRequestMatch\.deleteMany\(\{[\s\S]*?\n\s{6}\}\)/g,
  );
  assert(deletes != null && deletes.length === 1, "expected exactly one deleteMany");
  assert(
    deletes![0].includes("notIn"),
    "the delete must spare candidates still in the results (notIn the kept ids)",
  );
});

suite("the upsert's update branch never touches match state", () => {
  // `update: scoring` is the whole point: `scoring` is the row minus its keys,
  // and the three state columns are never members of it because nothing in the
  // action ever assigns them.
  for (const col of STATE_COLUMNS) {
    assert(
      !actionCode.includes(`${col}:`),
      `runMatchAction assigns ${col}; it must be left to the DB default / the recruiter`,
    );
  }
});

suite("schema carries the state columns and the key the upsert needs", () => {
  for (const col of STATE_COLUMNS) {
    assert(schema.includes(col), `schema is missing ${col}`);
  }
  assert(
    schema.includes("@@unique([requestId, candidateUserId])"),
    "upsert has no unique key to target without @@unique([requestId, candidateUserId])",
  );
  assert(
    /enum TalentMatchDecision \{[\s\S]*?UNDECIDED[\s\S]*?SHORTLISTED[\s\S]*?REJECTED/.test(
      schema,
    ),
    "TalentMatchDecision must have UNDECIDED / SHORTLISTED / REJECTED",
  );
});

suite("firstSeenAt has something to be compared against", () => {
  // A per-match first-seen date answers nothing on its own; the "new since your
  // last visit" badge needs the request's last visit too.
  assert(
    /model TalentRequest \{[\s\S]*?lastViewedAt[\s\S]*?\n\}/.test(schema),
    "TalentRequest.lastViewedAt is missing",
  );
  assert(
    reader.includes("lastViewedAt: true") && reader.includes("firstSeenAt: true"),
    "loadRequestMatches must select both halves of the comparison",
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
