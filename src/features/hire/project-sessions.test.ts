/**
 * Plan 133 — projects and search sessions (pure + source assertions).
 *
 * The database behaviours (persistence, isolation between projects and
 * recruiters, legacy → Session 1) are proved against Postgres by
 * `npm run db:check:project-sessions`. This file guards the rules a unit test
 * can see: the scoping helpers, and that the code paths that decide leakage
 * still route through the session-aware functions.
 *
 * Run: npm run test:project-sessions
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectIdFromPath, scopePodRows } from "@/components/hire/shortlist-scope";
import type { CartRow } from "@/components/hire/shortlist-cart";
import { sessionTitleFrom, snapshotFromJson } from "@/features/hire/search-sessions";

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
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function row(ref: string, projectRequestId?: string): CartRow {
  return {
    candidateRef: ref,
    memberId: null,
    jobRole: "Engineer",
    totalScore: 80,
    note: null,
    revealedName: null,
    engagementStatus: null,
    ...(projectRequestId ? { projectRequestId, candidateUserId: ref } : {}),
  };
}

console.log("\nPlan 133 — projects and search sessions\n");

/* ─── which project is open ─────────────────────────────────────────────── */

suite("a project URL names its project", () => {
  assert(projectIdFromPath("/hire/ckproj000000000000000001") === "ckproj000000000000000001", "plain");
  assert(projectIdFromPath("/hire/ckproj000000000000000001/candidates") === "ckproj000000000000000001", "candidates");
});

suite("pages under /hire are not projects", () => {
  for (const p of ["/hire", "/hire/requests", "/hire/messages", "/hire/matches", "/hire/assessments", "/hire/jobs", "/hire/create-test", "/hire/evidence", "/hire/profile", "/hire/messages/abc", "/profile"]) {
    assert(projectIdFromPath(p) === null, `${p} read as a project`);
  }
});

/* ─── the header shortlist is one project's ─────────────────────────────── */

suite("inside Project A only A's shortlist shows", () => {
  const rows = [row("r1", "A"), row("r2", "B"), row("legacy")];
  const a = scopePodRows(rows, "A");
  assert(a.length === 1 && a[0]!.candidateRef === "r1", JSON.stringify(a));
});

suite("Project A's shortlist never shows in Project B", () => {
  const b = scopePodRows([row("r1", "A")], "B");
  assert(b.length === 0, "A's row leaked into B");
});

suite("the legacy list is never shown as a project's", () => {
  const rows = [row("r1", "A"), row("legacy")];
  assert(!scopePodRows(rows, "A").some((r) => r.candidateRef === "legacy"), "legacy inside a project");
  const off = scopePodRows(rows, null);
  assert(off.length === 1 && off[0]!.candidateRef === "legacy", "off-project should be legacy only");
});

/* ─── sessions ──────────────────────────────────────────────────────────── */

suite("a session is titled with the recruiter's prompt", () => {
  assert(sessionTitleFrom("Find React developers in Delhi NCR", 3) === "Find React developers in Delhi NCR", "kept");
  assert(sessionTitleFrom("   ", 2) === "Search 2", "blank falls back to a number");
  assert(sessionTitleFrom("x".repeat(200), 1).length === 80, "trimmed to 80");
});

suite("a session's scoring snapshot survives a round trip and rejects junk", () => {
  const snap = snapshotFromJson([
    { candidateUserId: "u1", score: 90, tier: "STRONG", gaps: ["a", 3], rationale: "r" },
    { score: 1 },
    "nope",
  ]);
  assert(snap.size === 1 && snap.get("u1")?.score === 90, "one valid row");
  assert(snap.get("u1")?.gaps.join() === "a", "non-string gaps dropped");
});

/* ─── the code paths that decide leakage ────────────────────────────────── */

const actions = strip(read("src/app/actions/hire-actions.ts"));
const send = actions.slice(actions.indexOf("export async function sendScoutMessageAction"), actions.indexOf("export async function runMatchAction"));
const run = actions.slice(actions.indexOf("export async function runMatchAction"), actions.indexOf("export async function saveCandidateAvailabilityAction"));

suite("a Scout turn reads and writes ONE session's history", () => {
  assert(/findMany\(\{\s*where: \{ sessionId \}/.test(send), "history must be the session's, not the project's");
  assert(/sessionId,\s*role: "user"/.test(send), "user turn must carry sessionId");
  assert(/sessionId,\s*role: "assistant"/.test(send), "assistant turn must carry sessionId");
  assert(send.includes("createSession({ requestId, title: display ?? message })"), "no session id → a NEW session");
  assert(send.includes("await ensureLegacySession(requestId)"), "legacy history must become Session 1 first");
});

suite("a match run belongs to a session and cannot erase another's results", () => {
  assert(run.includes("recordSessionRun("), "run must save this session's results");
  assert(run.includes("await pruneUndecidedOutsideSessions(req.id)"), "prune must respect every session");
  assert(!/candidateUserId: \{ notIn: keptCandidateIds \}/.test(run), "the old this-run-only delete must be gone");
  assert(run.indexOf("recordSessionRun(") < run.indexOf("pruneUndecidedOutsideSessions("), "record before prune");
});

suite("the one-row-per-person shortlist the assessment builder reads is unchanged", () => {
  const src = read("src/features/hire/project-shortlist.ts");
  assert(src.includes("return loadShortlist(recruiterUserId, (r) => r.candidateUserId);"), "listProjectShortlist must still dedupe per person");
});

suite("the assessment system does not own project filing (plan 133, D-3)", () => {
  // Filing an assessment under a project stays in TalentProjectAssessment, read
  // and written by the hire module alone. The assessment system may be TOLD
  // which project's shortlist to offer (D-4: a projectId filter on the
  // assignable pool) — that is a scope argument, not a link it owns.
  for (const f of [
    "src/features/recruiter-assessments/service.ts",
    "src/features/recruiter-assessments/prisma-store.ts",
    "src/app/actions/recruiter-assessment-actions.ts",
  ]) {
    assert(!/talentProjectAssessment|projectLink|project-assessments/.test(read(f)), `${f} was touched`);
  }
});

suite("the assessment send list is one project's, never a union (plan 133, D-4)", () => {
  const store = strip(read("src/features/recruiter-assessments/prisma-store.ts"));
  const pool = store.slice(store.indexOf("async listAssignableCandidates("));
  assert(pool.includes("listProjectShortlistForProject("), "the pool must read ONE project's shortlist");
  assert(!pool.includes("listProjectShortlist("), "the recruiter-wide union must not be the send list");
  // Off-project it is the legacy list, on-project it is the project's — the
  // same two cases scopePodRows has, and never both at once.
  assert(/projectId \? null : getShortlist\(/.test(pool), "legacy half must be off-project only");

  const pod = read("src/components/hire/hire-talent-pod.tsx");
  assert(pod.includes("/hire/create-test?projectId="), "the pod CTA must carry the open project");
});

suite("New project creates a real project; New search stays in it", () => {
  const chat = strip(read("src/components/hire/scout-chat.tsx"));
  const np = chat.slice(chat.indexOf("function newProject()"), chat.indexOf("function newProject()") + 600);
  assert(/if \(persist\) \{\s*setNewProjectOpen\(true\);\s*return;/.test(np), "persisted New project must open the create dialog");
  const ns = chat.slice(chat.indexOf("function newSearch()"), chat.indexOf("function newSearch()") + 500);
  assert(ns.includes("setSessionId(null)"), "New search must drop the session, not the project");
  assert(!ns.includes("setRequestId("), "New search must keep the project");
});

suite("each session is its own conversation on screen", () => {
  const page = read("src/app/hire/[requestId]/page.tsx");
  assert(page.includes('key={selected?.id ?? "new"}'), "ScoutChat must remount per session");
  assert(page.includes("await ensureLegacySession(request.id)"), "opening a legacy project must file it as Session 1");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
