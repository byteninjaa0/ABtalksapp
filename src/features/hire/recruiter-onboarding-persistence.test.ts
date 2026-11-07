/**
 * Plan 167 — recruiter onboarding survives a closed tab, and a session skips
 * the code.
 *
 * Two things must not be quietly undone:
 *   1. The draft's storage. sessionStorage is scoped to one tab, and this flow
 *      REQUIRES leaving the tab (step 3 emails a code). Reverting to it brings
 *      back the blank welcome card and the retyping that plan 167 exists to fix.
 *   2. The enumeration line from plan 166 §2b. Nothing added here may tell an
 *      anonymous caller whether an address already has an account.
 *
 * Run: npm run test:recruiter-onboarding-persistence
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

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const DRAFT = "src/components/recruiter-onboarding/onboarding-draft.ts";
const WIZARD =
  "src/components/recruiter-onboarding/recruiter-onboarding-wizard.tsx";
const IDENTITY = "src/components/recruiter-onboarding/steps/identity-step.tsx";

const draft = source(DRAFT);
const wizard = source(WIZARD);
const identity = source(IDENTITY);

console.log("\nPlan 167 — recruiter onboarding persistence");

// =========================================================================
// 1. The draft outlives the tab
// =========================================================================

suite("the draft is read and written through localStorage", () => {
  assert(
    draft.includes("window.localStorage.getItem(DRAFT_KEY)"),
    "readDraft must read localStorage",
  );
  assert(
    draft.includes("window.localStorage.setItem("),
    "writeDraft must write localStorage",
  );
});

suite("sessionStorage is never read or written again", () => {
  // The one surviving reference is clearDraft removing the legacy key.
  assert(
    !draft.includes("window.sessionStorage.getItem"),
    "a sessionStorage read brings the per-tab draft back",
  );
  assert(
    !draft.includes("window.sessionStorage.setItem"),
    "a sessionStorage write brings the per-tab draft back",
  );
  assert(
    draft.includes("window.sessionStorage.removeItem(LEGACY_DRAFT_KEY)"),
    "clearDraft must still clear the key the old version left behind",
  );
});

suite("the draft expires", () => {
  assert(draft.includes("const DRAFT_TTL_MS"), "a TTL constant must be named");
  assert(
    draft.includes("Date.now() - parsed.data.savedAt > DRAFT_TTL_MS"),
    "readDraft must refuse a draft older than the TTL",
  );
  assert(
    draft.includes("savedAt: z.number()"),
    "the stored envelope must carry the stamp the TTL is measured from",
  );
});

suite("no code and no password are ever persisted", () => {
  // Both are React state in the wizard and must stay out of the schema.
  assert(
    !/^\s*code:/m.test(draft),
    "a code in the draft is a credential in storage",
  );
  assert(
    !/^\s*password:/m.test(draft),
    "a password in the draft is a credential in storage",
  );
});

suite("the draft still never reaches the server", () => {
  assert(!draft.includes("use server"), "the draft is device-only");
  assert(
    !draft.includes("document.cookie"),
    "a cookie would send the name and work email on every request",
  );
});

// =========================================================================
// 2. A session finishes without a code
// =========================================================================

suite("the signed-in path registers from the session", () => {
  assert(
    wizard.includes("registerRecruiterAction"),
    "the session path must use the session-based action",
  );
  assert(
    wizard.includes("onSend={session ? createFromSession : sendRegisterCode}"),
    "the review card must branch on the session",
  );
});

suite("the signed-in path sends no code and makes no second sign-in", () => {
  const fn = wizard.slice(
    wizard.indexOf("function createFromSession"),
    wizard.indexOf("function resendCode"),
  );
  assert(fn.length > 0, "createFromSession must exist");
  assert(
    !fn.includes("requestRecruiterOtpAction"),
    "a session already proves the address — no code may be sent",
  );
  assert(
    !fn.includes("registerRecruiterWithOtpAction"),
    "the OTP registration action belongs to the anonymous path only",
  );
  assert(
    !fn.includes('signIn("recruiter-otp"'),
    "the recruiter is already signed in",
  );
});

suite("a restored draft cannot send a signed-in recruiter to a sign-in code", () => {
  assert(
    wizard.includes('if (!session && target === "signin-code"'),
    "the signin-code resume must be gated on there being no session",
  );
});

suite("the session's address wins over the draft's", () => {
  assert(
    wizard.includes("email: session.email"),
    "a draft that predates the sign-in must not override the session",
  );
  assert(
    identity.includes("readOnly={lockedEmail}"),
    "the session's address is not the recruiter's to edit here",
  );
});

// =========================================================================
// 3. The anonymous path is untouched
// =========================================================================

suite("the OTP registration path still exists in full", () => {
  assert(
    wizard.includes("registerRecruiterWithOtpAction({"),
    "register() must still call the OTP action",
  );
  assert(
    wizard.includes('signIn("recruiter-otp"'),
    "register() must still open the session with the code",
  );
  assert(wizard.includes('case "verify-code":'), "the code card must remain");
  assert(wizard.includes('case "signin-code":'), "the fallback card must remain");
});

// =========================================================================
// 4. Plan 166 §2b — no account enumeration was added
// =========================================================================

suite("the identity step calls no server action", () => {
  // An "is this email taken?" probe on the field where the address is typed
  // would reveal account existence to anyone who can type an email.
  assert(
    !identity.includes("Action("),
    "the identity step must not query the server about the address",
  );
  assert(
    !identity.includes("@/app/actions/"),
    "the identity step must not import a server action",
  );
});

suite("already-registered is still only reachable from the register intent", () => {
  assert(
    wizard.includes('intent: "register"'),
    "the only disclosure point stays requestRecruiterOtpAction",
  );
  const otp = source("src/features/recruiter-auth/otp.ts");
  assert(
    otp.includes('if (intent === "register" && isRegistered)'),
    "the gate itself is unchanged",
  );
});

// =========================================================================
// 5. The pages
// =========================================================================

suite("an active recruiter is redirected before the wizard renders", () => {
  for (const rel of [
    "src/app/recruiter-onboarding/page.tsx",
    "src/app/recruiter-onboarding/signup/page.tsx",
  ]) {
    const page = source(rel);
    assert(
      page.includes('if (state.status === "active") redirect("/hire")'),
      `${rel} must keep the active redirect`,
    );
    assert(
      page.indexOf("getRecruiterState") <
        page.indexOf("<RecruiterOnboardingWizard"),
      `${rel} must resolve the recruiter before rendering the wizard`,
    );
    assert(
      page.includes("session={sessionIdentity}"),
      `${rel} must pass the session down`,
    );
  }
});

suite("both pages stay public", () => {
  for (const rel of [
    "src/app/recruiter-onboarding/page.tsx",
    "src/app/recruiter-onboarding/signup/page.tsx",
  ]) {
    const page = source(rel);
    assert(!page.includes("requireRole"), `${rel} must stay public`);
    assert(!page.includes("requireAdmin"), `${rel} must stay public`);
  }
});

// =========================================================================
// 6. The draft module, actually run
// =========================================================================

/**
 * The assertions above pin the source; these run it. A fake `window` with the
 * two Storage objects is enough — the module touches nothing else — and it is
 * what lets the TTL and the tab-close case be tested rather than asserted.
 */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    get size() {
      return map.size;
    },
    raw: map,
  };
}

async function runtimeSuites() {
  const local = fakeStorage();
  const session = fakeStorage();
  (globalThis as { window?: unknown }).window = {
    localStorage: local,
    sessionStorage: session,
  };

  const { EMPTY_DRAFT, clearDraft, readDraft, writeDraft } = await import(
    "@/components/recruiter-onboarding/onboarding-draft"
  );

  const filled = {
    ...EMPTY_DRAFT,
    step: "verify" as const,
    fullName: "Priya Sharma",
    email: "priya@acme.com",
    company: "Acme",
    website: "acme.com",
    industry: "Software & SaaS",
    companySize: "51–200",
    companyLocation: "Bengaluru",
  };

  suite("a written draft reads back whole", () => {
    writeDraft(filled);
    const back = readDraft();
    assert(back !== null, "the draft must survive the round trip");
    assert(back?.fullName === "Priya Sharma", "name");
    assert(back?.email === "priya@acme.com", "email");
    assert(back?.companyLocation === "Bengaluru", "location");
    assert(back?.step === "verify", "the step the recruiter had reached");
  });

  suite("it lands in localStorage, not sessionStorage", () => {
    // This is the bug in one assertion: sessionStorage dies with the tab, and
    // Verify emails a code, so leaving the tab is a required step.
    assert(local.size === 1, "localStorage must hold the draft");
    assert(session.size === 0, "sessionStorage must hold nothing");
  });

  suite("the registered flag survives, so a missed sign-in is recoverable", () => {
    writeDraft({ ...filled, registered: true });
    assert(readDraft()?.registered === true, "registered must persist");
  });

  suite("a draft older than the TTL is dropped, and its key with it", () => {
    const [key] = [...local.raw.keys()];
    const stored = JSON.parse(local.raw.get(key)!) as { savedAt: number };
    local.raw.set(
      key,
      JSON.stringify({
        savedAt: stored.savedAt - 8 * 24 * 60 * 60 * 1000,
        draft: filled,
      }),
    );
    assert(readDraft() === null, "an 8-day-old draft must not come back");
    assert(local.size === 0, "and the stale key must be removed");
  });

  suite("a six-day-old draft still comes back", () => {
    writeDraft(filled);
    const [key] = [...local.raw.keys()];
    const stored = JSON.parse(local.raw.get(key)!) as { savedAt: number };
    local.raw.set(
      key,
      JSON.stringify({
        savedAt: stored.savedAt - 6 * 24 * 60 * 60 * 1000,
        draft: filled,
      }),
    );
    assert(readDraft()?.email === "priya@acme.com", "still inside the TTL");
  });

  suite("garbage is survivable", () => {
    const [key] = [...local.raw.keys()];
    local.raw.set(key, "{not json");
    assert(readDraft() === null, "a corrupt value must not throw");
    local.raw.set(key, JSON.stringify({ savedAt: Date.now(), draft: { v: 9 } }));
    assert(readDraft() === null, "a draft of the wrong shape must not throw");
  });

  suite("clearDraft clears both stores", () => {
    writeDraft(filled);
    session.raw.set("klymb-recruiter-onboarding", JSON.stringify(filled));
    clearDraft();
    assert(local.size === 0, "the current key must go");
    assert(session.size === 0, "and so must the one the old version left");
  });

  suite("a missing store is not a crash", () => {
    // Private mode, blocked site data, or a throwing accessor.
    (globalThis as { window?: unknown }).window = {
      get localStorage(): never {
        throw new Error("blocked");
      },
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    };
    assert(readDraft() === null, "readDraft must return null, not throw");
    writeDraft(filled);
    clearDraft();
  });
}

// =========================================================================
// Summary
// =========================================================================

void runtimeSuites().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
});
