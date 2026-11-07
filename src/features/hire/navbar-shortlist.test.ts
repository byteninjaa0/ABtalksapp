/**
 * Navbar shortlist integration — run with:
 *   npm run test:navbar-shortlist
 *
 * No network, no database. Source-level guards on the one property that broke
 * TC-R-004: a candidate shortlisted inside a talent project must reach the
 * Scout header, and the header's count must describe the same list it renders.
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

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** Comments explain the legacy table; only real calls to it should fail a test. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const reader = read("src/features/hire/project-shortlist.ts");
const layout = read("src/app/hire/layout.tsx");
const writers = read("src/app/actions/talent-project-actions.ts");
const card = read("src/components/hire/desk-match-card.tsx");
const pod = read("src/components/hire/hire-talent-pod.tsx");

console.log("navbar shortlist integration");

suite("project shortlist reads TalentRequestMatch.decision = SHORTLISTED", () => {
  assert(
    /decision:\s*"SHORTLISTED"/.test(reader),
    "listProjectShortlist must filter on SHORTLISTED",
  );
  assert(
    /prisma\.talentRequestMatch\.findMany/.test(reader),
    "must read TalentRequestMatch, not the legacy table",
  );
});

suite("project shortlist is scoped to the authenticated recruiter", () => {
  assert(
    /request:\s*\{\s*recruiterUserId,/.test(reader),
    "must scope by request.recruiterUserId — otherwise it leaks other recruiters",
  );
});

suite("archived projects do not occupy the header", () => {
  assert(/archivedAt:\s*null/.test(reader), "must exclude archived projects");
});

suite("UNDECIDED removal drops out of the navbar by construction", () => {
  // The reader selects only SHORTLISTED, so flipping a row to UNDECIDED removes
  // it. Guard that nothing widened the filter to include other decisions.
  assert(
    !/decision:\s*\{\s*in:/.test(reader),
    "filter must stay a single SHORTLISTED equality, not an `in` set",
  );
});

// Plan 133 changed the next four rules on purpose: the header now shows the
// OPEN project's shortlist (legacy rows only off-project), so it is no longer
// one merged, cross-project list. The guarantees they protected still hold.
const chrome = read("src/components/hire/hire-chrome.tsx");

suite("navbar count is derived from the rendered (scoped) list", () => {
  assert(
    /const scopedRows = scopePodRows\(podRows, openProjectId\);/.test(chrome) &&
      /scopedRows\.length \+ overlayCount/.test(chrome) &&
      /serverRows=\{scopedRows\}/.test(chrome),
    "count and panel must both come from the same scoped array",
  );
  assert(
    !/serverCartCount=\{account\?\.cartCount/.test(layout),
    "count must not come from the legacy-only account.cartCount",
  );
});

suite("navbar reads BOTH stores", () => {
  assert(
    /getShortlist\(userId\)/.test(layout) &&
      /listProjectShortlistByProject\(userId\)/.test(layout),
    "layout must read the legacy list and the per-project list",
  );
});

suite("no duplicate candidate rows within one project", () => {
  assert(
    /const key = `\$\{r\.requestId\}:\$\{r\.candidateRef\}`;/.test(layout),
    "project rows must dedupe per project × candidate",
  );
  assert(
    /if \(seen\.has\(key\)\) continue;/.test(layout),
    "a repeated project × candidate row must be skipped",
  );
});

suite("one row per candidate for the assessment builder's reader", () => {
  assert(
    /return loadShortlist\(recruiterUserId, \(r\) => r\.candidateUserId\);/.test(reader),
    "listProjectShortlist must still collapse a person to one row across projects",
  );
});

suite("non-program candidates never fake a ProgramMember identity", () => {
  assert(
    /memberId:\s*isProgram \? r\.programMemberId : null/.test(reader),
    "memberId must be null for non-program tracks",
  );
  assert(
    /isProgram \? r\.programMemberId : r\.candidateUserId/.test(reader),
    "the ref must carry candidateUserId for non-program tracks",
  );
});

suite("legacy RecruiterShortlistItem path is untouched", () => {
  assert(
    !/recruiterShortlistItem/i.test(stripComments(reader)),
    "the project reader must not touch the legacy table",
  );
  assert(
    /encodeCandidateRef\("PROGRAM", r\.memberId\)/.test(layout),
    "legacy rows must still be encoded exactly as before",
  );
});

suite("decision writes revalidate the LAYOUT, not just the page", () => {
  assert(
    /revalidatePath\("\/hire", "layout"\)/.test(writers),
    "the header lives in the /hire layout; a page-scoped revalidate leaves the count stale",
  );
});

suite("project card keeps the T-149 writer and its label", () => {
  assert(
    /pickDecision\("SHORTLISTED"\)/.test(card),
    "project button must write through the decision path",
  );
  assert(
    /"Add to shortlist"/.test(card) && /"In shortlist"/.test(card),
    "project labels must remain Add to shortlist / In shortlist",
  );
  assert(
    !/toggleShortlistAction/.test(card),
    "the card must not call the legacy cohort-restricted action directly",
  );
});

suite("Save for Later stays device-local and separate", () => {
  assert(
    !/desk-shortlist|klymb-hire-star/.test(reader) &&
      !/klymb-hire-star/.test(layout),
    "Save for Later must not be folded into the DB-backed shortlist",
  );
});

suite("pod removal of a project row uses T-149, not the legacy action", () => {
  assert(
    /if \(approved && row\.projectRequestId && row\.candidateUserId\)/.test(pod),
    "the pod must branch on project coordinates before the legacy path",
  );
  assert(
    /setMatchDecisionAction\(\{[\s\S]{0,160}decision: "UNDECIDED"/.test(pod),
    "project removal must write UNDECIDED through setMatchDecisionAction",
  );
  const projectBranch = pod.slice(
    pod.indexOf("row.projectRequestId && row.candidateUserId"),
    pod.indexOf("if (approved && row.memberId)"),
  );
  assert(
    !/toggleShortlistAction/.test(projectBranch),
    "the project branch must not call the legacy shortlist action",
  );
  assert(
    !/\.delete\(|deleteMany/.test(projectBranch),
    "removal must not delete the TalentRequestMatch row",
  );
});

suite("project rows carry their own display data (no localStorage needed)", () => {
  assert(
    /pickPublicEvidence/.test(reader),
    "project rows must hydrate evidence the same way the desk card does",
  );
  assert(
    /listProgramMemberLabels/.test(reader),
    "program rows must resolve their real jobRole/fullName",
  );
  assert(
    /yearsExperience|missionsPassed|certificateIssued/.test(reader),
    "project rows must carry the detail fields the panel renders",
  );
});

suite("project coordinates reach the pod", () => {
  assert(
    /projectRequestId: r\.requestId/.test(layout) &&
      /candidateUserId: r\.candidateUserId/.test(layout),
    "the layout must pass requestId + candidateUserId on project rows",
  );
});

console.log(`\n  ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
