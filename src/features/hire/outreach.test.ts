/**
 * T-232 — outreach email and on-site reply routing.
 *
 * Pure checks on the boundary schemas; source assertions for the rules a unit
 * test cannot see — that the contact gate runs before any write, that nothing
 * leaves the process inside a transaction, that every read is scoped to the
 * session user. The database guarantees (isolation by id, one message per
 * clientRequestId, the reply notification reaching one recruiter) are proved
 * against real Postgres by `npm run db:check:outreach`.
 *
 * Run: npm run test:outreach
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sendOutreachSchema,
  threadReplySchema,
} from "@/lib/validations/hire-outreach";
import { EVENT_TYPE_REGISTRY } from "@/features/notification/event-types";
import { REQUIRED_RATE_LIMIT_SITES } from "@/lib/rate-limit-policy";
import {
  buildOutreachEmail,
  readableEmailFailure,
} from "@/features/hire/outreach";

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

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** The text of one exported function, from its signature to its closing brace. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert(start >= 0, `${name} not found`);
  const rest = src.slice(start);
  const end = rest.indexOf("\n}\n");
  return rest.slice(0, end + 2);
}

const FEATURE = "src/features/hire/outreach.ts";
const ACTIONS = "src/app/actions/outreach-actions.ts";
const EMAIL = "src/lib/email.ts";
const UUID = "3f1c2b8e-4d5a-4b6c-9e7f-1a2b3c4d5e6f";

console.log("\nT-232 outreach\n");

/* ─── the boundary ───────────────────────────────────────────────────────── */

console.log("Boundary");

suite("send payload carries a candidate, the words and an id — nothing else", () => {
  const keys = Object.keys(sendOutreachSchema.shape).sort();
  assert(
    JSON.stringify(keys) ===
      JSON.stringify(["body", "candidateRef", "clientRequestId", "subject"]),
    `unexpected keys: ${keys.join(", ")}`,
  );
});

suite("reply payload carries a thread, the words and an id — nothing else", () => {
  const keys = Object.keys(threadReplySchema.shape).sort();
  assert(
    JSON.stringify(keys) === JSON.stringify(["body", "clientRequestId", "threadId"]),
    `unexpected keys: ${keys.join(", ")}`,
  );
});

suite("a smuggled recipient is dropped, not honoured", () => {
  const parsed = sendOutreachSchema.safeParse({
    candidateRef: "PROFILE:ckabc123",
    subject: "Hi",
    body: "Hello",
    clientRequestId: UUID,
    recruiterUserId: "someone-else",
    to: "attacker@example.com",
  });
  assert(parsed.success, "a valid payload with extra keys should parse");
  if (parsed.success) {
    assert(!("to" in parsed.data), "`to` must not survive parsing");
    assert(!("recruiterUserId" in parsed.data), "`recruiterUserId` must not survive parsing");
  }
});

suite("subject newlines cannot reach the email header", () => {
  const parsed = sendOutreachSchema.safeParse({
    candidateRef: "PROFILE:ckabc123",
    subject: "Role\r\nBcc: everyone@example.com",
    body: "Hello",
    clientRequestId: UUID,
  });
  assert(parsed.success, "should parse");
  if (parsed.success) {
    assert(!/[\r\n]/.test(parsed.data.subject), "subject still contains a newline");
  }
});

suite("empty and oversized bodies are refused", () => {
  const base = { threadId: "ckabc1234567890abcdefghi", clientRequestId: UUID };
  assert(!threadReplySchema.safeParse({ ...base, body: "   " }).success, "blank body parsed");
  assert(
    !threadReplySchema.safeParse({ ...base, body: "x".repeat(5001) }).success,
    "5001-char body parsed",
  );
  assert(threadReplySchema.safeParse({ ...base, body: "ok" }).success, "valid reply refused");
});

suite("clientRequestId must be a uuid", () => {
  const parsed = threadReplySchema.safeParse({
    threadId: "ckabc1234567890abcdefghi",
    body: "ok",
    clientRequestId: "1",
  });
  assert(!parsed.success, "a non-uuid id parsed");
});

/* ─── the feature ────────────────────────────────────────────────────────── */

console.log("\nFeature");

const feature = stripComments(source(FEATURE));

suite("the contact gate runs before anything is written", () => {
  const body = fnBody(feature, "sendRecruiterMessage");
  const gate = body.indexOf("loadProtectedContact(");
  const write = body.indexOf("prisma.$transaction(");
  assert(gate >= 0, "sendRecruiterMessage must call loadProtectedContact");
  assert(write > gate, "loadProtectedContact must come before the transaction");
});

suite("transactions carry the 20s allowance", () => {
  assert(
    feature.includes("const TX = { maxWait: 20000, timeout: 20000 } as const;"),
    "TX options missing",
  );
  const calls = feature.match(/prisma\.\$transaction\(/g) ?? [];
  const withTx = feature.match(/\}, TX\)/g) ?? [];
  assert(calls.length > 0 && calls.length === withTx.length, "every $transaction must pass TX");
});

suite("no email or notification is sent inside a transaction", () => {
  let from = 0;
  for (;;) {
    const start = feature.indexOf("prisma.$transaction(", from);
    if (start < 0) break;
    const end = feature.indexOf("}, TX)", start);
    const block = feature.slice(start, end);
    assert(!block.includes("sendEmail("), "sendEmail inside a transaction");
    assert(!block.includes("dispatch("), "dispatch inside a transaction");
    from = end + 1;
  }
});

suite("every thread read is scoped to the session user", () => {
  const reads = [
    ...feature.matchAll(/outreachThread\.(findFirst|findMany|updateMany)\(\{\s*where:\s*\{([^}]*)\}/g),
  ];
  assert(reads.length >= 5, `expected at least 5 scoped reads, found ${reads.length}`);
  for (const r of reads) {
    assert(
      /recruiterUserId|candidateUserId/.test(r[2]),
      `unscoped ${r[1]}: where { ${r[2].trim()} }`,
    );
  }
});

suite("the candidate path never selects an email address", () => {
  for (const name of ["listCandidateThreads", "getCandidateThread", "sendCandidateReply"]) {
    assert(!/\bemail\s*:/.test(fnBody(feature, name)), `${name} selects an email`);
  }
});

suite("recruiter-written text is escaped in the HTML email", () => {
  assert(feature.includes("escapeHtml(input.body)"), "body must be escaped");
  const html = feature.slice(feature.indexOf("const html = `"), feature.indexOf("const text = ["));
  assert(!html.includes("${input.body}"), "raw body interpolated into HTML");
  assert(!html.includes("${input.recruiterName}"), "raw recruiter name interpolated into HTML");
});

suite("outreach mail goes to no-reply and says so, above the message (A-3)", () => {
  assert(feature.includes("replyTo: OUTREACH_REPLY_TO"), "sendEmail must pass the outreach Reply-To");
  assert(feature.includes('"no-reply@klymb.ai"'), "default no-reply address missing");
  const html = feature.slice(feature.indexOf("const html = `"), feature.indexOf("const text = ["));
  const warning = html.indexOf("Do not reply to this email");
  const message = html.indexOf("${bodyHtml}");
  assert(warning >= 0 && warning < message, "the do-not-reply notice must come before the message");
});

suite("a reply notifies the thread's recruiter, and only them", () => {
  const body = fnBody(feature, "sendCandidateReply");
  assert(body.includes('eventType: "outreach.reply_received"'), "reply must dispatch outreach.reply_received");
  assert(body.includes("recipientUserId: thread.recruiterUserId"), "recipient must be the thread's recruiter");
  assert(body.includes("where: { id: threadId, candidateUserId }"), "thread lookup must be scoped to the candidate");
});

/* ─── the email, by behaviour ────────────────────────────────────────────── */

console.log("\nThe email");

const sample = buildOutreachEmail({
  threadId: "ckthread123",
  subject: "Frontend role",
  body: `Hi <script>alert(1)</script> & welcome`,
  recruiterName: `Asha "A" <Rao>`,
  company: "Acme & Co",
});

suite("recruiter-written text cannot become markup", () => {
  assert(!sample.html.includes("<script>"), "raw <script> reached the HTML");
  assert(sample.html.includes("&lt;script&gt;"), "body was not escaped");
  assert(!sample.html.includes("<Rao>"), "recruiter name was not escaped");
  assert(sample.html.includes("Acme &amp; Co"), "company was not escaped");
});

suite("the do-not-reply notice comes before the message, in both parts", () => {
  const warn = sample.html.indexOf("Do not reply to this email");
  const msg = sample.html.indexOf("&lt;script&gt;");
  assert(warn >= 0 && warn < msg, "HTML: notice must precede the message");
  assert(sample.text.startsWith("DO NOT REPLY TO THIS EMAIL"), "text part must open with the notice");
});

suite("both parts link to the on-site thread", () => {
  assert(sample.html.includes("/messages/ckthread123"), "HTML link missing");
  assert(sample.text.includes("/messages/ckthread123"), "text link missing");
});

suite("the subject names the recruiter, company and topic", () => {
  assert(
    sample.subject === `Asha "A" <Rao> at Acme & Co: Frontend role`,
    `got: ${sample.subject}`,
  );
});

suite("send failures read as sentences, not provider dumps", () => {
  const cases: [string | undefined, string][] = [
    ['BrevoError: Status code: 401\nBody: {"message":"Key not found"}', "credentials"],
    ["BrevoError: Status code: 429", "busy"],
    ["TypeError: fetch failed", "unavailable"],
    ["test address", "@abtalks.dev"],
    ["BREVO_API_KEY missing", "isn't set up"],
    [undefined, "did not accept"],
  ];
  for (const [raw, expect] of cases) {
    const got = readableEmailFailure(raw);
    assert(got.includes(expect), `${String(raw)} → "${got}" (expected to mention "${expect}")`);
    assert(!/brevo|status code|\{/i.test(got), `leaked provider detail: "${got}"`);
  }
});

/* ─── the actions ────────────────────────────────────────────────────────── */

console.log("\nActions");

const actions = stripComments(source(ACTIONS));

suite("every action is rate-limited on OUTREACH", () => {
  const limits = actions.match(/assertRateLimit\(\{ bucket: "OUTREACH", subjectId: userId \}\)/g) ?? [];
  assert(limits.length === 3, `expected 3 OUTREACH limits, found ${limits.length}`);
});

suite("no action takes an identity from its payload", () => {
  for (const field of ["recruiterUserId", "organizationId", "candidateUserId"]) {
    assert(!actions.includes(`parsed.data.${field}`), `action reads ${field} from the payload`);
  }
});

suite("the recruiter thread lookup is scoped to the recruiter", () => {
  assert(
    actions.includes("where: { id: parsed.data.threadId, recruiterUserId: userId }"),
    "recruiterReplyAction must scope the thread to the session recruiter",
  );
});

suite("the actions file is registered for OUTREACH", () => {
  const site = REQUIRED_RATE_LIMIT_SITES.find((s) => s.bucket === "OUTREACH");
  assert(site?.files.includes(ACTIONS), "rate-limit-policy must list the outreach actions file");
});

/* ─── neighbours ─────────────────────────────────────────────────────────── */

console.log("\nNeighbours");

suite("the candidate bell event never emails", () => {
  const cfg = EVENT_TYPE_REGISTRY["outreach.message_received"];
  assert(cfg?.priority === "low", "outreach.message_received must be low priority (in-app only)");
  assert(
    EVENT_TYPE_REGISTRY["outreach.reply_received"]?.priority === "important",
    "outreach.reply_received must stay important so the recruiter is emailed",
  );
});

suite("sendEmail keeps its default Reply-To for every other caller", () => {
  const src = source(EMAIL);
  assert(src.includes("replyTo: { email: opts.replyTo ?? REPLY_TO }"), "replyTo must default to REPLY_TO");
});

suite("access is still derived from CONTACT_SHARED in one place", () => {
  const src = source("src/features/hire/contact-access.ts");
  const body = src.slice(src.indexOf("export async function hasContactAccess"));
  const fn = body.slice(0, body.indexOf("\n}") + 2).replace(/\s+/g, " ");
  // The query, not the whole function: T-259 wrapped it in logging.
  assert(
    fn.includes(
      'prisma.talentEngagementRequest.findFirst({ where: { recruiterUserId, candidateUserId, status: "CONTACT_SHARED", }, select: { id: true }, });',
    ),
    "hasContactAccess must still derive access from CONTACT_SHARED alone (T-148 §6)",
  );
});

suite("outreach does not borrow the admin-visible engagement thread", () => {
  assert(!feature.includes("talentEngagementMessage"), "outreach must not write TalentEngagementMessage");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
