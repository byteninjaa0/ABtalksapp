"use client";

import { useState, useTransition } from "react";

import {
  becomeIdentityAction,
  clearRateLimitsAction,
  clearSessionAction,
  setChallengeDayAction,
  setCreditBalanceAction,
  toggleAdminAction,
} from "@/app/actions/test-console-actions";

/**
 * Plan 195 — the test console, client half. Buttons and forms only; every
 * decision and every write is in the Server Actions.
 *
 * `host` arrives as a prop, resolved from the request's Host header. It is the
 * cookie jar: the session in the header belongs to this host alone, and signing
 * in here changes only this host's session. It is deliberately NOT read from
 * `window.location` — doing so left the identity groups empty on the server's
 * render and refilled after hydration, and React kept both arrangements.
 */

export type ConsoleIdentity = {
  key: string;
  email: string;
  name: string;
  password: string;
  track: string;
  host: string;
  landing: string;
  note: string;
  exists: boolean;
  isAdmin: boolean;
  hasEnrollment: boolean;
  isRecruiter: boolean;
  state: string;
};

type Props = {
  identities: ConsoleIdentity[];
  sessionEmail: string | null;
  sessionIsAdmin: boolean;
  host: string;
  port: number;
  rateLimitEvents: number;
};

const TRACK_LABEL: Record<string, string> = {
  challenge: "60-Day Challenge",
  recruiter: "Recruiter / hire desk",
  admin: "Platform admin",
  program: "AI Cohort",
  hackathon: "Hackathon",
  unregistered: "Not registered",
};

/** Routes worth one click, grouped the way the product is. */
const ROUTES: { group: string; items: [string, string][] }[] = [
  {
    group: "Candidate",
    items: [
      ["Dashboard", "/dashboard"],
      ["Profile", "/profile"],
      ["Explore", "/explore"],
      ["Achievements", "/achievements"],
      ["Register", "/register"],
      ["Marketplace", "/marketplace"],
      ["Practice", "/practice"],
      ["Settings", "/settings"],
    ],
  },
  {
    group: "Recruiter",
    items: [
      ["Scout (/hire)", "/hire"],
      ["Matches", "/hire/matches"],
      ["Projects", "/hire/projects"],
      ["Credits", "/hire/credits"],
      ["Recruiter login", "/talent/login"],
    ],
  },
  {
    group: "Admin",
    items: [
      ["Admin home", "/admin"],
      ["Platform admins", "/admin/platform-admins"],
      ["Hire", "/admin/hire"],
      ["Resume imports", "/admin/resume-imports"],
      ["Mock interview", "/admin/mock-interview"],
    ],
  },
  {
    group: "Program",
    items: [
      ["AI Cohort dashboard", "/program/ai-cohort/dashboard"],
      ["Curriculum", "/program/ai-cohort/curriculum"],
      ["Leaderboard", "/program/ai-cohort/leaderboard"],
      ["Apply", "/program/ai-cohort/apply"],
    ],
  },
  {
    group: "Hackathon & workshop",
    items: [
      ["Hackathon", "/hackathon"],
      ["Hackathon dashboard", "/hackathon/dashboard"],
      ["AI workshop", "/ai-workshop"],
      ["Cohort register", "/ai-cohort-register"],
      ["Cohort India", "/ai-cohort-india"],
    ],
  },
  {
    group: "Other",
    items: [
      ["Mock interviews", "/mock-interviews"],
      ["Jobs", "/jobs"],
      ["Certificates", "/verify"],
      ["Landing", "/"],
    ],
  },
];

export function TestConsole({
  identities,
  sessionEmail,
  sessionIsAdmin,
  host,
  port,
  rateLimitEvents,
}: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hosts = [...new Set(identities.map((i) => i.host))];
  const belongHere = identities.filter((i) => i.host === host);
  const elsewhere = identities.filter((i) => i.host !== host);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await fn();
        if (!result.ok) setMessage(result.message ?? "Failed.");
        else setMessage("Done.");
      } catch (error) {
        // A signIn/signOut redirect surfaces here as a thrown error object;
        // Next handles the navigation, so there is nothing to report.
        const text = String(error);
        if (!text.includes("NEXT_REDIRECT")) setMessage(text);
      }
    });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Test console</h1>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            local test database only
          </span>
        </div>

        <div className="mt-4 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span>
              <span className="text-muted-foreground">This host: </span>
              <code className="font-medium">{host}</code>
            </span>
            <span>
              <span className="text-muted-foreground">Signed in as: </span>
              {sessionEmail ? (
                <code className="font-medium">{sessionEmail}</code>
              ) : (
                <span className="italic text-muted-foreground">nobody</span>
              )}
              {sessionIsAdmin ? (
                <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                  admin
                </span>
              ) : null}
            </span>
            {sessionEmail ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => clearSessionAction())}
                className="text-xs underline underline-offset-2 disabled:opacity-50"
              >
                sign out of this host
              </button>
            ) : null}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Each host below is its own cookie jar, so they hold separate
            sessions at the same time. Signing in here changes{" "}
            <strong>only {host}</strong> — the others keep whoever
            they were. That is the fix for candidate and recruiter sessions
            evicting each other.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {hosts.map((h) => (
              <a
                key={h}
                href={`http://${h}:${port}/dev/test-console`}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  h === host
                    ? "border-foreground bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {h}
                {h === host ? " (here)" : ""}
              </a>
            ))}
          </div>
        </div>

        {message ? (
          <p className="mt-3 rounded-md border bg-muted px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
      </header>

      {/* ---------------- Identities for this host ---------------- */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">
          Identities for this host
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          These are the ones meant to live in {host}&rsquo;s cookie
          jar. You can sign in as any identity from any host — the grouping is a
          suggestion that keeps sessions from fighting.
        </p>
        <IdentityTable
          identities={belongHere}
          pending={pending}
          run={run}
        />
      </section>

      {elsewhere.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold">
            Identities that belong on another host
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Signing in as one of these <em>here</em> will replace this
            host&rsquo;s session. Open its own host instead to keep both.
          </p>
          <IdentityTable
            identities={elsewhere}
            pending={pending}
            run={run}
            port={port}
          />
        </section>
      ) : null}

      {/* ---------------- Environment controls ---------------- */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Environment</h2>
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <p className="font-medium">Login rate-limit events</p>
              <p className="text-muted-foreground">
                {rateLimitEvents} recorded. Password sign-in is rate limited per
                account and per address; switching identity repeatedly will
                eventually trip it. Cleared automatically on every switch — this
                is for clearing it by hand after testing the limiter itself.
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => clearRateLimitsAction())}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- Routes ---------------- */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">Jump to a route</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Opened on this host, as {sessionEmail ?? "a signed-out visitor"}.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROUTES.map((group) => (
            <div key={group.group} className="rounded-lg border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.group}
              </p>
              <ul className="space-y-1">
                {group.items.map(([label, path]) => (
                  <li key={path}>
                    <a
                      href={path}
                      className="text-sm underline-offset-2 hover:underline"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t pt-6 text-xs leading-relaxed text-muted-foreground">
        <p className="font-medium">Reset the environment</p>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-3">
          npm run test:env:reset{"\n"}
          npm run test:env:fixture -- --list{"\n"}
          npm run test:env:smoke
        </pre>
        <p className="mt-3">
          Plan 195 — <code>docs/plans/195-test-environment-and-suite.md</code>
        </p>
      </footer>
    </div>
  );
}

function IdentityTable({
  identities,
  pending,
  run,
  port,
}: {
  identities: ConsoleIdentity[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; message?: string }>) => void;
  port?: number;
}) {
  if (identities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        None.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {identities.map((identity) => (
        <div
          key={identity.key}
          className="rounded-lg border p-4 text-sm md:flex md:items-start md:justify-between md:gap-6"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{identity.name}</span>
              <code className="text-xs text-muted-foreground">
                {identity.email}
              </code>
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                {TRACK_LABEL[identity.track] ?? identity.track}
              </span>
              {identity.isAdmin ? (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
                  admin
                </span>
              ) : null}
              {!identity.exists ? (
                <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-200">
                  missing
                </span>
              ) : null}
            </div>

            <p className="mt-1 text-xs text-muted-foreground">{identity.note}</p>
            <p className="mt-1 font-mono text-xs">{identity.state}</p>

            {/* Parameters, shown only where they apply. */}
            <div className="mt-3 flex flex-wrap gap-4">
              {identity.hasEnrollment ? (
                <NumberControl
                  label="Challenge day"
                  defaultValue={1}
                  min={1}
                  max={60}
                  disabled={pending}
                  onApply={(day) =>
                    run(() =>
                      setChallengeDayAction({ key: identity.key, day }),
                    )
                  }
                />
              ) : null}

              {identity.isRecruiter ? (
                <NumberControl
                  label="Credits ($)"
                  defaultValue={200}
                  min={0}
                  max={100000}
                  disabled={pending}
                  onApply={(dollars) =>
                    run(() =>
                      setCreditBalanceAction({ key: identity.key, dollars }),
                    )
                  }
                />
              ) : null}

              {identity.exists ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      toggleAdminAction({
                        key: identity.key,
                        grant: !identity.isAdmin,
                      }),
                    )
                  }
                  className="self-end rounded-md border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
                >
                  {identity.isAdmin ? "Revoke admin" : "Grant admin"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex shrink-0 flex-col gap-2 md:mt-0 md:w-44">
            <button
              type="button"
              disabled={pending || !identity.exists}
              onClick={() =>
                run(() => becomeIdentityAction({ key: identity.key }))
              }
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
            >
              Sign in as
            </button>
            {port ? (
              <a
                href={`http://${identity.host}:${port}/dev/test-console`}
                className="rounded-md border px-3 py-1.5 text-center text-xs hover:bg-muted"
              >
                open {identity.host}
              </a>
            ) : (
              <a
                href={identity.landing}
                className="rounded-md border px-3 py-1.5 text-center text-xs hover:bg-muted"
              >
                {identity.landing}
              </a>
            )}
            <code className="text-center text-[11px] text-muted-foreground">
              pw: {identity.password}
            </code>
          </div>
        </div>
      ))}
    </div>
  );
}

/** A number input with an Apply button, so a value is only sent on purpose. */
function NumberControl({
  label,
  defaultValue,
  min,
  max,
  disabled,
  onApply,
}: {
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  disabled: boolean;
  onApply: (value: number) => void;
}) {
  const [value, setValue] = useState(String(defaultValue));

  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 rounded-md border px-2 py-1 text-xs"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed)) onApply(parsed);
          }}
          className="rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-50"
        >
          Apply
        </button>
      </span>
    </label>
  );
}
