/**
 * Plan 185 ABT-Mailer routing tests.
 *   npx tsx src/lib/abt-mailer.test.ts
 */
import { createHmac } from "node:crypto";
import {
  abtMailerCategory,
  abtMailerKinds,
  interpretAbtMailerResponse,
  isSensitiveKind,
  kindMatches,
  routesViaAbtMailer,
  signAbtMailerRequest,
} from "./abt-mailer";

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

console.log("abt-mailer.test.ts (plan 185)");

const env = {
  ABT_MAILER_URL: "https://mailer.example",
  ABT_MAILER_HMAC_SECRET: "s3cret-s3cret-s3cret",
  EMAIL_VIA_ABT_KINDS: " profile.viewed , job.alert.match,, ",
};

suite("abtMailerKinds trims and drops empties", () => {
  const k = abtMailerKinds(env.EMAIL_VIA_ABT_KINDS);
  assert(k.size === 2, `size ${k.size}`);
  assert(k.has("profile.viewed") && k.has("job.alert.match"), "kinds");
  assert(abtMailerKinds(undefined).size === 0, "undefined → empty");
});

suite("only listed kinds route to ABT-Mailer", () => {
  assert(routesViaAbtMailer("profile.viewed", false, env), "listed kind");
  assert(!routesViaAbtMailer("recruiter.otp", false, env), "unlisted kind stays on Brevo");
});

suite("attachments and missing config stay on Brevo", () => {
  assert(!routesViaAbtMailer("profile.viewed", true, env), "attachments");
  assert(!routesViaAbtMailer("profile.viewed", false, { ...env, ABT_MAILER_URL: undefined }), "no url");
  assert(!routesViaAbtMailer("profile.viewed", false, { ...env, ABT_MAILER_HMAC_SECRET: "" }), "no secret");
  assert(!routesViaAbtMailer("profile.viewed", false, { ...env, EMAIL_VIA_ABT_KINDS: "" }), "empty list");
});

suite("`*` routes every kind; KEEP_ON_BREVO wins", () => {
  const all = { ...env, EMAIL_VIA_ABT_KINDS: "*", EMAIL_KEEP_ON_BREVO_KINDS: "recruiter.otp" };
  assert(routesViaAbtMailer("workshop.confirmation", false, all), "any kind");
  assert(routesViaAbtMailer("some.future.kind", false, all), "new kinds too");
  assert(!routesViaAbtMailer("recruiter.otp", false, all), "kept on Brevo");
});

suite("`prefix.*` matches that prefix only", () => {
  const p = abtMailerKinds("account.admin_update.*");
  assert(kindMatches(p, "account.admin_update.account_disabled"), "child kind");
  assert(!kindMatches(p, "account.admin_updates"), "lookalike");
  assert(!kindMatches(p, "profile.viewed"), "other kind");
});

suite("codes and account notices are essential; notices are not", () => {
  assert(abtMailerCategory("recruiter.otp") === "TRANSACTIONAL_ESSENTIAL", "otp");
  assert(abtMailerCategory("auth.password_reset") === "TRANSACTIONAL_ESSENTIAL", "reset");
  assert(abtMailerCategory("account.admin_update.account_disabled") === "TRANSACTIONAL_ESSENTIAL", "account notice");
  assert(abtMailerCategory("account.password_changed") === "TRANSACTIONAL_ESSENTIAL", "password changed notice");
  assert(abtMailerCategory("profile.viewed") === "TRANSACTIONAL_NONESSENTIAL", "profile view");
  assert(abtMailerCategory("workshop.confirmation") === "TRANSACTIONAL_NONESSENTIAL", "workshop");
});

suite("reset links and passwords are sensitive; short-lived codes are not", () => {
  for (const k of ["auth.password_reset", "recruiter.welcome"]) {
    assert(isSensitiveKind(k), k);
  }
  for (const k of ["recruiter.otp", "auth.signin_code", "auth.password_code", "profile.viewed"]) {
    assert(!isSensitiveKind(k), k);
  }
});

suite("signature is HMAC-SHA256 over `${ts}.${body}`", () => {
  const body = '{"a":1}';
  const h = signAbtMailerRequest(body, env.ABT_MAILER_HMAC_SECRET, 1_700_000_000_123);
  assert(h["X-ABTalks-Timestamp"] === "1700000000", `ts ${h["X-ABTalks-Timestamp"]}`);
  const expected = createHmac("sha256", env.ABT_MAILER_HMAC_SECRET).update(`1700000000.${body}`).digest("hex");
  assert(h["X-ABTalks-Signature"] === `v1=${expected}`, "signature");
});

suite("enqueued and duplicate count as sent", () => {
  assert(interpretAbtMailerResponse(200, { status: "enqueued" }).status === "SENT", "enqueued");
  assert(interpretAbtMailerResponse(200, { status: "duplicate" }).status === "SENT", "duplicate");
});

suite("suppressed is skipped, everything else failed", () => {
  const s = interpretAbtMailerResponse(200, { status: "suppressed", reason: "hard_bounce" });
  assert(s.status === "SKIPPED" && s.reason.includes("hard_bounce"), "suppressed");
  assert(interpretAbtMailerResponse(503, { status: "retry" }).status === "FAILED", "503 retry");
  assert(interpretAbtMailerResponse(401, { error: "unauthorized" }).status === "FAILED", "401");
  assert(interpretAbtMailerResponse(200, null).status === "FAILED", "unparseable body");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
