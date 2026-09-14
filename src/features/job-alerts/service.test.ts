/**
 * TC-C-009 / TC-C-010 / TC-C-011 acceptance tests for T-250 job alerts.
 *   npx tsx src/features/job-alerts/service.test.ts
 *
 * Exercises the pure service + fanout against in-memory stores and a fake
 * dispatch that models the production dedup contract (unique on
 * `${eventType}:${recipientUserId}:${primaryEntityId}`).
 */
import type { JobType, JobWorkMode } from "@prisma/client";
import type { JobAlertStore, UpsertInput } from "./prisma-store";
import { matches } from "./matcher";
import {
  fanoutOnJobPublished,
  getMyAlert,
  setMyAlertEnabled,
  upsertMyAlert,
  type DispatchFn,
} from "./service";
import type { JobAlertRow, MatchableJob } from "./types";

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

function inMemoryAlertStore(): JobAlertStore & {
  rows: Map<string, JobAlertRow>;
} {
  const rows = new Map<string, JobAlertRow>();
  let seq = 0;
  return {
    rows,
    async getByCandidate(userId) {
      return rows.get(userId) ?? null;
    },
    async upsert(userId, input: UpsertInput) {
      const existing = rows.get(userId);
      const now = new Date();
      const row: JobAlertRow = {
        id: existing?.id ?? `alert_${++seq}`,
        candidateUserId: userId,
        enabled: input.enabled ?? true,
        skills: input.skills,
        role: input.role,
        location: input.location,
        workMode: input.workMode,
        opportunityType: input.opportunityType,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      rows.set(userId, row);
      return row;
    },
    async setEnabled(userId, enabled) {
      const existing = rows.get(userId);
      if (!existing) return null;
      const updated = { ...existing, enabled, updatedAt: new Date() };
      rows.set(userId, updated);
      return updated;
    },
    async findEnabledMatching(job) {
      const out: JobAlertRow[] = [];
      for (const row of rows.values()) {
        if (matches(job, row)) out.push(row);
      }
      return out;
    },
  };
}

/**
 * Fake dispatcher modelled on the T-248 contract: unique on
 * (eventType, recipientUserId, primaryEntityId). Second call returns
 * deduplicated: true and does NOT record a new send.
 */
function fakeDispatcher(): DispatchFn & { sent: string[]; deduped: string[] } {
  const seen = new Set<string>();
  const sent: string[] = [];
  const deduped: string[] = [];
  const fn: DispatchFn = async (event) => {
    const key = `${event.eventType}:${event.recipientUserId}:${event.primaryEntityId}`;
    if (seen.has(key)) {
      deduped.push(key);
      return { ok: true, deduplicated: true };
    }
    seen.add(key);
    sent.push(key);
    return { ok: true, deduplicated: false };
  };
  return Object.assign(fn, { sent, deduped });
}

function reactBengaluruFullTime(): UpsertInput {
  return {
    skills: ["React"],
    role: null,
    location: "Bengaluru",
    workMode: null,
    opportunityType: "FULL_TIME" satisfies JobType,
  };
}

function matchingJob(id = "job_match"): MatchableJob {
  return {
    id,
    title: "Senior React Engineer",
    company: "Acme",
    location: "Bengaluru, KA",
    workMode: "HYBRID" satisfies JobWorkMode,
    type: "FULL_TIME",
    skills: ["React", "TypeScript"],
  };
}

function nonMatchingJob(id = "job_miss"): MatchableJob {
  return {
    id,
    title: "Backend Python Developer",
    company: "Acme",
    location: "Mumbai",
    workMode: "ONSITE",
    type: "PART_TIME",
    skills: ["Python"],
  };
}

async function run() {
console.log("service.test.ts");

// --- CRUD ---

await suite("upsert creates a fresh row with defaults", async () => {
  const store = inMemoryAlertStore();
  const res = await upsertMyAlert({ alerts: store }, "u1", reactBengaluruFullTime());
  assert(res.ok, "upsert should succeed");
  assert(res.data.enabled === true, "defaults to enabled");
  assert(res.data.candidateUserId === "u1", "scoped to caller");
});

await suite("upsert updates an existing row and preserves id", async () => {
  const store = inMemoryAlertStore();
  const first = await upsertMyAlert({ alerts: store }, "u1", reactBengaluruFullTime());
  const second = await upsertMyAlert(
    { alerts: store },
    "u1",
    { ...reactBengaluruFullTime(), location: "Pune" },
  );
  assert(first.ok && second.ok, "both succeed");
  assert(first.data.id === second.data.id, "same id preserved");
  assert(second.data.location === "Pune", "field replaced");
});

await suite("getMyAlert returns null when none exists", async () => {
  const store = inMemoryAlertStore();
  const res = await getMyAlert({ alerts: store }, "u1");
  assert(res.ok && res.data === null, "null for no row");
});

await suite("setEnabled returns NOT_FOUND when no row exists", async () => {
  const store = inMemoryAlertStore();
  const res = await setMyAlertEnabled({ alerts: store }, "u1", false);
  assert(!res.ok && res.code === "NOT_FOUND", "expected NOT_FOUND");
});

// --- Fanout: TC-C-009 ---

await suite(
  "TC-C-009: matching candidate receives exactly one dispatch on publish",
  async () => {
    const store = inMemoryAlertStore();
    await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
    const dispatch = fakeDispatcher();
    const summary = await fanoutOnJobPublished(
      { alerts: store, dispatch },
      matchingJob("job_1"),
    );
    assert(summary.matched === 1, `matched ${summary.matched}`);
    assert(summary.sent === 1, `sent ${summary.sent}`);
    assert(summary.deduplicated === 0, `dedup ${summary.deduplicated}`);
    assert(dispatch.sent.length === 1, "one dispatch");
  },
);

// --- Fanout: TC-C-010 (nothing on edit/re-publish) ---

await suite(
  "TC-C-010: re-fanout for the same job dedupes to zero new sends",
  async () => {
    const store = inMemoryAlertStore();
    await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
    const dispatch = fakeDispatcher();
    const job = matchingJob("job_1");
    const first = await fanoutOnJobPublished({ alerts: store, dispatch }, job);
    const second = await fanoutOnJobPublished({ alerts: store, dispatch }, job);
    assert(first.sent === 1 && second.sent === 0, "second sends nothing new");
    assert(second.deduplicated === 1, "second deduplicates");
    assert(dispatch.sent.length === 1, "one real send in total");
    assert(dispatch.deduped.length === 1, "one dedup hit");
  },
);

// --- Fanout: TC-C-011 (non-matching + toggle off) ---

await suite("TC-C-011a: non-matching candidate receives nothing", async () => {
  const store = inMemoryAlertStore();
  await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
  const dispatch = fakeDispatcher();
  const summary = await fanoutOnJobPublished(
    { alerts: store, dispatch },
    nonMatchingJob("job_2"),
  );
  assert(summary.matched === 0, "no match");
  assert(dispatch.sent.length === 0, "no dispatch");
});

await suite(
  "TC-C-011b: disabling alerts stops delivery; re-enable preserves criteria",
  async () => {
    const store = inMemoryAlertStore();
    await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
    const off = await setMyAlertEnabled({ alerts: store }, "cand_A", false);
    assert(off.ok, "disable succeeds");
    assert(off.data.enabled === false, "row now disabled");

    const dispatch = fakeDispatcher();
    const summary = await fanoutOnJobPublished(
      { alerts: store, dispatch },
      matchingJob("job_3"),
    );
    assert(summary.matched === 0, "disabled alerts do not match");
    assert(dispatch.sent.length === 0, "no dispatch after disable");

    const on = await setMyAlertEnabled({ alerts: store }, "cand_A", true);
    assert(on.ok && on.data.enabled === true, "re-enable works");
    assert(
      on.data.skills.length === 1 && on.data.skills[0] === "React",
      "criteria preserved through disable/enable",
    );
    assert(on.data.location === "Bengaluru", "location preserved");
    assert(on.data.opportunityType === "FULL_TIME", "type preserved");

    const summary2 = await fanoutOnJobPublished(
      { alerts: store, dispatch },
      matchingJob("job_4"),
    );
    assert(summary2.sent === 1, "sends after re-enable");
  },
);

// --- Multi-candidate isolation ---

await suite(
  "many candidates: only matching enabled ones receive the alert",
  async () => {
    const store = inMemoryAlertStore();
    await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
    await upsertMyAlert(
      { alerts: store },
      "cand_B",
      {
        skills: ["Python"],
        role: null,
        location: "Mumbai",
        workMode: null,
        opportunityType: "PART_TIME",
      },
    );
    await upsertMyAlert(
      { alerts: store },
      "cand_C",
      {
        skills: ["React"],
        role: null,
        location: "Bengaluru",
        workMode: null,
        opportunityType: "FULL_TIME",
        enabled: false,
      },
    );

    const dispatch = fakeDispatcher();
    const summary = await fanoutOnJobPublished(
      { alerts: store, dispatch },
      matchingJob("job_5"),
    );
    assert(summary.sent === 1, `only A gets it (got ${summary.sent})`);
    assert(
      dispatch.sent[0]?.endsWith(":cand_A:job_5"),
      `wrong recipient: ${dispatch.sent[0]}`,
    );
  },
);

// --- Robustness ---

await suite("a single dispatch failure does not abort the loop", async () => {
  const store = inMemoryAlertStore();
  await upsertMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
  await upsertMyAlert({ alerts: store }, "cand_B", reactBengaluruFullTime());

  let calls = 0;
  const dispatch: DispatchFn = async (event) => {
    calls++;
    if (event.recipientUserId === "cand_A") {
      return { ok: false, message: "boom" };
    }
    return { ok: true, deduplicated: false };
  };

  const summary = await fanoutOnJobPublished(
    { alerts: store, dispatch },
    matchingJob("job_6"),
  );
  assert(calls === 2, "both recipients attempted");
  assert(summary.failed.length === 1 && summary.failed[0] === "cand_A", "A failed");
  assert(summary.sent === 1, "B delivered");
});

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
