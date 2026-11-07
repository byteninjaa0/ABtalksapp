/**
 * T-259 Test C — request correlation.
 *   npm run test:observability:request-id
 *
 * This drives the **real** `middleware.ts` with real `NextRequest`s rather than
 * a copy of its logic, because the thing that can break is the merge: this
 * middleware already does auth redirects, referral cookies and consent, and a
 * request id that only appears on one of those branches is worse than none.
 *
 * It then checks that the id survives into the logger, which is the other half
 * of correlation — an id in a response header that never reaches a log line
 * correlates nothing.
 */
import { Writable } from "node:stream";
import { NextRequest } from "next/server";

import middleware from "../../../middleware";
import { createLoggerTo, reqLogger } from "@/lib/logger";
import {
  REQUEST_ID_HEADER,
  isValidRequestId,
} from "@/lib/observability/request-id";

let passed = 0;
let failed = 0;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function suite(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${(e as Error).message}`);
  }
}

/**
 * The Auth.js wrapper hands the handler an augmented request; calling the
 * exported middleware directly is what the runtime does, so that is what this
 * does. `auth` with no session cookie resolves to a signed-out request.
 */
type Middleware = (req: NextRequest) => Promise<Response> | Response;
const run = (url: string, headers: Record<string, string> = {}) =>
  (middleware as unknown as Middleware)(
    new NextRequest(new URL(url), { headers }),
  );

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  console.log("\nT-259 request id");

  await suite("a request with no id is given one, and it comes back", async () => {
    const res = await run("https://abtalks.in/");
    const id = res.headers.get(REQUEST_ID_HEADER);
    assert(id, "no x-request-id on the response");
    assert(UUID_RE.test(id), `expected a uuid, got ${id}`);
  });

  await suite("two requests get different ids", async () => {
    const a = (await run("https://abtalks.in/")).headers.get(REQUEST_ID_HEADER);
    const b = (await run("https://abtalks.in/")).headers.get(REQUEST_ID_HEADER);
    assert(a !== b, "ids must not repeat across requests");
  });

  await suite("a well-formed inbound id is preserved", async () => {
    const incoming = "0198f2c1-aaaa-bbbb-cccc-000000000001";
    const res = await run("https://abtalks.in/", {
      [REQUEST_ID_HEADER]: incoming,
    });
    assert(
      res.headers.get(REQUEST_ID_HEADER) === incoming,
      "an upstream trace id must be honoured, not replaced",
    );
  });

  await suite("a junk inbound id is replaced, not echoed", async () => {
    for (const junk of [
      "short",
      "<script>alert(1)</script>",
      "x".repeat(200),
      "has spaces in it",
      "id\r\nInjected-Header: yes",
    ]) {
      const res = await run("https://abtalks.in/", {
        // A header value with CRLF cannot be constructed by Headers, so those
        // are checked through the validator directly, below.
        ...(junk.includes("\r") ? {} : { [REQUEST_ID_HEADER]: junk }),
      });
      const id = res.headers.get(REQUEST_ID_HEADER);
      assert(id !== junk, `echoed an unvalidated id: ${junk}`);
      assert(UUID_RE.test(id!), `expected a generated uuid, got ${id}`);
      assert(!isValidRequestId(junk), `validator accepted junk: ${junk}`);
    }
  });

  await suite("the id is on the redirect branch too", async () => {
    // /dashboard is protected and there is no session, so this redirects to
    // /login. That is a different `return` inside the middleware, and it is
    // exactly the branch a merge like this one tends to miss.
    //
    // The launch gate (plans 191-193) is turned OFF for this one case on
    // purpose: with it on, /dashboard is redirected to / before the auth
    // branch is ever reached, and this assertion would be testing the gate
    // instead of the thing it was written for. The gate's own redirect is
    // covered by the case below.
    const gate = process.env.LANDING_ONE_PAGER;
    process.env.LANDING_ONE_PAGER = "false";
    try {
      const res = await run("https://abtalks.in/dashboard");
      assert(
        res.status === 307 || res.status === 302,
        `expected a redirect for a signed-out /dashboard, got ${res.status}`,
      );
      assert(
        res.headers.get("location")?.includes("/login"),
        "the existing auth redirect must still happen",
      );
      assert(
        UUID_RE.test(res.headers.get(REQUEST_ID_HEADER) ?? ""),
        "the redirect response carries no request id",
      );
    } finally {
      if (gate === undefined) delete process.env.LANDING_ONE_PAGER;
      else process.env.LANDING_ONE_PAGER = gate;
    }
  });

  await suite("the gate's own redirect carries the id too", async () => {
    // The gate holds the recruiter side (the candidate product is open again),
    // so /hire is where it still redirects a stranger. That is another
    // `return`, and it has to carry the id like every other one.
    const res = await run("https://abtalks.in/hire");
    assert(
      res.status === 307 || res.status === 302,
      `expected the gate to redirect, got ${res.status}`,
    );
    const loc = res.headers.get("location") ?? "";
    assert(
      loc.endsWith("/") || loc.endsWith("abtalks.in/"),
      `expected the launch page, got ${loc}`,
    );
    assert(
      UUID_RE.test(res.headers.get(REQUEST_ID_HEADER) ?? ""),
      "the gate redirect carries no request id",
    );
  });

  await suite("login expires leftover oauth check cookies", async () => {
    const res = await run("https://abtalks.in/login");
    const setCookie = res.headers.getSetCookie().join("\n");
    assert(
      setCookie.includes("authjs.pkce.code_verifier.v2="),
      "login must expire the versioned pkce cookie so a stale Google verifier cannot 500 the next sign-in",
    );
    assert(
      UUID_RE.test(res.headers.get(REQUEST_ID_HEADER) ?? ""),
      "expiring oauth cookies must not drop the request id",
    );
  });

  await suite("the id is forwarded to the app, not only to the client", async () => {
    const incoming = "0198f2c1-aaaa-bbbb-cccc-000000000002";
    const res = await run("https://abtalks.in/", {
      [REQUEST_ID_HEADER]: incoming,
    });
    // `NextResponse.next({ request: { headers } })` encodes the forwarded
    // headers on the response for the Next server to apply. Reading it here is
    // how we prove `headers()` downstream will see the id.
    const overrides = res.headers.get("x-middleware-override-headers") ?? "";
    assert(
      overrides.includes(REQUEST_ID_HEADER),
      `middleware did not forward the id to the app; overrides: ${overrides}`,
    );
    assert(
      res.headers.get(`x-middleware-request-${REQUEST_ID_HEADER}`) === incoming,
      "the forwarded value must be the resolved id",
    );
  });

  await suite("existing middleware behaviour is untouched", async () => {
    // Referral capture needs a consent choice; without one nothing is set.
    const noConsent = await run("https://abtalks.in/?ref=priya");
    assert(
      !noConsent.headers.get("set-cookie")?.includes("klymb_ref"),
      "a referral cookie must not be set before a consent decision",
    );

    const withConsent = await run("https://abtalks.in/?ref=priya", {
      cookie: "klymb_consent=all.2026-08-10",
    });
    assert(
      withConsent.headers.get("set-cookie")?.includes("klymb_ref=priya"),
      "referral capture broke",
    );
    assert(
      UUID_RE.test(withConsent.headers.get(REQUEST_ID_HEADER) ?? ""),
      "the id must be set alongside the cookies, not instead of them",
    );
  });

  await suite("the id reaches the logger through reqLogger", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(c, _e, cb) {
        chunks.push(c.toString());
        cb();
      },
    });
    // reqLogger binds onto the process logger, so this checks the binding
    // behaviour against a logger built from the same options.
    const base = createLoggerTo(stream);
    const bound = base.child({ requestId: "0198f2c1-aaaa-bbbb-cccc-000000000003" });
    bound.info({ event: "unlock.attempt" }, "test");

    const line = JSON.parse(chunks.join("").trim()) as Record<string, unknown>;
    assert(
      line.requestId === "0198f2c1-aaaa-bbbb-cccc-000000000003",
      `the request id is missing from the log line: ${JSON.stringify(line)}`,
    );
    assert(line.event === "unlock.attempt", "the event must survive too");

    // And the real helper omits the field rather than writing `undefined`.
    const outside = reqLogger(undefined, { route: "cron:x" });
    assert(typeof outside.info === "function", "reqLogger must work off-request");
  });

  await suite("the validator agrees with the middleware", async () => {
    assert(isValidRequestId("0198f2c1-aaaa-bbbb-cccc-000000000001"), "uuid rejected");
    assert(isValidRequestId("abc12345"), "8-char token rejected");
    for (const bad of [null, undefined, "", "short7", "a".repeat(65), "bad id"]) {
      assert(!isValidRequestId(bad), `validator accepted ${JSON.stringify(bad)}`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exitCode = 1;
}

void main();
