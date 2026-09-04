/**
 * Scout agent evals — run with:
 *   npm run test:scout
 *
 * `--conditions=react-server` lets this import `server-only` modules.
 */
import { __test as explain } from "@/features/hire/explain-matches";
import { __test as agent } from "@/features/hire/scout-agent";
import { resolveVendor, __test as llm } from "@/lib/hire-llm";
import {
  briefTouched,
  extractPoolBrief,
  parseDays,
  parseResultLimit,
} from "@/features/hire/pool-brief";
import {
  TRACKS,
  describeTracks,
  findTrack,
  isKnownTrack,
  matchTracks,
  type TrackDescriptor,
} from "@/features/hire/track-registry";
import {
  EMPTY_COVERAGE,
  mergeTrackLoads,
  persistableSource,
  type TrackLoad,
} from "@/features/hire/track-loaders";
import { decodeCandidateRef } from "@/features/hire/candidate-ref";
import { parseMoney } from "@/features/hire/spec-fields";
import { searchableSpec, searchSpecFromJob } from "@/features/hire/reduce-spec";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EvidenceCoverage, ScoreableMember } from "@/features/hire/types";

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

const TRIVIA = "who is the prime minister of india";

console.log("\nthe reported bug — off-topic input must never search");

suite("geo alone is not a brief", () => {
  const b = extractPoolBrief(TRIVIA);
  assert(!briefTouched(b), "geo is not enough");
});

suite("a real track brief still is one", () => {
  const b = extractPoolBrief("5 student from cohort challnege");
  assert(briefTouched(b), "touched");
  assert(b.sources.includes("PROGRAM"), `got ${b.sources}`);
  assert(b.resultLimit === 5, `cap ${b.resultLimit}`);
});

console.log("\ngrounding guards");

suite("a reply quoting an unknown number is rejected", () => {
  assert(
    !agent.isGrounded("There are 94 people.", [{ n: 12 }], "how many"),
    "94 is ungrounded",
  );
});

suite("a reply quoting a tool figure is allowed", () => {
  assert(
    agent.isGrounded("There are 12 people.", [{ n: 12 }], "how many"),
    "12 is grounded",
  );
});

suite("quoting the recruiter's own number back is allowed", () => {
  assert(
    agent.isGrounded("You asked for 10 years.", [], "10 years of experience"),
    "quoted back",
  );
});

suite("the reported gap paragraph is now refused", () => {
  assert(explain.overreaches("All shortlisted candidates have 60 commit days"), "all");
});

suite("a counted claim is allowed", () => {
  assert(!explain.overreaches("The 6 shown here have verified missions"), "counted");
});

suite("a count written as a word cannot slip past the figure guard", () => {
  const allowed = new Set(["10", "2"]);
  assert(explain.inventsFigures("The six shown here are strong.", allowed), "six");
  assert(!explain.inventsFigures("The 10 shown here are strong.", allowed), "ten");
});

suite("bare 'none' is an absolute claim", () => {
  assert(explain.overreaches("none provide declared experience details"), "none");
});

console.log("\nmoney parsing");

suite("crore is a unit, and a hundredfold error when it is missing", () => {
  const parsed = parseMoney("1.2 crore", false);
  assert(parsed != null && parsed.min >= 10_000_000, JSON.stringify(parsed));
});

suite("a duration in the same sentence cannot become the budget floor", () => {
  const parsed = parseMoney("3 years experience, 12-18 lakhs", false);
  assert(parsed != null && parsed.min !== 3, JSON.stringify(parsed));
});

suite("a range inherits the unit its phrase names", () => {
  const parsed = parseMoney("25 LPA", false);
  assert(parsed != null && parsed.min === 2_500_000, JSON.stringify(parsed));
});

console.log("\nthe engine decides");

suite("Search now on a ready brief is recognised without the model", () => {
  assert(agent.wantsToSeeCards("now give me the list of candidate"), "list");
  assert(agent.wantsToSeeCards("Search now"), "search now");
  assert(
    !agent.wantsToSeeCards(
      "i want a full stack developer with 2 years of experience",
    ),
    "stating a role is not seeing cards",
  );
});

suite("a question is recognised", () => {
  assert(agent.looksLikeQuestion(TRIVIA), "trivia");
  assert(agent.looksLikeQuestion("how many candidates do you have?"), "pool");
});

suite("a legacy JobSpec with a title is searchable", () => {
  assert(searchableSpec(searchSpecFromJob({ title: "backend engineer" })), "title");
  assert(!searchableSpec(searchSpecFromJob({})), "empty");
});

suite("the vendor is resolved from configuration, never from input", () => {
  const v = resolveVendor();
  assert(v === "openai" || v === "groq" || v === null, String(v));
});

suite("a busy key is retried on the next key; a timeout is not", () => {
  assert(llm.rotatable(429, null), "429");
  assert(llm.rotatable(401, null), "401");
  const abort = new Error("stopped");
  abort.name = "AbortError";
  assert(!llm.rotatable(null, abort), "abort");
});

console.log("\ntrack merge");

const cov = (note: string): EvidenceCoverage => ({
  dimensions: { ...EMPTY_COVERAGE.dimensions },
  note,
});
const member = (userId: string): ScoreableMember => ({
  id: userId,
  userId,
  fullName: "",
  jobRole: "",
  company: "",
  yearsExperience: 0,
  skills: [],
  missionPoints: 0,
  missionsPassed: 0,
  missionsAttempted: 0,
  cleanPassCount: 0,
  totalScore: 0,
  commitDayCount: 0,
  projectScores: [],
  interview: null,
  cohortPublished: true,
  status: "ENROLLED",
  availability: null,
  cohortDay: 1,
  coverage: EMPTY_COVERAGE,
});
const load = (
  slug: string,
  users: string[],
  note = slug,
  below = 0,
): TrackLoad => ({
  slug,
  members: users.map(member),
  coverage: cov(note),
  belowEvidenceFloor: below,
  cohortName: slug === "PROGRAM" ? "AI Cohort 1" : null,
  stage: slug === "PROGRAM" ? "PUBLISHED" : null,
});

suite("one person in two tracks shows once, richest record winning", () => {
  const m = mergeTrackLoads([load("CLAUDE", ["u1", "u2"]), load("PROGRAM", ["u1"])]);
  assert(m.members.length === 2, `2 members, got ${m.members.length}`);
  assert(m.members[0]?.userId === "u1", "program record first");
});

suite("coverage comes from the highest-priority track that has people", () => {
  const m = mergeTrackLoads([
    load("PROGRAM", [], "prog"),
    load("CLAUDE", ["c1"], "claude"),
  ]);
  assert(m.coverage.note === "claude", "an empty track supplies nothing");
});

suite("below-floor counts sum across tracks", () => {
  const m = mergeTrackLoads([
    load("PROGRAM", ["p1"], "p", 7),
    load("CLAUDE", ["c1"], "c", 3),
  ]);
  assert(m.belowEvidenceFloor === 10, `10, got ${m.belowEvidenceFloor}`);
});

suite("a blank userId is not an identity and never collides", () => {
  const m = mergeTrackLoads([load("CLAUDE", ["", ""]), load("HACKATHON", [""])]);
  assert(m.members.length === 3, `3, got ${m.members.length}`);
});

suite("no tracks at all is empty, not a crash", () => {
  const m = mergeTrackLoads([]);
  assert(m.members.length === 0 && m.cohortName === null, "empty");
});

console.log("\nfuture-proofing: one descriptor for a new track");

suite("a track that did not exist becomes fully addressable", () => {
  const java: TrackDescriptor = {
    slug: "java-challenge",
    label: "Java Challenge",
    aliases: [/\bjava challenge\b/i, /\bjava training\b/i],
    evidenceKinds: ["katas passed", "commit days"],
    geo: "IN",
    supportsEvidenceDays: true,
    dedupePriority: 45,
    cohortSlug: "java-challenge-2026",
  };
  (TRACKS as TrackDescriptor[]).push(java);
  try {
    const said = "i need people who finished the java training";
    assert(findTrack("java-challenge")?.label === "Java Challenge", "resolves");
    assert(isKnownTrack("java-challenge"), "known");
    assert(
      describeTracks().some((t) => t.slug === "java-challenge"),
      "listed",
    );
    assert(
      matchTracks(said).some((t) => t.slug === "java-challenge"),
      "matched",
    );
    assert(persistableSource("java-challenge") === null, "not in the enum yet");
    assert(
      decodeCandidateRef("java-challenge:abc")?.source === "java-challenge",
      "registry-addressable",
    );
  } finally {
    const i = TRACKS.findIndex((t) => t.slug === "java-challenge");
    if (i >= 0) (TRACKS as TrackDescriptor[]).splice(i, 1);
  }
});

suite("an arbitrary client-supplied prefix is still rejected", () => {
  assert(decodeCandidateRef("PROGRAM:abc")?.source === "PROGRAM", "known");
  assert(decodeCandidateRef("MADEUP:abc") === null, "unknown");
});

console.log("\nparsers");

suite("a track name is not a day floor", () => {
  assert(parseDays("60 day challenge") === null, "60-day is a name");
  assert(parseDays("at least 30 days") === 30, "explicit floor");
  assert(parseDays("30+ days") === 30, "plus form");
});

suite("result caps read the way people write them", () => {
  assert(parseResultLimit("only 5") === 5, "only 5");
  assert(parseResultLimit("20 student from claude") === 20, "20 student");
  assert(parseResultLimit("give me three people") === 3, "word form");
});

console.log("\nboundary");

suite("no client module imports the agent or stage modules", () => {
  const { readdirSync, readFileSync, statSync } = fs;
  const { join } = path;
  const forbidden =
    /@\/features\/hire\/(scout-agent|scout-tools|scout-graph|track-loaders|intake|reduce-spec|normalize|criteria|rank)|@\/lib\/hire-llm/;
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(p) || /\.test\.tsx?$/.test(p)) continue;
      const src = readFileSync(p, "utf8");
      if (/^\s*["']use client["']/.test(src) && forbidden.test(src)) {
        offenders.push(p);
      }
    }
  };
  walk("src");
  assert(offenders.length === 0, `client modules importing server code: ${offenders.join(", ")}`);
});

if (failed) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
