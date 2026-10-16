/**
 * Plan 195 — start the dev server against the test environment.
 *
 * This exists because `.env.local` wins otherwise. Next loads
 * `.env.local` → `.env` and does not overwrite a variable that is already set
 * in `process.env`, so the only reliable way to repoint the server at the test
 * database is to put the values there BEFORE Next starts. That is all this
 * script does: read `.env.test`, verify the target is loopback, hand the whole
 * environment to a child `next dev`.
 *
 * Port 3100, never 3000. The ordinary `npm run dev` on 3000 talks to a Neon
 * host with real users, and the two must never be confusable — not in a
 * browser tab, not in a bookmark, not in a Playwright base URL.
 */
import { spawn } from "node:child_process";

import { enterTestEnv } from "./guard";
import { TEST_IDENTITIES, TEST_PORT, testHosts } from "../../src/lib/test-env";

enterTestEnv("Test environment dev server");

const byHost = new Map<string, string[]>();
for (const identity of TEST_IDENTITIES) {
  byHost.set(identity.host, [...(byHost.get(identity.host) ?? []), identity.key]);
}

console.log("   Cookie jars — one live session each, all at the same time:\n");
for (const host of testHosts()) {
  const keys = byHost.get(host) ?? [];
  console.log(
    `     http://${host}:${TEST_PORT}`.padEnd(42) + `  ${keys.join(", ")}`,
  );
}
console.log(
  `\n   Test console on any of them:  /dev/test-console` +
    `\n   (sign in there, then that host keeps that identity)\n`,
);

/**
 * `-H 0.0.0.0` so the server answers on 127.0.0.1 — which is what every
 * `*.localhost` host resolves to — and on the LAN, which keeps phone-width
 * checks possible. `ALLOWED_DEV_ORIGINS` in `.env.test` is what makes Next 16
 * serve `/_next/*` to those hosts rather than blocking them.
 */
const child = spawn(
  "npx",
  ["next", "dev", "-p", String(TEST_PORT), "-H", "0.0.0.0"],
  {
    env: {
      ...process.env,
      // Its own build directory, so this server does not contend with the
      // ordinary `npm run dev` on 3000 for Next 16's one-dev-server-per-
      // distDir lock. `next.config.ts` reads this and defaults to `.next`.
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-test",
    },
    stdio: "inherit",
    shell: false,
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code) => process.exit(code ?? 0));
