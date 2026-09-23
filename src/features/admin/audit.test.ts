/**
 * T-270-minimum writeAudit.
 *   npm run test:audit
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

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

console.log("\nT-270 writeAudit");

const audit = read("src/features/admin/audit.ts");

suite("writeAudit is the only export and creates a row", () => {
  assert(audit.includes("export async function writeAudit"), "writeAudit export");
  assert(audit.includes("tx.adminAction.create"), "creates AdminAction");
  assert(!audit.includes("adminAction.update"), "no update");
  assert(!audit.includes("adminAction.delete"), "no delete");
  assert(
    (audit.match(/export async function/g) ?? []).length === 1,
    "only writeAudit",
  );
});

suite("writeAudit stores actor, entity, reason, before/after", () => {
  assert(audit.includes("actorUserId: input.actorUserId"), "actorUserId");
  assert(audit.includes("entityType: input.entityType"), "entityType");
  assert(audit.includes("entityId: input.entityId"), "entityId");
  assert(audit.includes("reason: input.reason"), "reason");
  assert(audit.includes("previousState:"), "previousState");
  assert(audit.includes("newState:"), "newState");
});

suite("callers pass reason, previousState, newState", () => {
  const ops = read("src/features/admin/account-ops.ts");
  const del = read("src/features/profile/delete-own-account.ts");
  const cfg = read("src/lib/platform-config.ts");
  for (const [name, src] of [
    ["account-ops", ops],
    ["delete-own-account", del],
    ["platform-config", cfg],
  ] as const) {
    assert(src.includes("writeAudit("), `${name} calls writeAudit`);
    assert(src.includes("previousState:"), `${name} previousState`);
    assert(src.includes("newState:"), `${name} newState`);
    assert(src.includes("reason:"), `${name} reason`);
  }
});

suite("admin resume file route is gated, scoped and audited", () => {
  const src = read("src/app/api/admin/candidates/[id]/resume/route.ts");
  assert(
    src.includes("getAdminContext"),
    "must gate on getAdminContext",
  );
  assert(
    // The call form, not the bare name: the route's header comment explains
    // why `requireAdmin` is the wrong gate here, and that prose is worth keeping.
    !src.includes("requireAdmin("),
    "must not call requireAdmin — it redirects, which answers a denied binary request with an HTML page at 200",
  );
  assert(
    src.includes("getResumeFilePathForAdmin"),
    "must resolve the blob path server-side from the candidate id",
  );
  assert(
    src.includes("paramsSchema.safeParse(await params)"),
    "the candidate id must be validated before it is used",
  );
  assert(
    !src.includes("searchParams"),
    "must not take the candidate from the query string",
  );
  assert(
    !src.includes("_request."),
    "the request body and headers must not be an input — the only inputs are the session and the validated path param, so no caller can name a blob",
  );
  assert(src.includes("writeAudit("), "must write an audit row");
  assert(
    src.includes('actionType: "RESUME_FILE_VIEWED"'),
    "the audit row must name the action",
  );
  assert(src.includes("targetUserId:"), "the audit row must name the candidate");
  assert(src.includes("reason:"), "the audit row must carry a reason");
  assert(
    src.indexOf("writeAudit(") < src.indexOf("new NextResponse(file.stream"),
    "the audit row must be written BEFORE the bytes are streamed",
  );
  assert(
    src.includes('"cache-control": "private, no-store"'),
    "a private document must never reach a shared cache",
  );
  assert(!src.includes("console."), "must not log with console");
});

if (failed > 0) {
  console.log(`\n${failed} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`\n${passed} passed`);
