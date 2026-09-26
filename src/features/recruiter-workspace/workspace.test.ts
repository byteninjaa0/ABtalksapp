/**
 * T-226 — one independent workspace per recruiter.
 *
 * The rule is a product contract, not a preference: every recruiter works
 * alone, and two recruiters on the same email domain must not be able to reach
 * each other's projects, credits, jobs, pipeline, assessments or outreach.
 *
 * The pure checks cover the slug, which is what actually separates two
 * recruiters at one company. The source assertions cover what a unit test
 * cannot see — that the workspace is resolved from the session rather than from
 * a caller-supplied id, and that the old company-scoped slug has not survived
 * anywhere.
 *
 * Plan 127 removed the recruiter application process, so the suites that used
 * to pin the ordering of setup and approval now pin their absence: there is no
 * pending state, no setup wizard, and no approval gate to get past.
 *
 * Run: npm run test:recruiter-workspace
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, posix, sep } from "node:path";
import { recruiterWorkspaceSlug } from "@/features/hire/provision-recruiter";

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

const NEWLINE = String.fromCharCode(10);

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * A file's code with its comments stripped.
 *
 * Every one of these removals left a comment behind saying what used to be
 * there and why it went — which is the point of them. A grep for the old route
 * has to read the code, not the history written above it.
 */
function code(rel: string): string {
  return source(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(NEWLINE)
    .filter((l) => !l.trim().startsWith("//"))
    .join(NEWLINE);
}

/** Every .ts/.tsx file under the given repo-relative roots, as posix paths. */
function sourceFiles(roots: string[]): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(process.cwd(), rel), {
      withFileTypes: true,
    })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (/\.tsx?$/.test(entry.name)) out.push(child);
    }
  };
  for (const root of roots) walk(root);
  return out.map((p) => p.split(sep).join(posix.sep));
}

console.log("\nT-226 independent recruiter workspace\n");

/* ─── the slug is what keeps two colleagues apart ────────────────────────── */

suite("two recruiters at the same company get different workspaces", () => {
  const a = recruiterWorkspaceSlug("cluser000000000000000aaaa", "Acme Systems");
  const b = recruiterWorkspaceSlug("cluser000000000000000bbbb", "Acme Systems");
  assert(a !== b, `same company must not collide: ${a} === ${b}`);
});

suite("the slug is stable for one recruiter", () => {
  const id = "cluser000000000000000aaaa";
  assert(
    recruiterWorkspaceSlug(id, "Acme Systems") ===
      recruiterWorkspaceSlug(id, "Acme Systems"),
    "re-provisioning must resolve the same workspace",
  );
});

suite("the slug stays readable and url-safe", () => {
  const s = recruiterWorkspaceSlug("cluser000000000000000aaaa", "Acme Systems");
  assert(s.startsWith("acme-systems-"), `company half missing: ${s}`);
  assert(/^[a-z0-9-]+$/.test(s), `not url-safe: ${s}`);
  const odd = recruiterWorkspaceSlug("cluser000000000000000aaaa", "  &&&  ");
  assert(odd.startsWith("org-"), `empty company must fall back: ${odd}`);
});

suite("a long company name cannot crowd out the unique half", () => {
  const long = "A".repeat(200);
  const a = recruiterWorkspaceSlug("cluser000000000000000aaaa", long);
  const b = recruiterWorkspaceSlug("cluser000000000000000bbbb", long);
  assert(a !== b, "long names must still separate two recruiters");
});

/* ─── the company-scoped slug must not survive ───────────────────────────── */

suite("provisioning no longer keys the workspace on the company alone", () => {
  const src = source("src/features/hire/provision-recruiter.ts");
  assert(!src.includes("orgSlug("), "the old company-only slug is gone");
  assert(
    src.includes("recruiterWorkspaceSlug(input.userId"),
    "the slug is derived from the recruiter's own id",
  );
  // The old comment stated the opposite rule and would invite a revert.
  assert(
    !src.includes("must land in\n * the same Organization") &&
      !src.includes("must land in the same Organization"),
    "the shared-organization comment is gone",
  );
  assert(src.includes("T-226"), "the new rule names its ticket");
});

/* ─── the workspace is resolved on the server, from the session ──────────── */

suite("requireRecruiterWorkspace takes no id from the caller", () => {
  const src = source("src/features/recruiter-workspace/workspace.ts");
  assert(src.includes('import "server-only"'), "server-only");
  assert(src.includes("await auth()"), "resolves the caller from the session");
  assert(
    /export async function requireRecruiterWorkspace\(\s*\)/.test(src),
    "must take no parameters — a caller-supplied id is the bug class this closes",
  );
  assert(src.includes("ok: false"), "returns the result envelope");
});

suite("a registered recruiter always gets a workspace", () => {
  const src = source("src/features/recruiter-workspace/workspace.ts");
  assert(
    src.includes("ensureRecruiterWorkspace"),
    "the workspace is resolved through the self-healing helper",
  );
  // Plan 127: approval and the setup wizard were the two gates between
  // registering and working. Neither may come back as a refusal here.
  assert(!src.includes("profile.approved"), "no approval gate");
  assert(!src.includes("under review"), "no application-review refusal");
  assert(
    !src.includes("setupCompletedAt"),
    "no wizard gate — provisioning is not something a recruiter has to finish",
  );
});

/* ─── there is nothing to wait for ───────────────────────────────────────── */

suite("the recruiter state machine has no waiting states", () => {
  const src = source("src/features/talent-pool/recruiter-registration.ts");
  assert(
    !src.includes('"pending"') && !src.includes('"setup_incomplete"'),
    "registering and being a recruiter are the same thing",
  );
  assert(
    src.includes('status: "active"'),
    "a profile resolves straight to active",
  );
  // getRecruiterState runs in the /hire and /talent layouts on every request.
  const from = src.indexOf("export async function getRecruiterState");
  const fn = src.slice(from, src.indexOf("export async function", from + 1));
  assert(fn.length > 0, "getRecruiterState exists");
  assert(
    !fn.includes("$transaction") && !fn.includes(".update("),
    "the layout read must not write",
  );
});

suite("the application screens are gone, and nothing links to them", () => {
  for (const rel of [
    "src/app/talent/pending/page.tsx",
    "src/app/talent/setup/page.tsx",
    "src/components/talent/recruiter-setup-form.tsx",
    "src/app/actions/recruiter-setup-actions.ts",
    "src/app/actions/admin-recruiter-actions.ts",
  ]) {
    assert(!existsSync(join(process.cwd(), rel)), `${rel} must be deleted`);
  }
  const offenders = sourceFiles(["src/app", "src/components", "src/features", "src/lib"])
    .filter((rel) => !rel.endsWith(".test.ts"))
    .filter((rel) => /["'`]\/talent\/(pending|setup)/.test(code(rel)));
  assert(
    offenders.length === 0,
    `these still route to a removed screen: ${offenders.join(", ")}`,
  );
});

suite("registration signs in with the same code, not a second OTP", () => {
  const src = source("src/components/talent/recruiter-register-form.tsx");
  const finish = src.slice(src.indexOf("function finish()"));
  const stop = finish.indexOf("if (step === ");
  const body = stop > 0 ? finish.slice(0, stop) : finish;

  assert(
    body.includes('signIn("recruiter-otp"'),
    "registration opens the session with the same code",
  );
  // The destination is now whatever `redirectTo` holds — "/hire" by default,
  // or the page the recruiter was trying to reach when they were sent to sign
  // in. What must not change is that it is a full navigation.
  assert(
    body.includes("window.location.href = redirectTo"),
    "a successful session navigates to the resolved destination",
  );
  assert(
    !body.includes("router.push(") && !body.includes("router.refresh("),
    "no App Router transition — it never settles across a server redirect",
  );
  assert(
    !src.includes('setStep("done")') && !src.includes("we'll reach out soon"),
    "the terminal done panel is gone",
  );
  const happy = body.slice(0, body.indexOf("signin.error"));
  assert(
    !happy.includes("/talent/login"),
    "the happy path must not send them to a second OTP",
  );
});

suite("the login page seeds the email it was handed", () => {
  const page = source("src/app/talent/login/page.tsx");
  assert(page.includes("email?: string"), "the page accepts ?email=");
  assert(page.includes("initialEmail={params.email"), "and forwards it");
  const form = source("src/components/talent/recruiter-login-form.tsx");
  assert(
    form.includes("useState(initialEmail)"),
    "the form seeds its email box from it",
  );
});

suite("recruiter sign-in lands on the desk", () => {
  const src = source("src/components/talent/recruiter-login-form.tsx");
  const fn = src.slice(src.indexOf("function submitCode()"));
  const stop = fn.indexOf("if (step === ");
  const body = stop > 0 ? fn.slice(0, stop) : fn;

  // Sign-in used to route through /talent/setup because it could not know
  // which of three recruiter states the account was in. Plan 127 left one
  // state; the destination now comes from `redirectTo`, which defaults to the
  // desk and otherwise carries the page the recruiter was sent here from.
  assert(
    body.includes("window.location.href = redirectTo"),
    "a successful sign-in navigates to the resolved destination",
  );
  // Still a full navigation, not an App Router transition: the session cookie
  // has just been set and every guard downstream reads it server-side.
  assert(
    !body.includes("router.push(") && !body.includes("router.refresh("),
    "no App Router transition across a fresh session cookie",
  );
});

suite("the workspace is provisioned by registering, not by a wizard", () => {
  const src = source("src/features/hire/provision-recruiter.ts");
  const fn = src.slice(src.indexOf("export async function ensureRecruiterWorkspace"));
  assert(fn.length > 0, "the helper exists");
  assert(
    /export async function ensureRecruiterWorkspace\(\s*userId: string,?\s*\)/.test(src),
    "it takes only a user id resolved by its caller from the session",
  );
  const tx = fn.indexOf("$transaction");
  const provision = fn.indexOf("provisionRecruiterIdentity");
  assert(tx > 0 && provision > tx, "provisioning happens inside the transaction");
  // Idempotence is what makes it safe to call on every gated request: an
  // existing workspace short-circuits before the transaction is opened.
  assert(
    fn.indexOf("organizationMember.findFirst") < tx,
    "an existing workspace is returned without writing",
  );

  // Registration provisions up front, so the healing path is a fallback for
  // rows written under the old flow rather than the normal case.
  for (const rel of [
    "src/app/actions/recruiter-auth-actions.ts",
    "src/features/talent-pool/recruiter-registration.ts",
  ]) {
    const reg = source(rel);
    assert(
      reg.includes("provisionRecruiterIdentity"),
      `${rel} provisions the workspace as it creates the profile`,
    );
    assert(
      !/approved:\s*(approved|Boolean\(seat\)|false)/.test(reg),
      `${rel} must not create a profile that is waiting for anything`,
    );
  }
});

suite("nothing reads approval as a gate any more", () => {
  // Server-side reads only. `approved` survives as a column that is always
  // written true, and as a boolean prop on the hire auth context meaning
  // "signed in and a recruiter" — neither is a gate. What must not come back
  // is a refusal branch or a query that selects the unapproved.
  const offenders = sourceFiles(["src/app", "src/components", "src/features", "src/lib"])
    .filter((rel) => !rel.endsWith(".test.ts"))
    .filter((rel) =>
      /!profile\??\.approved|where:\s*\{\s*approved:\s*false/.test(code(rel)),
    );
  assert(
    offenders.length === 0,
    `approval is still gating: ${offenders.join(", ")}`,
  );
});

/* ─── the migration must not disturb existing recruiters ─────────────────── */

suite("existing recruiters are migrated as already set up", () => {
  const sql = source(
    "prisma/migrations/20260909180000_recruiter_independent_workspace/migration.sql",
  );
  assert(sql.includes("CREATE TYPE \"RecruiterSetupStep\""), "enum created");
  assert(
    /UPDATE "RecruiterProfile"[\s\S]*'COMPLETE'/.test(sql),
    "existing rows are backfilled to COMPLETE, not left in the wizard",
  );
  assert(
    !/DROP\s+(TABLE|COLUMN)/i.test(sql),
    "additive only — nothing dropped",
  );
});

suite("the onboarding wizard uses one OTP on the happy path", () => {
  const src = source(
    "src/components/recruiter-onboarding/recruiter-onboarding-wizard.tsx",
  );
  const register = src.slice(
    src.indexOf("function register()"),
    src.indexOf("function openWorkspace()"),
  );
  assert(
    register.includes('signIn("recruiter-otp"'),
    "the register code also opens the session",
  );
  assert(
    register.includes('go("ready"'),
    "a successful session skips the second code card",
  );
  const errorAt = register.indexOf("signin.error");
  assert(errorAt > 0, "sign-in failure is handled");
  const happy = register.slice(0, errorAt);
  assert(
    !happy.includes('intent: "signin"'),
    "the happy path must not email a second code",
  );
  const recovery = register.slice(errorAt);
  assert(
    recovery.includes('intent: "signin"') && recovery.includes('go("signin-code"'),
    "a failed session still recovers with a sign-in code",
  );
});

/* ─── T-225 must still hold ──────────────────────────────────────────────── */

suite("work-email enforcement is untouched", () => {
  for (const rel of [
    "src/app/actions/recruiter-auth-actions.ts",
    "src/features/talent-pool/recruiter-registration.ts",
  ]) {
    assert(
      source(rel).includes("isPersonalEmailDomain"),
      `${rel} still enforces T-225`,
    );
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
