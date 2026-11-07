/**
 * T-259 Part 10 — proof that an error actually reaches Sentry, with an event
 * id, correlated to a request, and carrying no secrets.
 *   npm run test:observability:sentry
 *
 * The plan's evidence step was "hit a hidden /api/dev/boom route and look at
 * the Sentry dashboard". This does the same thing without leaving an
 * unauthenticated error endpoint in a production deployment: it stands up a
 * throwaway HTTP server, points a DSN at it, and reads the envelope the real
 * `@sentry/nextjs` SDK puts on the wire.
 *
 * That is a stronger check than the dashboard screenshot, because the bytes
 * are inspectable: the assertions below are that the payload contains the
 * event id and the correlation tags, and does NOT contain the password, token,
 * cookie or contact details that were deliberately planted in the error, the
 * scope and the breadcrumbs.
 *
 * It runs in a child process. `Sentry.init` is global and one-way, so
 * initialising it inside the main test runner would leak into everything else.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { AddressInfo } from "node:net";

const PASSWORD = "hunter2-the-password";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.QWxsWW91ckJhc2U";
const EMAIL = "priya.sharma@example.com";
const PHONE = "+91 98765 43210";
const COOKIE = "klymb_session=abc123def456";
const REQUEST_ID = "0198f2c1-aaaa-bbbb-cccc-000000000009";
const DELIVERY_ID = "0198f2c1-dddd-eeee-ffff-000000000009";

// ---------------------------------------------------------------------------
// child: initialise the real SDK against the local endpoint and report an error
// ---------------------------------------------------------------------------

/** See the interop note in `capture.ts` — same reason, same fix. */
type SentryApi = {
  init: (o: Record<string, unknown>) => void;
  addBreadcrumb: (b: Record<string, unknown>) => void;
  setUser: (u: Record<string, unknown>) => void;
  setExtra: (k: string, v: unknown) => void;
  flush: (ms: number) => Promise<boolean>;
};

async function child() {
  const mod = await import("@sentry/nextjs");
  const ns = mod as unknown as Record<string, unknown>;
  const Sentry = (
    typeof ns.addBreadcrumb === "function" ? ns : ns.default
  ) as unknown as SentryApi;
  const { scrubBreadcrumb, scrubSentryEvent } = await import("./sentry-scrub");

  // The same configuration `sentry.server.config.ts` uses, with the gate forced
  // open — that file reads the DSN and gate from env, which is what we set.
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: "test",
    enabled: true,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    integrations: (defaults: { name: string }[]) =>
      defaults.filter((i) => i.name !== "Console"),
    beforeSend: (event: unknown) => scrubSentryEvent(event),
    beforeSendTransaction: (event: unknown) => scrubSentryEvent(event),
    beforeBreadcrumb: (crumb: unknown) => scrubBreadcrumb(crumb),
  });

  // Everything a careless caller might have attached before the error.
  Sentry.addBreadcrumb({
    category: "http",
    message: `POST /api/send to ${EMAIL}`,
    data: { cookie: COOKIE, authorization: `Bearer ${TOKEN}` },
  });
  Sentry.addBreadcrumb({ category: "console", message: `password=${PASSWORD}` });
  Sentry.setUser({ id: "cmuser123", email: EMAIL, ip_address: "10.0.0.5" });
  Sentry.setExtra("payload", { password: PASSWORD, contactPhone: PHONE });

  const { captureFailure } = await import("./capture");
  const error = Object.assign(
    // A provider error that echoes the request back, as Brevo's do.
    new Error(
      `Bad Request: {"to":[{"email":"${EMAIL}"}],"apiKey":"${TOKEN}"} boom ${crypto.randomUUID()}`,
    ),
    { status: 400 },
  );

  const result = await captureFailure(error, {
    event: "notification.failed",
    message: "notification failed",
    tags: {
      requestId: REQUEST_ID,
      deliveryId: DELIVERY_ID,
      channel: "email",
      kind: "recruiter.otp",
    },
  });

  await Sentry.flush(15_000);
  console.log(`__EVENT_ID__=${result.sentryEventId ?? ""}`);
}

// ---------------------------------------------------------------------------
// parent
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

async function main() {
  console.log("\nT-259 Sentry delivery");

  const bodies: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "server-assigned-id" }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const dsn = `http://t259publickey@127.0.0.1:${port}/1`;

  const self = fileURLToPath(import.meta.url);
  // `spawn`, not `spawnSync`: the parent IS the endpoint here, and a
  // synchronous spawn blocks the event loop that has to accept the connection.
  const stdout = await new Promise<string>((resolve) => {
    const proc = spawn(process.execPath, [require.resolve("tsx/cli"), self], {
      env: { ...process.env, T259_SENTRY_CHILD: "1", SENTRY_DSN: dsn },
    });
    let out = "";
    proc.stdout.on("data", (d: Buffer) => (out += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (out += d.toString()));
    const kill = setTimeout(() => proc.kill(), 120_000);
    proc.on("close", () => {
      clearTimeout(kill);
      resolve(out);
    });
  });
  server.close();
  const envelopes = bodies.join("\n");
  const eventId = /__EVENT_ID__=([0-9a-f]*)/.exec(stdout)?.[1] ?? "";

  suite("the SDK actually put an event on the wire", () => {
    assert(
      bodies.length > 0,
      `nothing reached the endpoint. child output:\n${stdout.slice(0, 1500)}`,
    );
    assert(
      envelopes.includes('"type":"event"'),
      `no error event in the envelope:\n${envelopes.slice(0, 800)}`,
    );
  });

  suite("the event has a searchable id, and the caller gets it back", () => {
    assert(/^[0-9a-f]{32}$/.test(eventId), `expected an event id, got "${eventId}"`);
    assert(
      envelopes.includes(eventId),
      "the id returned to the caller must be the id that was sent",
    );
  });

  suite("the event is correlated to the request and the delivery", () => {
    assert(envelopes.includes(REQUEST_ID), "the requestId tag did not survive");
    assert(envelopes.includes(DELIVERY_ID), "the deliveryId tag did not survive");
    assert(envelopes.includes("recruiter.otp"), "the kind tag did not survive");
  });

  suite("no secret and no contact detail is anywhere in the payload", () => {
    for (const [label, secret] of [
      ["password", PASSWORD],
      ["token", TOKEN],
      ["email", EMAIL],
      ["email local part", "priya.sharma"],
      ["cookie", COOKIE],
      ["session value", "abc123def456"],
    ] as const) {
      assert(
        !envelopes.includes(secret),
        `the ${label} reached Sentry:\n${envelopes.slice(0, 1200)}`,
      );
    }
    // The phone number is written with a space in the planted extra.
    assert(!envelopes.includes("98765 43210"), "the phone number reached Sentry");
  });

  if (process.env.T259_DUMP) {
    console.log("----- ENVELOPE -----");
    console.log(envelopes.slice(0, 4000));
    console.log("----- END -----");
  }

  suite("sendDefaultPii stays off: no ip address, no user email", () => {
    assert(!envelopes.includes("10.0.0.5"), "an IP address reached Sentry");
    // The opaque id is the only thing a user object may carry.
    assert(envelopes.includes("cmuser123"), "the opaque user id should survive");
  });

  suite("the stack trace is still useful after scrubbing", () => {
    // Source lines are stripped; the frames themselves must survive, or the
    // Sentry issue is untriageable and the whole exercise is pointless.
    assert(envelopes.includes('"stacktrace"'), "the stack trace was dropped entirely");
    assert(
      envelopes.includes("sentry-delivery.test.ts"),
      "frame filenames must survive",
    );
    assert(!envelopes.includes("pre_context"), "source context must be stripped");
    assert(!envelopes.includes("context_line"), "source context must be stripped");
  });

  suite("console breadcrumbs never leave the process", () => {
    assert(
      !envelopes.includes('"category":"console"'),
      "a console breadcrumb reached Sentry — it replays unredacted app output",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

if (process.env.T259_SENTRY_CHILD) {
  void child();
} else {
  void main();
}
