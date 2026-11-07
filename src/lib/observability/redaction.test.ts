/**
 * T-259 Test B — sensitive data never reaches a log line or a Sentry payload.
 *   npm run test:observability:redaction
 *
 * No network, no database. Three surfaces are checked:
 *
 *  1. the pino logger, driven with the *real* `loggerOptions` into an in-memory
 *     stream — testing a re-declared copy of the config would prove nothing;
 *  2. `scrubDeep` / `safeErrorMessage`, which are what stop a provider SDK's
 *     own error text leaking;
 *  3. `scrubSentryEvent` / `scrubBreadcrumb`, the last hop before the wire.
 *
 * The point is not that the helpers have the right shape. It is that a
 * developer who passes a whole request object, a whole session, or a whole
 * third-party error to the logger still cannot leak a credential.
 */
import { Writable } from "node:stream";

import { createLoggerTo, type AppLogger } from "@/lib/logger";
import {
  isSensitiveKey,
  safeErrorMessage,
  scrubDeep,
  scrubString,
} from "@/lib/observability/redact";
import {
  scrubBreadcrumb,
  scrubSentryEvent,
} from "@/lib/observability/sentry-scrub";

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

/** A logger with the production configuration, writing where we can read it. */
function capturingLogger(): { log: AppLogger; lines: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(chunk.toString());
      cb();
    },
  });
  return { log: createLoggerTo(stream), lines: () => chunks.join("") };
}

/** Every secret used below. None of them may appear in any output, ever. */
const SECRETS = [
  "hunter2-the-password",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.QWxsWW91ckJhc2VBcmVCZWxvbmc",
  "xkeysib-0123456789abcdef0123456789abcdef",
  "priya.sharma@gmail.com",
  "+91 98765 43210",
  "klymb_session=abc123def456",
];

function assertClean(haystack: string, where: string) {
  for (const secret of SECRETS) {
    assert(
      !haystack.includes(secret),
      `${where} leaked ${JSON.stringify(secret)}\n      in: ${haystack.slice(0, 600)}`,
    );
  }
}

console.log("\nT-259 redaction");

// --- the logger ------------------------------------------------------------

suite("named secret fields are censored, whichever call shape is used", () => {
  const { log, lines } = capturingLogger();

  // Legacy shape (message first) — 111 call sites still use it.
  log.error("auth failed", {
    password: SECRETS[0],
    token: SECRETS[1],
    authorization: `Bearer ${SECRETS[1]}`,
    cookie: SECRETS[5],
    email: SECRETS[3],
    phone: SECRETS[4],
  });
  // pino shape (object first) — what new instrumentation uses.
  log.info(
    {
      event: "unlock.attempt",
      contactEmail: SECRETS[3],
      contactPhone: SECRETS[4],
      apiKey: SECRETS[2],
    },
    "unlock",
  );

  const out = lines();
  assertClean(out, "logger");
  assert(out.includes("[redacted]"), "expected a redaction marker in the output");
  assert(
    out.includes('"event":"unlock.attempt"'),
    "safe fields must survive redaction",
  );
});

suite("nesting does not defeat redaction", () => {
  const { log, lines } = capturingLogger();
  log.info({
    event: "deep",
    recruiter: {
      profile: {
        contact: { email: SECRETS[3], phone: SECRETS[4] },
        session: { token: SECRETS[1] },
      },
    },
    batch: [{ candidate: { email: SECRETS[3] } }],
  });
  assertClean(lines(), "nested logger payload");
});

suite("a whole request-like object can be logged safely", () => {
  const { log, lines } = capturingLogger();
  log.info({
    event: "req",
    req: {
      method: "POST",
      url: "/api/x?token=" + SECRETS[1] + "&email=" + SECRETS[3],
      headers: {
        authorization: `Bearer ${SECRETS[1]}`,
        cookie: SECRETS[5],
        "user-agent": "Mozilla/5.0",
      },
      body: { password: SECRETS[0] },
    },
  });
  const out = lines();
  assertClean(out, "request object");
  assert(out.includes("Mozilla"), "harmless headers should survive");
});

suite("values that look like secrets are caught even under a safe key", () => {
  const { log, lines } = capturingLogger();
  // The key `note` is not on any deny list. This is the case key-based
  // redaction alone cannot catch, and the reason value scrubbing exists.
  log.info({
    event: "note",
    note: `reach her on ${SECRETS[3]} or ${SECRETS[4]}`,
    trace: `Authorization: Bearer ${SECRETS[1]}`,
    dbUrl: "postgres://neon_user:sup3rs3cret@ep-x.eu-central-1.aws.neon.tech/db",
  });
  const out = lines();
  assertClean(out, "free-text value");
  assert(!out.includes("sup3rs3cret"), "connection string password leaked");
});

suite("an Error thrown by a provider is scrubbed, not stringified raw", () => {
  const { log, lines } = capturingLogger();
  const providerError = Object.assign(
    new Error(
      `Brevo 400: {"to":[{"email":"${SECRETS[3]}"}],"apiKey":"${SECRETS[2]}"}`,
    ),
    { status: 400, code: "invalid_parameter" },
  );
  log.error({ event: "notification.failed", err: providerError });
  assertClean(lines(), "error serializer");
});

// --- the helpers -----------------------------------------------------------

suite("isSensitiveKey normalises case and separators", () => {
  for (const k of [
    "password",
    "PASSWORD",
    "contact_email",
    "contact-phone",
    "contactPhone",
    "Set-Cookie",
    "refreshToken",
    "AUTHORIZATION",
  ]) {
    assert(isSensitiveKey(k), `${k} should be treated as sensitive`);
  }
  for (const k of ["event", "userId", "candidateId", "requestId", "status"]) {
    assert(!isSensitiveKey(k), `${k} must not be redacted — it is the log`);
  }
});

suite("safeErrorMessage keeps the diagnosis and drops the payload", () => {
  const err = Object.assign(
    new Error(`Request to ${SECRETS[3]} failed with key ${SECRETS[2]}`),
    { code: "P2002", status: 409 },
  );
  const msg = safeErrorMessage(err);
  assertClean(msg, "safeErrorMessage");
  assert(msg.includes("P2002"), "the Prisma error code is the useful part");
  assert(msg.includes("409"), "the status code is the useful part");
});

suite("safeErrorMessage follows `cause`, where undici hides the reason", () => {
  const inner = new Error("connect ECONNREFUSED 10.0.0.5:5432");
  const outer = new Error("fetch failed", { cause: inner });
  const msg = safeErrorMessage(outer);
  assert(msg.includes("ECONNREFUSED"), `lost the cause: ${msg}`);
});

suite("safeErrorMessage never throws, whatever it is handed", () => {
  const cyclic: Record<string, unknown> = { a: 1 };
  cyclic.self = cyclic;
  for (const input of [null, undefined, 0, "", cyclic, Symbol("x"), []]) {
    const msg = safeErrorMessage(input);
    assert(typeof msg === "string" && msg.length > 0, "expected a message");
  }
});

suite("scrubDeep survives cycles, class instances and depth", () => {
  const cyclic: Record<string, unknown> = { email: SECRETS[3] };
  cyclic.self = cyclic;
  const out = JSON.stringify(scrubDeep(cyclic));
  assertClean(out, "cyclic object");
  assert(out.includes("[circular]"), "expected the cycle to be broken");

  class Prismaish {
    secretKey = SECRETS[2];
  }
  assertClean(JSON.stringify(scrubDeep({ client: new Prismaish() })), "class");
});

suite("a secret named inside a string is redacted, shape or no shape", () => {
  // The regression this locks in: found on the first live Sentry send, where
  // the planted email, API key and phone were all redacted and the password
  // went through — a password has no recognisable shape, only a key beside it.
  const cases: [string, string[]][] = [
    [
      'Brevo 400 {"to":[{"email":"a@b.com"}],"apiKey":"xkeysib-0000","password":"not-a-real-password"}',
      ["not-a-real-password", "xkeysib-0000", "a@b.com"],
    ],
    ["POST /login password=hunter2&user=priya", ["hunter2"]],
    ["headers: { authorization: Bearer abc123xyz, cookie: sid=deadbeef }", ["abc123xyz", "deadbeef"]],
    ['{"otp":"482913","client_secret":"cs_live_0001"}', ["482913", "cs_live_0001"]],
    ["Authorization=Basic dXNlcjpwYXNzd29yZA", ["dXNlcjpwYXNzd29yZA"]],
  ];
  for (const [input, mustNotSurvive] of cases) {
    const out = scrubString(input);
    for (const secret of mustNotSurvive) {
      assert(!out.includes(secret), `"${secret}" survived in: ${out}`);
    }
  }
});

suite("keyed redaction does not eat ordinary application logs", () => {
  // The counterweight: over-redaction makes logs useless, which is its own
  // failure. Ids, event names and error codes must all survive intact.
  for (const safe of [
    "Prisma error P2002 on User.email unique constraint",
    "day 14 completed, score=88, event=submission.success",
    "unlock.success recruiterId=cmrec1 candidateId=cmcand1",
    "credit.debit.success amount=-250 newBalance=750 idempotencyKey=redeem:abc",
    "notification.failed deliveryId=0198f2c1-dddd-eeee-ffff-000000000009",
  ]) {
    assert(scrubString(safe) === safe, `mangled a safe line: ${scrubString(safe)}`);
  }
});

suite("scrubString leaves ordinary text alone", () => {
  const text = "candidate cmxyz123 unlocked by recruiter cmabc789 on day 14";
  assert(scrubString(text) === text, `mangled a safe string: ${scrubString(text)}`);
});

// --- Sentry ----------------------------------------------------------------

suite("scrubSentryEvent cleans every field the SDK can populate", () => {
  const event = {
    message: `login failed for ${SECRETS[3]}`,
    request: {
      url: `https://abtalks.in/login?token=${SECRETS[1]}&email=${SECRETS[3]}`,
      headers: {
        authorization: `Bearer ${SECRETS[1]}`,
        cookie: SECRETS[5],
        "x-request-id": "0198f2c1-aaaa-bbbb-cccc-000000000001",
      },
      cookies: { session: SECRETS[5] },
      data: { password: SECRETS[0], note: `call ${SECRETS[4]}` },
      query_string: `email=${SECRETS[3]}`,
    },
    extra: { profile: { contactEmail: SECRETS[3] } },
    contexts: { auth: { token: SECRETS[1] } },
    tags: { requestId: "0198f2c1-aaaa-bbbb-cccc-000000000001", email: SECRETS[3] },
    user: { id: "cmuser123", email: SECRETS[3], ip_address: "10.0.0.5" },
    breadcrumbs: [
      { category: "http", message: `POST /login ${SECRETS[3]}`, data: { cookie: SECRETS[5] } },
      { category: "console", message: `password=${SECRETS[0]}` },
    ],
    exception: {
      values: [{ type: "Error", value: `Brevo rejected ${SECRETS[3]}` }],
    },
  };

  // `scrubSentryEvent` replaces fields with redaction markers, so the result is
  // read back through the loose Sentry-ish shape rather than the literal's.
  const out = scrubSentryEvent(event)! as unknown as {
    request: { headers: Record<string, string>; cookies: unknown };
    user: unknown;
    breadcrumbs: { category?: string }[];
  };
  const json = JSON.stringify(out);
  assertClean(json, "sentry event");

  assert(
    json.includes("0198f2c1-aaaa-bbbb-cccc-000000000001"),
    "the request id must survive — it is the correlation handle",
  );
  assert(
    out.request.headers["x-request-id"] === "0198f2c1-aaaa-bbbb-cccc-000000000001",
    "the request-id header must survive",
  );
  assert(out.request.cookies === "[redacted]", "cookies must be dropped whole");
  assert(
    JSON.stringify(out.user) === JSON.stringify({ id: "cmuser123" }),
    `only the opaque user id may survive, got ${JSON.stringify(out.user)}`,
  );
  assert(
    out.breadcrumbs.length === 1 && out.breadcrumbs[0].category === "http",
    "console breadcrumbs replay unredacted app output and must be dropped",
  );
});

suite("scrubSentryEvent handles null and an empty event", () => {
  assert(scrubSentryEvent(null) === null, "null must pass through");
  assert(
    JSON.stringify(scrubSentryEvent({})) === "{}",
    "an empty event must not gain fields",
  );
  assert(scrubBreadcrumb(null) === null, "null breadcrumb must pass through");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
