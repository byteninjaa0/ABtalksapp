/**
 * Plan 195 — the test environment's shared vocabulary.
 *
 * Imported by BOTH the in-app test console (`src/app/dev/test-console`) and the
 * scripts under `scripts/test-env/`, which is why it lives here rather than
 * beside those scripts: `tsconfig.json` excludes `scripts/`, so anything `src/`
 * depends on has to be type-checked from this side.
 *
 * Constants and `process.env` reads only — no Prisma, no `server-only`. The
 * scripts import it from Node and the console imports it from a Server
 * Component, and neither should pull a database client in to ask what the test
 * accounts are called.
 */

/** Hostnames that can only mean "this machine". */
export const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/** The `DATABASE_URL` host, or null if unset/unparseable. */
export function databaseHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname;
  } catch {
    return null;
  }
}

/** Is `DATABASE_URL` pointed at this machine? */
export function isLoopbackDatabase(): boolean {
  const host = databaseHost();
  return host !== null && LOOPBACK_HOSTS.has(host);
}

/**
 * Whether the test console may render.
 *
 * Three independent conditions, and the order is least-to-most trustworthy:
 *
 *   1. `NODE_ENV` is not production — true in any `next dev`.
 *   2. `ENABLE_TEST_CONSOLE=true` — the explicit opt-in.
 *   3. `DATABASE_URL` is loopback — the one that actually matters.
 *
 * (3) carries the weight. The console grants admin, rewrites credit balances
 * and signs in as arbitrary accounts, so the question is not "did someone mean
 * to enable this" but "could this ever be reachable in a deployed
 * environment". A flag can be mis-set in a Vercel dashboard; a Neon connection
 * string cannot be made to look like `127.0.0.1`. (1) and (2) are kept because
 * defence in depth is cheap here, not because either would be sufficient.
 */
export function isTestConsoleEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_TEST_CONSOLE !== "true") return false;
  return isLoopbackDatabase();
}

/** Why the console refused, for the one-line reason it logs. */
export function testConsoleRefusal(): string | null {
  if (process.env.NODE_ENV === "production") return "NODE_ENV is production";
  if (process.env.ENABLE_TEST_CONSOLE !== "true")
    return "ENABLE_TEST_CONSOLE is not 'true'";
  if (!isLoopbackDatabase())
    return `DATABASE_URL host is ${databaseHost() ?? "unset"}, not loopback`;
  return null;
}

// ---------------------------------------------------------------------------
// The cast
// ---------------------------------------------------------------------------

/**
 * Every test account ends in this suffix, which is not incidental:
 * `npm run db:cleanup:test` deletes by exactly this suffix, and so does
 * `seedTestUsers`. An account named anything else survives a reset and then
 * drifts.
 */
export const TEST_EMAIL_SUFFIX = "@abtalks.dev";

/** Which product surface an identity is for. Drives the default host and landing path. */
export type TestTrack =
  | "challenge"
  | "recruiter"
  | "admin"
  | "program"
  | "hackathon"
  | "unregistered";

/**
 * Which cookie jar an identity belongs in.
 *
 * This is the session-collision fix, expressed as data. Cookies in this app are
 * host-only (`auth.config.ts` sets no `domain`, deliberately), and `*.localhost`
 * resolves to 127.0.0.1 through the OS resolver with no `/etc/hosts` entry — so
 * two hosts on the same port are two independent cookie jars, and a candidate
 * session at `localhost` is untouched by a recruiter signing in at
 * `recruiter.localhost`.
 *
 * Every host listed here must also appear in `ALLOWED_DEV_ORIGINS` in
 * `.env.test`, or Next 16 refuses to serve `/_next/*` to it and the pages
 * arrive without hydration.
 */
export type TestHost =
  | "localhost"
  | "candidate.localhost"
  | "recruiter.localhost"
  | "admin.localhost"
  | "program.localhost"
  | "hackathon.localhost";

export const TEST_PORT = 3100;

export type TestIdentity = {
  /** Stable key used by the CLI, the console and the Playwright storage states. */
  key: string;
  email: string;
  password: string;
  name: string;
  track: TestTrack;
  /** The cookie jar this identity is meant to live in. */
  host: TestHost;
  /** `audience` for the plan-154 password provider. A door only opens its own accounts. */
  audience: "candidate" | "recruiter";
  /** Where this identity's product starts. */
  landing: string;
  /** One line for the console, describing what this account is useful for. */
  note: string;
};

/**
 * The accounts the environment guarantees.
 *
 * The nine candidates and the admin are the ones `prisma/seed.ts` already
 * creates — listed rather than re-invented, so the cast cannot drift from the
 * seed. Their day counts are the seed's own `daysCompleted`, which is why they
 * are uneven: they were chosen to cover early / mid / late / finished.
 *
 * The rest are created by `scripts/test-env/bootstrap.ts`.
 */
export const TEST_IDENTITIES: readonly TestIdentity[] = [
  // --- Challenge track, from prisma/seed.ts ---------------------------------
  {
    key: "arjun",
    email: "arjun@abtalks.dev",
    password: "test",
    name: "Arjun",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "SE, day 7 — early challenge state, 7-day streak",
  },
  {
    key: "priya",
    email: "priya@abtalks.dev",
    password: "test",
    name: "Priya",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "DS, day 7 — the data-science domain at the same point as Arjun",
  },
  {
    key: "rohan",
    email: "rohan@abtalks.dev",
    password: "test",
    name: "Rohan",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "AI, day 7 — the AI domain",
  },
  {
    key: "sneha",
    email: "sneha@abtalks.dev",
    password: "test",
    name: "Sneha",
    track: "challenge",
    host: "candidate.localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "SE, day 7 — a SECOND candidate jar, for candidate-vs-candidate checks",
  },
  {
    key: "vikram",
    email: "vikram@abtalks.dev",
    password: "test",
    name: "Vikram",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "DS, day 15",
  },
  {
    key: "dhruv",
    email: "dhruv@abtalks.dev",
    password: "test",
    name: "Dhruv",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "SE, day 20",
  },
  {
    key: "anika",
    email: "anika@abtalks.dev",
    password: "test",
    name: "Anika",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "SE, day 30 — halfway, useful for certificate and streak maths",
  },
  {
    key: "karan",
    email: "karan@abtalks.dev",
    password: "test",
    name: "Karan",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "AI, day 40 — late-stage, inside the recruiter-discoverable range",
  },
  {
    key: "meera",
    email: "meera@abtalks.dev",
    password: "test",
    name: "Meera",
    track: "challenge",
    host: "localhost",
    audience: "candidate",
    landing: "/dashboard",
    note: "SE, day 60 COMPLETED — finished the challenge; certificates and talent visibility",
  },

  // --- Admin ---------------------------------------------------------------
  {
    key: "admin",
    email: "admin@abtalks.dev",
    password: "admin",
    name: "Admin",
    track: "admin",
    host: "admin.localhost",
    audience: "candidate",
    landing: "/admin",
    note: "Platform admin. Needs the UserRoleAssignment grant, not just User.role",
  },

  // --- Recruiter -----------------------------------------------------------
  // Two of them, in two organizations, because recruiter isolation is a real
  // invariant of this platform and one recruiter cannot test it.
  {
    key: "recruiter",
    email: "recruiter@abtalks.dev",
    password: "test",
    name: "Riya Recruiter",
    track: "recruiter",
    host: "recruiter.localhost",
    audience: "recruiter",
    landing: "/hire",
    note: "Recruiter at Test Hiring Co, funded desk",
  },
  {
    key: "recruiter2",
    email: "recruiter2@abtalks.dev",
    password: "test",
    name: "Sam Second",
    track: "recruiter",
    host: "recruiter.localhost",
    audience: "recruiter",
    landing: "/hire",
    note: "Recruiter in a DIFFERENT organization — the isolation counterparty",
  },

  // --- Program / hackathon -------------------------------------------------
  {
    key: "program",
    email: "program@abtalks.dev",
    password: "test",
    name: "Pavan Program",
    track: "program",
    host: "program.localhost",
    audience: "candidate",
    landing: "/program/ai-cohort/dashboard",
    note: "AI Cohort member (31-day program track)",
  },
  {
    key: "hackathon",
    email: "hackathon@abtalks.dev",
    password: "test",
    name: "Hema Hackathon",
    track: "hackathon",
    host: "hackathon.localhost",
    audience: "candidate",
    landing: "/hackathon/dashboard",
    note: "Hackathon participant",
  },

  // --- The empty case ------------------------------------------------------
  {
    key: "fresh",
    email: "fresh@abtalks.dev",
    password: "test",
    name: "Fresh Start",
    track: "unregistered",
    host: "candidate.localhost",
    audience: "candidate",
    landing: "/register",
    note: "Account with NO CandidateProfile — lands on /register. Tests the registration funnel",
  },
] as const;

export function findIdentity(key: string): TestIdentity | undefined {
  return TEST_IDENTITIES.find((i) => i.key === key);
}

/** `http://<host>:3100` — where this identity's session lives. */
export function originFor(identity: TestIdentity): string {
  return `http://${identity.host}:${TEST_PORT}`;
}

/** Every distinct cookie jar in use, for the console's "open the other side" links. */
export function testHosts(): TestHost[] {
  return [...new Set(TEST_IDENTITIES.map((i) => i.host))];
}
