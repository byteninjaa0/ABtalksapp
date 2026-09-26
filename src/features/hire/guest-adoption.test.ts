/**
 * Guest work survives sign-in — run with:
 *   npm run test:guest-adoption
 *
 * No network, no database. The regressions here are structural, so this asserts
 * the shape of the flow rather than a value, in the same spirit as
 * visibility.test.ts.
 *
 * Three of them are the bugs this change fixes, and each one was silent:
 *  1. adoption wrote no match rows and had no field to carry them;
 *  2. status came from the guest's intent, so a request could claim MATCHED
 *     while holding zero matches;
 *  3. the completion latch was set before adoption ran and the result was
 *     discarded, so a failure was never surfaced and never retried.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adoptGuestScoutSessionSchema } from "@/lib/validations/hire";

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
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const actions = read("src/app/actions/hire-actions.ts");
const actionsCode = strip(actions);
const merge = read("src/components/hire/merge-guest-cart.tsx");
const mergeCode = strip(merge);

// Two regions, kept apart on purpose: the match helper must contain no slow
// work inside a transaction, and the action's transaction must contain no slow
// work at all. Slicing them together would let one satisfy the other's rule.
const adoptStart = actionsCode.indexOf("async function adoptGuestMatches");
const actionStart = actionsCode.indexOf(
  "export async function adoptGuestScoutSessionAction",
);
const actionEnd = actionsCode.indexOf(
  "export async function recordSampleDemandAction",
);
const adoptRegion = actionsCode.slice(adoptStart, actionStart);
const actionRegion = actionsCode.slice(
  actionStart,
  actionEnd > actionStart ? actionEnd : undefined,
);

console.log("\nguest adoption");

suite("adoption persists match rows", () => {
  assert(adoptStart > -1, "adoptGuestMatches is missing");
  assert(
    adoptRegion.includes("talentRequestMatch.upsert"),
    "adoption must write TalentRequestMatch rows",
  );
});

suite("the client may send identity, and only identity", () => {
  const shape = adoptGuestScoutSessionSchema.shape as Record<string, unknown>;
  assert("candidateRefs" in shape, "candidateRefs must be accepted");
  for (const forbidden of ["score", "tier", "evidence", "rationale", "matches", "order"]) {
    assert(
      !(forbidden in shape),
      `${forbidden} must never be accepted from the client`,
    );
  }
});

suite("a forged or stale ref cannot bypass the pool gate", () => {
  assert(
    adoptRegion.includes("resolveEligibleCandidates"),
    "every client ref must be re-tested by resolveEligibleCandidates",
  );
});

suite("the guest result set is intersected, never broadened", () => {
  // A plain re-run would adopt candidates the recruiter never saw.
  assert(
    /entitledRefs\.has\(/.test(adoptRegion),
    "the re-run must be filtered to the refs the guest actually saw",
  );
});

suite("no model call on the adoption path", () => {
  assert(
    adoptRegion.includes("explainMatchesDeterministic"),
    "adoption must use the deterministic explainer",
  );
  assert(
    !/[^a-zA-Z]explainMatches\(/.test(adoptRegion),
    "adoption must not call the model-backed explainMatches",
  );
});

suite("the slow work is outside the interactive transaction", () => {
  assert(
    !adoptRegion.includes("$transaction(async (tx)"),
    "adoptGuestMatches must not open an interactive transaction",
  );
  // The action keeps its interactive transaction for the two fast writes; what
  // must never enter it is the search. A full search inside an interactive
  // transaction pins a connection for its whole duration.
  const txStart = actionRegion.indexOf("$transaction(async (tx)");
  assert(txStart > -1, "the request/messages transaction should still exist");
  const txBody = actionRegion.slice(txStart, actionRegion.indexOf("});", txStart));
  for (const slow of ["searchCandidates", "resolveEligibleCandidates", "adoptGuestMatches"]) {
    assert(!txBody.includes(slow), `${slow} must not run inside the transaction`);
  }
});

suite("status comes from the outcome, not the guest's intent", () => {
  assert(
    !/searched\s*\?\s*TalentRequestStatus\.MATCHED/.test(actionRegion),
    "status must not be set from `searched` — that is the MATCHED-with-0-matches bug",
  );
  assert(
    /adopted > 0\s*\?\s*TalentRequestStatus\.MATCHED/.test(actionRegion),
    "MATCHED must require at least one adopted match",
  );
});

suite("adoption failure is surfaced and stays retryable", () => {
  assert(
    /if \(!adopted\.ok\)/.test(mergeCode),
    "the adoption result must be checked, not discarded",
  );
  const latch = mergeCode.indexOf("done.current = true");
  const call = mergeCode.indexOf("adoptGuestScoutSessionAction(");
  assert(
    latch > call,
    "the completion latch must be set after adoption, never before it",
  );
});

suite("the guest copy is dropped only after a successful adoption", () => {
  // Two copies of the same search is the failure mode: the browser would keep
  // rendering every candidate it cached while the account holds only the ones
  // that survived, so the "N of M are still available" count would be a lie.
  assert(
    mergeCode.includes("clearGuestSession") && mergeCode.includes("clearGuestMatches"),
    "a successful adoption must drop the browser's copy",
  );
  const fail = mergeCode.indexOf("if (!adopted.ok)");
  const clear = mergeCode.indexOf("clearGuestSession()");
  assert(
    fail > -1 && clear > fail,
    "clearing must sit after the failure branch — a pending recruiter's copy is the only one there is",
  );
  // Clearing without landing somewhere server-rendered would be an empty desk,
  // which is worse than the silent drop this replaces.
  //
  // The hand-off is a full navigation rather than `router.replace`: the
  // session is minutes old and `/hire/[requestId]` renders behind
  // `requireRecruiter`, and a soft transition onto a server-gated page was
  // leaving the recruiter on /hire with an empty desk while the adopted search
  // showed in the side panel. What this pins is the ordering, not the
  // mechanism — the move must still happen before the browser copy is dropped.
  const redirect = mergeCode.indexOf("window.location.href = `/hire/${");
  assert(
    redirect > -1 && redirect < clear,
    "the recruiter must be moved to the saved request before the browser copy is dropped",
  );
});

suite("a partial adoption is reported to the recruiter", () => {
  assert(
    /adopted\.data\.skipped > 0/.test(mergeCode),
    "the skipped count must reach the UI, not just the action's return value",
  );
});

suite("entitled candidates the re-run missed are logged", () => {
  assert(
    /logger\.error\([^)]*entitled but not returned/.test(adoptRegion.replace(/\s+/g, " ")) ||
      adoptRegion.includes("entitled but not returned"),
    "raising the limit narrows this window; without a log the real rate is unknowable",
  );
  assert(
    adoptRegion.includes("ADOPTION_SEARCH_LIMIT"),
    "the log must record which limit produced the shortfall",
  );
});

suite("the cart merge is untouched and the star is not read here", () => {
  // Cart transfer already worked; the star is device-local by design (§3B).
  assert(
    mergeCode.includes("mergeGuestCartAction"),
    "cart merge must remain in place",
  );
  assert(
    !mergeCode.includes("readDeskShortlist"),
    "the star must not be read or moved by sign-in — it is device-local",
  );
  assert(
    !mergeCode.includes("abtalks-hire-star"),
    "sign-in must not touch the star's storage key",
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
