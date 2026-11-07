/**
 * T-259 Test D — the instrumented money and contact paths emit what they claim
 * to, and leak nothing.
 *   npm run test:observability:paths
 *
 * These paths log through the *process* logger, which pino writes to fd 1
 * through SonicBoom — `process.stdout.write` cannot be patched to intercept it.
 * So the test re-executes itself as a child process and reads the child's real
 * stdout. What is asserted is therefore the actual bytes production would emit,
 * not a re-plumbed copy of them.
 *
 * Both paths are driven into their failure branch on purpose: a fake Prisma
 * transaction that rejects for money, and no reachable database for contact.
 * Failure is where the leaks live — that is where errors carry provider text,
 * and where a fail-open bug would be invisible.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { applyPointsChange } from "@/repositories/points";
import { hasContactAccess } from "@/features/hire/contact-access";
import { PointsSourceType, type Prisma } from "@prisma/client";

const RECRUITER_ID = "cmrecruiter0000000000001";
const CANDIDATE_ID = "cmcandidate000000000001";
const USER_ID = "cmuser00000000000000001";
/** Planted where an error message could carry it, to prove it never surfaces. */
const CANDIDATE_EMAIL = "priya.sharma@example.com";
const CANDIDATE_PHONE = "+91 98765 43210";

// ---------------------------------------------------------------------------
// child mode: run one instrumented path, let its real log lines hit stdout
// ---------------------------------------------------------------------------

/** A transaction client that fails the way a dropped connection does. */
function rejectingTx(message: string): Prisma.TransactionClient {
  return {
    user: {
      findUnique: async () => {
        throw new Error(message);
      },
    },
  } as unknown as Prisma.TransactionClient;
}

/** A transaction client where the user simply is not there. */
function emptyTx(): Prisma.TransactionClient {
  return {
    user: { findUnique: async () => null },
  } as unknown as Prisma.TransactionClient;
}

async function child(which: string) {
  if (which === "money-not-found") {
    await applyPointsChange(emptyTx(), {
      userId: USER_ID,
      amount: -250,
      mode: "debit_strict",
      sourceType: PointsSourceType.REDEMPTION,
      sourceId: "redemption-0001",
      idempotencyKey: "redeem:redemption-0001",
      // Callers compose this freely, so it is the field most likely to end up
      // holding something private. It must not appear in the log line.
      reason: `Redeemed hoodie for ${CANDIDATE_EMAIL} / ${CANDIDATE_PHONE}`,
    });
    return;
  }

  if (which === "money-throws") {
    try {
      await applyPointsChange(
        rejectingTx(
          `Can't reach database server at postgres://neon_user:sup3rs3cret@ep-x.aws.neon.tech/db`,
        ),
        {
          userId: USER_ID,
          amount: 100,
          mode: "credit",
          sourceType: PointsSourceType.REFERRAL,
          idempotencyKey: "referral-0001",
        },
      );
    } catch {
      // Expected: the money path rethrows so the transaction rolls back.
    }
    return;
  }

  if (which === "contact-fails") {
    // No reachable database, so the query throws inside the gate.
    const allowed = await hasContactAccess(RECRUITER_ID, CANDIDATE_ID);
    console.log(JSON.stringify({ __result: allowed }));
    return;
  }

  throw new Error(`unknown child mode ${which}`);
}

// ---------------------------------------------------------------------------
// parent mode
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): asserts cond {
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

type Line = Record<string, unknown>;

function runChild(mode: string): { raw: string; lines: Line[] } {
  const self = fileURLToPath(import.meta.url);
  const res = spawnSync(
    process.execPath,
    [require.resolve("tsx/cli"), self],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        T259_CHILD: mode,
        NODE_OPTIONS: "--conditions=react-server",
        ENABLE_NEW_POINTS_WRITES: "true",
        ENABLE_DUAL_WRITE: "false",
        LOG_LEVEL: "debug",
        // Unreachable on purpose: the contact gate must fail, not hang.
        DATABASE_URL:
          "postgresql://u:p@127.0.0.1:1/none?connect_timeout=1&pool_timeout=1",
        DIRECT_URL:
          "postgresql://u:p@127.0.0.1:1/none?connect_timeout=1&pool_timeout=1",
      },
      timeout: 120_000,
    },
  );
  const raw = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const lines: Line[] = [];
  for (const l of raw.split("\n")) {
    const t = l.trim();
    if (!t.startsWith("{")) continue;
    try {
      lines.push(JSON.parse(t) as Line);
    } catch {
      // Not one of ours (a Prisma banner, a stack frame).
    }
  }
  return { raw, lines };
}

function assertNoSecrets(raw: string, where: string) {
  for (const secret of [
    CANDIDATE_EMAIL,
    "priya.sharma",
    "sup3rs3cret",
    "9876543210",
  ]) {
    assert(!raw.includes(secret), `${where} leaked ${secret}\n      ${raw.slice(0, 800)}`);
  }
  // The phone number is written with spaces in the reason string.
  assert(!raw.includes("98765 43210"), `${where} leaked the phone number`);
}

function main() {
  console.log("\nT-259 instrumented money + contact paths");

  // --- money ---------------------------------------------------------------

  const notFound = runChild("money-not-found");

  suite("a debit emits attempt then failed, with the identifiers to trace it", () => {
    const attempt = notFound.lines.find((l) => l.event === "credit.debit.attempt");
    assert(attempt, `no credit.debit.attempt in:\n${notFound.raw}`);
    assert(attempt.userId === USER_ID, "the account must be identified");
    assert(attempt.amount === -250, "the signed amount must be logged");
    assert(
      attempt.idempotencyKey === "redeem:redemption-0001",
      "the idempotency key is what makes a double-spend identifiable",
    );
    assert(attempt.sourceType === "REDEMPTION", "the source must be logged");

    const fail = notFound.lines.find((l) => l.event === "credit.debit.failed");
    assert(fail, `no credit.debit.failed in:\n${notFound.raw}`);
    assert(fail.reason === "not_found", `expected not_found, got ${fail.reason}`);
    assert(fail.level === "error", "a money failure must log at error level");
  });

  suite("the money log is structured JSON, one object per line", () => {
    assert(notFound.lines.length >= 2, "expected at least two JSON log lines");
    for (const l of notFound.lines) {
      assert(l.service === "klymb-web", "every line must name the service");
      assert(typeof l.env === "string", "every line must name the environment");
      assert(
        typeof l.time === "string" && l.time.includes("T"),
        `expected an ISO timestamp, got ${JSON.stringify(l.time)}`,
      );
    }
  });

  suite("the caller's free-text `reason` never reaches the money log", () => {
    assertNoSecrets(notFound.raw, "money path");
    assert(
      !notFound.raw.includes("Redeemed hoodie"),
      "the composed reason string must not be logged at all",
    );
  });

  const threw = runChild("money-throws");

  suite("a money path that throws is reported, not swallowed", () => {
    const fail = threw.lines.find((l) => l.event === "credit.failed");
    assert(fail, `no credit.failed in:\n${threw.raw}`);
    assert(
      typeof fail.reason === "string" && (fail.reason as string).length > 0,
      "a safe failure reason must be attached",
    );
    assert(
      fail.idempotencyKey === "referral-0001",
      "the failure must carry the idempotency key",
    );
  });

  suite("a database error's connection string never reaches the log", () => {
    assert(
      !threw.raw.includes("sup3rs3cret"),
      `the connection password leaked:\n${threw.raw.slice(0, 800)}`,
    );
    assert(
      !threw.raw.includes("neon_user:"),
      "the connection credentials leaked",
    );
  });

  // --- contact -------------------------------------------------------------

  const contact = runChild("contact-fails");

  suite("the contact gate logs attempt and failure with safe ids only", () => {
    const attempt = contact.lines.find((l) => l.event === "contact.resolve.attempt");
    assert(attempt, `no contact.resolve.attempt in:\n${contact.raw}`);
    assert(attempt.recruiterId === RECRUITER_ID, "the recruiter must be identified");
    assert(attempt.candidateId === CANDIDATE_ID, "the candidate must be identified");
    assert(
      attempt.route === "hire:hasContactAccess",
      "the route belongs on the line",
    );

    const fail = contact.lines.find((l) => l.event === "contact.resolve.failed");
    assert(fail, `no contact.resolve.failed in:\n${contact.raw}`);
    assert(fail.recruiterId === RECRUITER_ID, "the failure must name the recruiter");
    assert(fail.candidateId === CANDIDATE_ID, "the failure must name the candidate");
  });

  suite("the contact gate fails closed", () => {
    const result = contact.lines.find((l) => "__result" in l);
    assert(result, `the child did not report a result:\n${contact.raw}`);
    assert(
      result.__result === false,
      "a gate that errors must answer 'no access', never 'yes'",
    );
  });

  suite("no candidate contact detail appears anywhere in the contact log", () => {
    assertNoSecrets(contact.raw, "contact path");
    // The ids are opaque and must survive — that is what the log is for.
    assert(contact.raw.includes(CANDIDATE_ID), "the candidate id must be logged");
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

const mode = process.env.T259_CHILD;
if (mode) {
  void child(mode);
} else {
  main();
}
