/**
 * T-250 multi-alert service tests. Covers TC-C-009 / TC-C-010 / TC-C-011,
 * per-candidate dedup on fanout, and the alert-count cap.
 *   npx tsx src/features/job-alerts/service.test.ts
 */
import type { JobType, JobWorkMode } from "@prisma/client";
import type { JobAlertStore, UpsertInput } from "./prisma-store";
import { matches } from "./matcher";
import {
  createMyAlert,
  deleteMyAlert,
  fanoutOnJobPublished,
  getMyAlertById,
  listMyAlerts,
  setMyAlertEnabled,
  updateMyAlert,
  MAX_ALERTS_PER_CANDIDATE,
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
    async listByCandidate(userId) {
      const out: JobAlertRow[] = [];
      for (const r of rows.values()) {
        if (r.candidateUserId === userId) out.push(r);
      }
      return out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },
    async countByCandidate(userId) {
      let n = 0;
      for (const r of rows.values()) if (r.candidateUserId === userId) n++;
      return n;
    },
    async getById(id, userId) {
      const r = rows.get(id);
      if (!r || r.candidateUserId !== userId) return null;
      return r;
    },
    async create(userId, input: UpsertInput) {
      const now = new Date(Date.now() + ++seq);
      const row: JobAlertRow = {
        id: `alert_${seq}`,
        candidateUserId: userId,
        name: input.name,
        enabled: input.enabled ?? true,
        skills: input.skills,
        role: input.role,
        location: input.location,
        workMode: input.workMode,
        opportunityType: input.opportunityType,
        createdAt: now,
        updatedAt: now,
      };
      rows.set(row.id, row);
      return row;
    },
    async updateById(id, userId, input) {
      const existing = rows.get(id);
      if (!existing || existing.candidateUserId !== userId) return null;
      const updated: JobAlertRow = {
        ...existing,
        name: input.name,
        enabled: input.enabled ?? true,
        skills: input.skills,
        role: input.role,
        location: input.location,
        workMode: input.workMode,
        opportunityType: input.opportunityType,
        updatedAt: new Date(),
      };
      rows.set(id, updated);
      return updated;
    },
    async setEnabledById(id, userId, enabled) {
      const existing = rows.get(id);
      if (!existing || existing.candidateUserId !== userId) return null;
      const updated = { ...existing, enabled, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },
    async deleteById(id, userId) {
      const existing = rows.get(id);
      if (!existing || existing.candidateUserId !== userId) return false;
      rows.delete(id);
      return true;
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

function reactBengaluruFullTime(name = "React roles in Bengaluru"): UpsertInput {
  return {
    name,
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
  console.log("service.test.ts (multi-alert)");

  // --- CRUD ---

  await suite("createMyAlert creates a fresh alert with a name", async () => {
    const store = inMemoryAlertStore();
    const res = await createMyAlert(
      { alerts: store },
      "u1",
      reactBengaluruFullTime("my react alert"),
    );
    assert(res.ok, "create should succeed");
    assert(res.data.candidateUserId === "u1", "scoped to caller");
    assert(res.data.name === "my react alert", "name preserved");
    assert(res.data.enabled === true, "defaults enabled");
  });

  await suite("listMyAlerts returns only that candidate's rows", async () => {
    const store = inMemoryAlertStore();
    await createMyAlert({ alerts: store }, "u1", reactBengaluruFullTime("A"));
    await createMyAlert({ alerts: store }, "u1", reactBengaluruFullTime("B"));
    await createMyAlert({ alerts: store }, "u2", reactBengaluruFullTime("C"));
    const res = await listMyAlerts({ alerts: store }, "u1");
    assert(res.ok && res.data.length === 2, `expected 2, got ${res.ok && res.data.length}`);
    assert(res.data.every((r) => r.candidateUserId === "u1"), "isolation");
  });

  await suite(
    "createMyAlert refuses when the candidate is at the cap",
    async () => {
      const store = inMemoryAlertStore();
      for (let i = 0; i < MAX_ALERTS_PER_CANDIDATE; i++) {
        const r = await createMyAlert(
          { alerts: store },
          "u1",
          reactBengaluruFullTime(`slot ${i}`),
        );
        assert(r.ok, `create ${i} should succeed`);
      }
      const overflow = await createMyAlert(
        { alerts: store },
        "u1",
        reactBengaluruFullTime("overflow"),
      );
      assert(
        !overflow.ok && overflow.code === "LIMIT_REACHED",
        "expected LIMIT_REACHED",
      );
    },
  );

  await suite("updateMyAlert changes fields and preserves id", async () => {
    const store = inMemoryAlertStore();
    const c = await createMyAlert(
      { alerts: store },
      "u1",
      reactBengaluruFullTime(),
    );
    assert(c.ok, "create ok");
    const u = await updateMyAlert({ alerts: store }, "u1", c.data.id, {
      ...reactBengaluruFullTime("renamed"),
      location: "Pune",
    });
    assert(u.ok, "update ok");
    assert(u.data.id === c.data.id, "id preserved");
    assert(u.data.name === "renamed", "name updated");
    assert(u.data.location === "Pune", "location updated");
  });

  await suite("updateMyAlert on foreign id returns NOT_FOUND", async () => {
    const store = inMemoryAlertStore();
    const c = await createMyAlert(
      { alerts: store },
      "u1",
      reactBengaluruFullTime(),
    );
    assert(c.ok, "create ok");
    const foreign = await updateMyAlert({ alerts: store }, "u2", c.data.id, reactBengaluruFullTime("hacker"));
    assert(!foreign.ok && foreign.code === "NOT_FOUND", "no cross-user write");
  });

  await suite("getMyAlertById returns NOT_FOUND for foreign id", async () => {
    const store = inMemoryAlertStore();
    const c = await createMyAlert(
      { alerts: store },
      "u1",
      reactBengaluruFullTime(),
    );
    assert(c.ok, "create ok");
    const res = await getMyAlertById({ alerts: store }, "u2", c.data.id);
    assert(!res.ok && res.code === "NOT_FOUND", "no cross-user read");
  });

  await suite("deleteMyAlert removes the row and returns deleted:true", async () => {
    const store = inMemoryAlertStore();
    const c = await createMyAlert(
      { alerts: store },
      "u1",
      reactBengaluruFullTime(),
    );
    assert(c.ok, "create ok");
    const d = await deleteMyAlert({ alerts: store }, "u1", c.data.id);
    assert(d.ok && d.data.deleted === true, "reports deleted");
    const list = await listMyAlerts({ alerts: store }, "u1");
    assert(list.ok && list.data.length === 0, "gone from list");
  });

  await suite("deleteMyAlert on missing id reports deleted:false, no throw", async () => {
    const store = inMemoryAlertStore();
    const res = await deleteMyAlert({ alerts: store }, "u1", "does_not_exist");
    assert(res.ok && res.data.deleted === false, "expected deleted:false");
  });

  await suite(
    "setMyAlertEnabled returns NOT_FOUND for foreign or unknown id",
    async () => {
      const store = inMemoryAlertStore();
      const c = await createMyAlert(
        { alerts: store },
        "u1",
        reactBengaluruFullTime(),
      );
      assert(c.ok, "create ok");
      const foreign = await setMyAlertEnabled({ alerts: store }, "u2", c.data.id, false);
      assert(!foreign.ok && foreign.code === "NOT_FOUND", "no cross-user toggle");
    },
  );

  // --- Fanout: TC-C-009 ---

  await suite(
    "TC-C-009: matching candidate receives exactly one dispatch on publish",
    async () => {
      const store = inMemoryAlertStore();
      await createMyAlert(
        { alerts: store },
        "cand_A",
        reactBengaluruFullTime(),
      );
      const dispatch = fakeDispatcher();
      const summary = await fanoutOnJobPublished(
        { alerts: store, dispatch },
        matchingJob("job_1"),
      );
      assert(summary.matched === 1, `matched ${summary.matched}`);
      assert(summary.sent === 1, `sent ${summary.sent}`);
      assert(summary.deduplicated === 0, `dedup ${summary.deduplicated}`);
    },
  );

  // --- Fanout: TC-C-010 (nothing on re-publish) ---

  await suite(
    "TC-C-010: re-fanout for the same job dedupes to zero new sends",
    async () => {
      const store = inMemoryAlertStore();
      await createMyAlert(
        { alerts: store },
        "cand_A",
        reactBengaluruFullTime(),
      );
      const dispatch = fakeDispatcher();
      const job = matchingJob("job_1");
      const first = await fanoutOnJobPublished({ alerts: store, dispatch }, job);
      const second = await fanoutOnJobPublished({ alerts: store, dispatch }, job);
      assert(first.sent === 1 && second.sent === 0, "second sends nothing new");
      assert(second.deduplicated === 1, "second deduplicates");
      assert(dispatch.sent.length === 1, "one real send in total");
    },
  );

  // --- Fanout: TC-C-011 (non-matching + toggle off) ---

  await suite("TC-C-011a: non-matching candidate receives nothing", async () => {
    const store = inMemoryAlertStore();
    await createMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
    const dispatch = fakeDispatcher();
    const summary = await fanoutOnJobPublished(
      { alerts: store, dispatch },
      nonMatchingJob("job_2"),
    );
    assert(summary.matched === 0, "no match");
    assert(dispatch.sent.length === 0, "no dispatch");
  });

  await suite(
    "TC-C-011b: disabling an alert stops delivery; re-enable resumes",
    async () => {
      const store = inMemoryAlertStore();
      const c = await createMyAlert(
        { alerts: store },
        "cand_A",
        reactBengaluruFullTime(),
      );
      assert(c.ok, "create ok");
      await setMyAlertEnabled({ alerts: store }, "cand_A", c.data.id, false);

      const dispatch = fakeDispatcher();
      const summary = await fanoutOnJobPublished(
        { alerts: store, dispatch },
        matchingJob("job_3"),
      );
      assert(summary.matched === 0, "disabled alerts do not match");
      assert(dispatch.sent.length === 0, "no dispatch after disable");

      await setMyAlertEnabled({ alerts: store }, "cand_A", c.data.id, true);
      const summary2 = await fanoutOnJobPublished(
        { alerts: store, dispatch },
        matchingJob("job_4"),
      );
      assert(summary2.sent === 1, "sends after re-enable");
    },
  );

  // --- Multi-alert dedup on fanout ---

  await suite(
    "candidate with two matching alerts still gets one notification per job",
    async () => {
      const store = inMemoryAlertStore();
      await createMyAlert({ alerts: store }, "cand_A", {
        ...reactBengaluruFullTime("A1"),
      });
      await createMyAlert({ alerts: store }, "cand_A", {
        name: "A2",
        skills: ["typescript"],
        role: null,
        location: null,
        workMode: null,
        opportunityType: null,
      });
      const dispatch = fakeDispatcher();
      const summary = await fanoutOnJobPublished(
        { alerts: store, dispatch },
        matchingJob("job_5"),
      );
      assert(summary.matched === 1, `distinct candidates: ${summary.matched}`);
      assert(summary.sent === 1, "exactly one dispatch to the candidate");
      assert(dispatch.sent.length === 1, "single send end-to-end");
    },
  );

  // --- Multi-candidate isolation ---

  await suite(
    "many candidates: only matching enabled alerts fire, one per candidate",
    async () => {
      const store = inMemoryAlertStore();
      await createMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime());
      await createMyAlert({ alerts: store }, "cand_B", {
        name: "python",
        skills: ["Python"],
        role: null,
        location: "Mumbai",
        workMode: null,
        opportunityType: "PART_TIME",
      });
      const c = await createMyAlert({ alerts: store }, "cand_C", reactBengaluruFullTime("C"));
      assert(c.ok, "create ok");
      await setMyAlertEnabled({ alerts: store }, "cand_C", c.data.id, false);

      const dispatch = fakeDispatcher();
      const summary = await fanoutOnJobPublished(
        { alerts: store, dispatch },
        matchingJob("job_6"),
      );
      assert(summary.sent === 1, `only A gets it (got ${summary.sent})`);
      assert(
        dispatch.sent[0]?.endsWith(":cand_A:job_6"),
        `wrong recipient: ${dispatch.sent[0]}`,
      );
    },
  );

  // --- Robustness ---

  await suite("a single dispatch failure does not abort the loop", async () => {
    const store = inMemoryAlertStore();
    await createMyAlert({ alerts: store }, "cand_A", reactBengaluruFullTime("A"));
    await createMyAlert({ alerts: store }, "cand_B", reactBengaluruFullTime("B"));

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
      matchingJob("job_7"),
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
