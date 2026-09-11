/**
 * PR module label matcher.
 *   node scripts/pr-module-labels.test.mjs
 */
import {
  classifyFiles,
  globToRegExp,
  matchModule,
  matchPattern,
  moduleLabel,
  primaryLabel,
} from "./pr-module-labels.mjs";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function suite(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${(error instanceof Error ? error.message : error)}`);
  }
}

console.log("\nPR module labels");

suite("glob ** matches a directory and its children", () => {
  assert(matchPattern("src/app/profile", "src/app/profile/**"), "dir itself");
  assert(matchPattern("src/app/profile/page.tsx", "src/app/profile/**"), "child");
  assert(!matchPattern("src/app/profile-old/page.tsx", "src/app/profile/**"), "prefix sibling");
});

suite("glob * does not cross slashes", () => {
  const re = globToRegExp("src/features/hire/credits*");
  assert(re.test("src/features/hire/credits.ts"), "credits.ts");
  assert(re.test("src/features/hire/credits.test.ts"), "credits.test.ts");
  assert(!re.test("src/features/hire/nested/credits.ts"), "nested");
});

suite("profile paths map to profile", () => {
  assert(matchModule("src/app/profile/page.tsx") === "profile", "app profile");
  assert(matchModule("src/features/resume/ingest.ts") === "profile", "resume");
  assert(matchModule("src/repositories/candidate-detail.ts") === "profile", "candidate repo");
});

suite("hire credits files are credits, not search", () => {
  assert(matchModule("src/features/hire/credits.ts") === "credits", "credits.ts");
  assert(matchModule("src/features/hire/unlock-contact.ts") === "credits", "unlock");
  assert(matchModule("src/app/actions/hire-unlock-actions.ts") === "credits", "unlock action");
});

suite("leftover hire desk files default to search", () => {
  assert(matchModule("src/features/hire/scout-agent.ts") === "search", "scout");
  assert(matchModule("src/app/hire/page.tsx") === "search", "hire home");
  assert(matchModule("src/components/hire/scout-chat.tsx") === "search", "scout chat");
});

suite("assessment split: candidate vs recruiter builder", () => {
  assert(
    matchModule("src/components/hire/assessment/candidate-assessment-screen.tsx") ===
      "assessments",
    "candidate screen",
  );
  assert(
    matchModule("src/components/hire/assessment/assessment-builder.tsx") ===
      "recruiter-assessments",
    "builder",
  );
  assert(matchModule("src/app/assessments/page.tsx") === "assessments", "candidate route");
  assert(matchModule("src/app/hire/create-test/page.tsx") === "recruiter-assessments", "create-test");
});

suite("pipeline / outreach / jobs do not collapse into search", () => {
  assert(matchModule("src/features/hire/shortlist.ts") === "pipeline", "shortlist");
  assert(matchModule("src/app/hire/messages/page.tsx") === "outreach", "hire messages");
  assert(matchModule("src/app/hire/jobs/page.tsx") === "jobs", "hire jobs");
});

suite("auth, ui, database, security", () => {
  assert(matchModule("middleware.ts") === "auth", "middleware");
  assert(matchModule("src/auth.config.ts") === "auth", "auth.config");
  assert(matchModule("src/components/ui/button.tsx") === "ui", "button");
  assert(matchModule("src/app/globals.css") === "ui", "globals");
  assert(matchModule("prisma/schema.prisma") === "database", "schema");
  assert(matchModule("src/lib/rate-limit.ts") === "security", "rate-limit");
  assert(matchModule("src/features/hire/isolation.test.ts") === "security", "isolation");
});

suite("hire feature CSS stays with search, not ui", () => {
  assert(matchModule("src/app/hire/hire-scout.css") === "search", "hire-scout.css");
});

suite("platform config action is config, other admin actions are admin", () => {
  assert(matchModule("src/app/actions/admin-platform-actions.ts") === "config", "platform");
  assert(matchModule("src/app/actions/admin-actions.ts") === "admin", "admin-actions");
});

suite("unknown files are unmapped", () => {
  assert(matchModule("totally/unknown.bin") === "unmapped", "unknown");
});

suite("primary is the module with the most files", () => {
  const result = classifyFiles([
    { path: "src/app/profile/page.tsx" },
    { path: "src/features/profile/completeness.ts" },
    { path: "src/features/hire/credits.ts" },
  ]);
  assert(result.primary === "profile", `primary was ${result.primary}`);
  assert(result.modules.map((row) => row.id).includes("credits"), "credits still labeled");
  assert(result.modules.map((row) => row.id).includes("profile"), "profile labeled");
});

suite("file-count tie breaks on changed lines", () => {
  const result = classifyFiles([
    { path: "src/app/profile/page.tsx", additions: 2, deletions: 0 },
    { path: "src/features/hire/credits.ts", additions: 20, deletions: 5 },
  ]);
  assert(result.primary === "credits", `primary was ${result.primary}`);
});

suite("label names use module: and primary: prefixes", () => {
  assert(moduleLabel("search") === "module:search", "module");
  assert(primaryLabel("search") === "primary:search", "primary");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
