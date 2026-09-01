/**
 * The recruiter OTP dev fallback — run with:
 *   npm run test:otp-dev
 *
 * No network, no database. This tests one thing and it is the thing that
 * matters: production refuses the shortcut whatever the flag says. Everything
 * else here is convenience; that line is the security boundary.
 */
import { otpDevFallbackEnabled } from "@/features/recruiter-auth/otp";

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

/**
 * NODE_ENV is readonly in the Next types but writable at runtime, which is what
 * the function reads. Restored after every case so no test leaks into the next.
 */
function withEnv(
  env: { nodeEnv?: string; flag?: string; brevo?: string },
  fn: () => void,
) {
  const prev = {
    nodeEnv: process.env.NODE_ENV,
    flag: process.env.RECRUITER_OTP_DEV,
    brevo: process.env.BREVO_API_KEY,
  };
  const set = (k: string, v: string | undefined) => {
    if (v === undefined) delete (process.env as Record<string, string | undefined>)[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  };
  try {
    set("NODE_ENV", env.nodeEnv);
    set("RECRUITER_OTP_DEV", env.flag);
    set("BREVO_API_KEY", env.brevo);
    fn();
  } finally {
    set("NODE_ENV", prev.nodeEnv);
    set("RECRUITER_OTP_DEV", prev.flag);
    set("BREVO_API_KEY", prev.brevo);
  }
}

console.log("\nrecruiter OTP dev fallback");

suite("production refuses it even with the flag on", () => {
  withEnv({ nodeEnv: "production", flag: "true" }, () => {
    assert(
      otpDevFallbackEnabled() === false,
      "a deployed environment must never show somebody's sign-in code",
    );
  });
});

suite("production refuses it with the flag on and no mail key", () => {
  // The old condition would have said yes to exactly this.
  withEnv({ nodeEnv: "production", flag: "true", brevo: undefined }, () => {
    assert(otpDevFallbackEnabled() === false, "still refused in production");
  });
});

suite("development with the flag on allows it", () => {
  withEnv({ nodeEnv: "development", flag: "true" }, () => {
    assert(otpDevFallbackEnabled() === true, "the shortcut should be available");
  });
});

suite("development without the flag does not", () => {
  withEnv({ nodeEnv: "development", flag: undefined }, () => {
    assert(otpDevFallbackEnabled() === false, "opt-in, not on by default");
  });
});

suite("the flag must be exactly 'true'", () => {
  for (const v of ["1", "yes", "TRUE", "on", ""]) {
    withEnv({ nodeEnv: "development", flag: v }, () => {
      assert(
        otpDevFallbackEnabled() === false,
        `"${v}" should not enable it — only the literal "true" does`,
      );
    });
  }
});

suite("the mail key no longer decides anything", () => {
  // This is the regression that started it: configuring Brevo silently turned
  // the local shortcut off, and every test then spent real quota.
  withEnv({ nodeEnv: "development", flag: "true", brevo: "xkeysib-whatever" }, () => {
    assert(
      otpDevFallbackEnabled() === true,
      "a configured mail provider must not disable the developer shortcut",
    );
  });
  withEnv({ nodeEnv: "development", flag: undefined, brevo: undefined }, () => {
    assert(
      otpDevFallbackEnabled() === false,
      "and a missing one must not enable it either",
    );
  });
});

console.log(`\n${passed} passed${failed ? `, ${failed} failed` : ""}\n`);
if (failed) process.exit(1);
