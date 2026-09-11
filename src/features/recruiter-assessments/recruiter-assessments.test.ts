/**
 * Plan 121 recruiter assessment builder + plan 128 (T-244) publish / assign /
 * monitor + plan 131 builder "Create" acceptance tests.
 *   npm run test:recruiter-assessments
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignAssessment,
  createAssessment,
  createPublishAndAssign,
  listSendableCandidates,
  saveAssessmentDraft,
  getAssessment,
  getAssessmentMonitor,
  deleteAssessment,
  listAssessments,
  publishAssessment,
  type AssessmentListStoreRow,
  type AssessmentNotifier,
  type AssessmentRow,
  type AssessmentStore,
  type AssignableCandidate,
  type AssignmentRow,
  type ContentInput,
  type ResultCounts,
  type Scope,
} from "./service";

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

const SCOPE_A: Scope = {
  organizationId: "org_a",
  createdByUserId: "user_a",
};
const SCOPE_B: Scope = {
  organizationId: "org_b",
  createdByUserId: "user_b",
};

function validMcqDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "Backend screen",
    subheading: null,
    instructions: null,
    durationMinutes: 30,
    passMarkPercent: 70,
    shortlistRefs: ["AB-1001"],
    questions: [
      {
        type: "MULTIPLE_CHOICE" as const,
        title: "Which is a queue?",
        helpText: null,
        isRequired: true,
        points: 2,
        allowMultipleCorrect: false,
        options: [
          { body: "FIFO", isCorrect: true },
          { body: "LIFO", isCorrect: false },
        ],
      },
    ],
    ...overrides,
  };
}

type StoredAssignment = AssignmentRow & { assessmentId: string };

function inMemoryStore(): AssessmentStore & {
  rows: Map<string, AssessmentRow>;
  /** What listAssignableCandidates returns — the recruiter's Shortlist. */
  pool: AssignableCandidate[];
  /** Which recruiter ids the service asked for a Shortlist. */
  poolCalls: string[];
  assignments: Map<string, StoredAssignment>;
} {
  const rows = new Map<string, AssessmentRow>();
  const pool: AssignableCandidate[] = [];
  const poolCalls: string[] = [];
  const assignments = new Map<string, StoredAssignment>();
  let seq = 0;
  let qSeq = 0;
  let oSeq = 0;
  let aSeq = 0;

  function owns(row: AssessmentRow, scope: Scope) {
    return (
      row.organizationId === scope.organizationId &&
      row.createdByUserId === scope.createdByUserId
    );
  }

  function buildQuestions(
    assessmentId: string,
    questions: ContentInput["questions"],
  ) {
    return questions.map((q, i) => {
      const id = `q_${++qSeq}`;
      const base = {
        id,
        position: i,
        title: q.title,
        helpText: q.helpText ?? null,
        isRequired: q.isRequired,
        points: q.points,
        sectionId: null as string | null,
      };
      if (q.type === "MULTIPLE_CHOICE") {
        return {
          ...base,
          type: "MULTIPLE_CHOICE" as const,
          allowMultipleCorrect: q.allowMultipleCorrect,
          maxWords: null,
          uploadDestinationUrl: null,
          options: q.options.map((o, j) => ({
            id: `o_${++oSeq}`,
            position: j,
            body: o.body,
            isCorrect: o.isCorrect,
          })),
        };
      }
      if (q.type === "PARAGRAPH") {
        return {
          ...base,
          type: "PARAGRAPH" as const,
          allowMultipleCorrect: false,
          maxWords: q.maxWords,
          uploadDestinationUrl: null,
          options: [],
        };
      }
      return {
        ...base,
        type: "FILE_UPLOAD" as const,
        allowMultipleCorrect: false,
        maxWords: null,
        uploadDestinationUrl: q.uploadDestinationUrl,
        options: [],
      };
    });
  }

  return {
    rows,
    pool,
    poolCalls,
    assignments,
    async create(scope, input) {
      const id = `ra_${++seq}`;
      const now = new Date();
      rows.set(id, {
        id,
        organizationId: scope.organizationId,
        createdByUserId: scope.createdByUserId,
        title: input.title,
        subheading: input.subheading,
        instructions: input.instructions,
        status: "DRAFT",
        durationMinutes: input.durationMinutes,
        passMarkPercent: input.passMarkPercent,
        shortlistRefs: input.shortlistRefs,
        publishedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
        questions: buildQuestions(id, input.questions),
      });
      return { id };
    },
    async replaceContent(assessmentId, scope, input) {
      const row = rows.get(assessmentId);
      if (
        !row ||
        row.organizationId !== scope.organizationId ||
        row.createdByUserId !== scope.createdByUserId
      ) {
        throw new Error("not owned");
      }
      rows.set(assessmentId, {
        ...row,
        title: input.title,
        subheading: input.subheading,
        instructions: input.instructions,
        durationMinutes: input.durationMinutes,
        passMarkPercent: input.passMarkPercent,
        shortlistRefs: input.shortlistRefs,
        updatedAt: new Date(),
        questions: buildQuestions(assessmentId, input.questions),
      });
    },
    async findOwned(assessmentId, scope) {
      const row = rows.get(assessmentId);
      if (!row) return null;
      if (
        row.organizationId !== scope.organizationId ||
        row.createdByUserId !== scope.createdByUserId
      ) {
        return null;
      }
      return row;
    },
    async listOwned(scope): Promise<AssessmentListStoreRow[]> {
      return [...rows.values()]
        .filter(
          (r) =>
            r.organizationId === scope.organizationId &&
            r.createdByUserId === scope.createdByUserId,
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((r) => ({
          id: r.id,
          title: r.title,
          status: r.status,
          durationMinutes: r.durationMinutes,
          passMarkPercent: r.passMarkPercent,
          questionCount: r.questions.length,
          updatedAt: r.updatedAt,
        }));
    },
    async delete(assessmentId, scope) {
      const row = rows.get(assessmentId);
      if (
        !row ||
        row.organizationId !== scope.organizationId ||
        row.createdByUserId !== scope.createdByUserId
      ) {
        return false;
      }
      rows.delete(assessmentId);
      return true;
    },
    async publish(assessmentId, scope, at) {
      const row = rows.get(assessmentId);
      if (!row || !owns(row, scope) || row.status !== "DRAFT") return false;
      row.status = "PUBLISHED";
      row.publishedAt = at;
      return true;
    },
    async listAssignableCandidates(recruiterUserId) {
      poolCalls.push(recruiterUserId);
      return pool.map((c) => ({ ...c }));
    },
    async upsertAssignments(assessmentId, input) {
      const out: { id: string; candidateUserId: string; created: boolean }[] = [];
      for (const r of input) {
        const existing = [...assignments.values()].find(
          (a) =>
            a.assessmentId === assessmentId &&
            a.candidateUserId === r.candidateUserId,
        );
        if (existing) {
          out.push({ id: existing.id, candidateUserId: r.candidateUserId, created: false });
          continue;
        }
        const id = `asg_${++aSeq}`;
        assignments.set(id, {
          id,
          assessmentId,
          candidateUserId: r.candidateUserId,
          candidateRef: r.candidateRef,
          label: r.candidateRef,
          status: "ASSIGNED",
          assignedAt: new Date(),
          startedAt: null,
          submittedAt: null,
          scorePercent: null,
          passed: null,
        });
        out.push({ id, candidateUserId: r.candidateUserId, created: true });
      }
      return out;
    },
    async listAssignments(assessmentId, scope) {
      const row = rows.get(assessmentId);
      if (!row || !owns(row, scope)) return [];
      return [...assignments.values()]
        .filter((a) => a.assessmentId === assessmentId)
        .map((a) => ({
          id: a.id,
          candidateUserId: a.candidateUserId,
          candidateRef: a.candidateRef,
          label: a.label,
          status: a.status,
          assignedAt: a.assignedAt,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          scorePercent: a.scorePercent,
          passed: a.passed,
        }));
    },
    async countResults(scope, assessmentIds) {
      const out = new Map<string, ResultCounts>();
      for (const a of assignments.values()) {
        const row = rows.get(a.assessmentId);
        if (!row || !owns(row, scope) || !assessmentIds.includes(a.assessmentId)) {
          continue;
        }
        const c = out.get(a.assessmentId) ?? { students: 0, passed: 0, failed: 0 };
        c.students += 1;
        if (a.passed === true) c.passed += 1;
        if (a.passed === false) c.failed += 1;
        out.set(a.assessmentId, c);
      }
      return out;
    },
  };
}

/**
 * Records every send and emulates dispatch()'s dedupe: one delivery per
 * candidate per assessment, ever. A failed send delivers nothing, so the next
 * assign retries it — exactly the property the service relies on.
 */
function fakeNotifier(): AssessmentNotifier & {
  calls: { recipientUserId: string; assessmentId: string; assignmentId: string }[];
  delivered: Set<string>;
  failNextSends(n: number): void;
} {
  const calls: { recipientUserId: string; assessmentId: string; assignmentId: string }[] = [];
  const delivered = new Set<string>();
  let failNext = 0;
  return {
    calls,
    delivered,
    failNextSends(n) {
      failNext = n;
    },
    async assigned(input) {
      calls.push(input);
      if (failNext > 0) {
        failNext--;
        return { ok: false, deduplicated: false };
      }
      const key = `${input.recipientUserId}:${input.assessmentId}`;
      if (delivered.has(key)) return { ok: true, deduplicated: true };
      delivered.add(key);
      return { ok: true, deduplicated: false };
    },
  };
}

const POOL: AssignableCandidate[] = [
  { candidateRef: "PROGRAM:m1", candidateUserId: "cand_1", label: "Asha", jobRole: "Backend" },
  { candidateRef: "CLAUDE:cand_2", candidateUserId: "cand_2", label: "AB-2002", jobRole: "Data" },
  { candidateRef: "PROGRAM:m3", candidateUserId: "cand_3", label: "Ravi", jobRole: "Frontend" },
  { candidateRef: "HACKATHON:cand_4", candidateUserId: "cand_4", label: "AB-4004", jobRole: "ML" },
];
const FIRST_THREE = POOL.slice(0, 3).map((c) => c.candidateRef);

function paragraphOnlyDraft() {
  return validMcqDraft({
    questions: [
      {
        type: "PARAGRAPH" as const,
        title: "Explain CAP",
        helpText: null,
        isRequired: true,
        points: 5,
        maxWords: 250,
      },
      {
        type: "FILE_UPLOAD" as const,
        title: "Upload your design",
        helpText: null,
        isRequired: true,
        points: 5,
        uploadDestinationUrl: "https://drive.example.com/folder",
      },
    ],
  });
}

/** A PUBLISHED assessment owned by `scope`, with the fixture Shortlist loaded. */
async function publishedAssessment(
  store: ReturnType<typeof inMemoryStore>,
  scope: Scope = SCOPE_A,
): Promise<string> {
  store.pool.push(...POOL.filter((p) => !store.pool.some((q) => q.candidateRef === p.candidateRef)));
  const created = await createAssessment(store, scope, validMcqDraft());
  if (!created.ok) throw new Error("setup create failed");
  const pub = await publishAssessment(store, scope, created.data.id);
  if (!pub.ok) throw new Error(`setup publish failed: ${pub.message}`);
  return created.data.id;
}

/** The body of one function in a source file, from its start to `endMarker`. */
function sliceBody(src: string, startMarker: string, endMarker: RegExp): string {
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`marker not found: ${startMarker}`);
  const rest = src.slice(start + startMarker.length);
  const end = rest.search(endMarker);
  if (end < 0) throw new Error(`end marker not found after ${startMarker}`);
  return rest.slice(0, end);
}

function readSource(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

async function run() {
  console.log("\nPlan 121 recruiter assessments acceptance tests\n");

  await suite("create returns an id", async () => {
    const store = inMemoryStore();
    const res = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(res.ok, "create must succeed");
    if (!res.ok) return;
    assert(typeof res.data.id === "string" && res.data.id.length > 0, "id set");
    assert(store.rows.get(res.data.id)?.status === "DRAFT", "saved as DRAFT");
  });

  await suite("save replaces questions and renumbers positions from 0", async () => {
    const store = inMemoryStore();
    const created = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(created.ok, "setup create");
    if (!created.ok) return;

    const res = await saveAssessmentDraft(store, SCOPE_A, {
      ...validMcqDraft(),
      assessmentId: created.data.id,
      questions: [
        {
          type: "PARAGRAPH",
          title: "Explain CAP",
          helpText: null,
          isRequired: true,
          points: 5,
          maxWords: 250,
        },
        {
          type: "MULTIPLE_CHOICE",
          title: "Pick one",
          helpText: null,
          isRequired: true,
          points: 1,
          allowMultipleCorrect: false,
          options: [
            { body: "A", isCorrect: true },
            { body: "B", isCorrect: false },
            { body: "C", isCorrect: false },
          ],
        },
      ],
    });
    assert(res.ok, "save must succeed");
    if (!res.ok) return;
    const row = store.rows.get(created.data.id)!;
    assert(row.questions.length === 2, "two questions");
    assert(row.questions[0]?.position === 0, "first at 0");
    assert(row.questions[1]?.position === 1, "second at 1");
    assert(row.questions[0]?.type === "PARAGRAPH", "order replaced");
  });

  await suite(
    "foreign workspace id resolves to NOT_FOUND on read, save and delete",
    async () => {
      const store = inMemoryStore();
      const created = await createAssessment(store, SCOPE_A, validMcqDraft());
      assert(created.ok, "setup");
      if (!created.ok) return;
      const id = created.data.id;

      const got = await getAssessment(store, SCOPE_B, id);
      assert(!got.ok && got.code === "NOT_FOUND", "read NOT_FOUND");

      const saved = await saveAssessmentDraft(store, SCOPE_B, {
        ...validMcqDraft(),
        assessmentId: id,
      });
      assert(!saved.ok && saved.code === "NOT_FOUND", "save NOT_FOUND");

      const deleted = await deleteAssessment(store, SCOPE_B, id);
      assert(!deleted.ok && deleted.code === "NOT_FOUND", "delete NOT_FOUND");

      assert(store.rows.has(id), "row still owned by A");
      const listB = await listAssessments(store, SCOPE_B);
      assert(listB.ok && listB.data.length === 0, "B list empty");
    },
  );

  await suite("saving a PUBLISHED row is refused", async () => {
    const store = inMemoryStore();
    const created = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(created.ok, "setup");
    if (!created.ok) return;
    const row = store.rows.get(created.data.id)!;
    row.status = "PUBLISHED";

    const saved = await saveAssessmentDraft(store, SCOPE_A, {
      ...validMcqDraft(),
      assessmentId: created.data.id,
    });
    assert(!saved.ok, "must refuse");
    if (saved.ok) return;
    assert(saved.code === "CONFLICT", `expected CONFLICT, got ${saved.code}`);
    assert(
      saved.message.includes("published"),
      "message mentions published",
    );
  });

  await suite("MCQ with zero correct options is rejected", async () => {
    const store = inMemoryStore();
    const res = await createAssessment(
      store,
      SCOPE_A,
      validMcqDraft({
        questions: [
          {
            type: "MULTIPLE_CHOICE",
            title: "No correct",
            helpText: null,
            isRequired: true,
            points: 1,
            allowMultipleCorrect: false,
            options: [
              { body: "A", isCorrect: false },
              { body: "B", isCorrect: false },
            ],
          },
        ],
      }),
    );
    assert(!res.ok && res.code === "INVALID", "rejected as INVALID");
  });

  await suite(
    "single-correct MCQ with two correct options is rejected",
    async () => {
      const store = inMemoryStore();
      const res = await createAssessment(
        store,
        SCOPE_A,
        validMcqDraft({
          questions: [
            {
              type: "MULTIPLE_CHOICE",
              title: "Two correct",
              helpText: null,
              isRequired: true,
              points: 1,
              allowMultipleCorrect: false,
              options: [
                { body: "A", isCorrect: true },
                { body: "B", isCorrect: true },
              ],
            },
          ],
        }),
      );
      assert(!res.ok && res.code === "INVALID", "rejected as INVALID");
    },
  );

  await suite("paragraph question carrying options is rejected", async () => {
    const store = inMemoryStore();
    const res = await createAssessment(
      store,
      SCOPE_A,
      validMcqDraft({
        questions: [
          {
            type: "PARAGRAPH",
            title: "Write about queues",
            helpText: null,
            isRequired: true,
            points: 3,
            maxWords: 250,
            options: [
              { body: "should not be here", isCorrect: false },
              { body: "nor this", isCorrect: false },
            ],
          },
        ],
      }),
    );
    assert(!res.ok && res.code === "INVALID", "rejected as INVALID");
  });

  console.log("\nPlan 128 (T-244) publish, assign and monitor\n");

  await suite("1. publish moves DRAFT → PUBLISHED and sets publishedAt", async () => {
    const store = inMemoryStore();
    const created = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(created.ok, "setup");
    if (!created.ok) return;
    const res = await publishAssessment(store, SCOPE_A, created.data.id);
    assert(res.ok, "publish must succeed");
    if (!res.ok) return;
    assert(res.data.alreadyPublished === false, "first publish is not a repeat");
    const row = store.rows.get(created.data.id)!;
    assert(row.status === "PUBLISHED", "status PUBLISHED");
    assert(row.publishedAt instanceof Date, "publishedAt set");
  });

  await suite(
    "2. publishing twice returns alreadyPublished and keeps publishedAt",
    async () => {
      const store = inMemoryStore();
      const id = await publishedAssessment(store);
      const first = store.rows.get(id)!.publishedAt;
      assert(first instanceof Date, "setup publishedAt");
      const again = await publishAssessment(store, SCOPE_A, id);
      assert(again.ok && again.data.alreadyPublished === true, "second is a repeat");
      assert(
        store.rows.get(id)!.publishedAt?.getTime() === first.getTime(),
        "publishedAt unchanged",
      );
    },
  );

  await suite("3. publish of another workspace's id → NOT_FOUND", async () => {
    const store = inMemoryStore();
    const created = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(created.ok, "setup");
    if (!created.ok) return;
    const res = await publishAssessment(store, SCOPE_B, created.data.id);
    assert(!res.ok && res.code === "NOT_FOUND", "NOT_FOUND");
    assert(store.rows.get(created.data.id)!.status === "DRAFT", "still DRAFT");
  });

  await suite(
    "4. publish with only PARAGRAPH / FILE_UPLOAD questions → INVALID",
    async () => {
      const store = inMemoryStore();
      const created = await createAssessment(store, SCOPE_A, paragraphOnlyDraft());
      assert(created.ok, "setup");
      if (!created.ok) return;
      const res = await publishAssessment(store, SCOPE_A, created.data.id);
      assert(!res.ok && res.code === "INVALID", "INVALID");
      assert(store.rows.get(created.data.id)!.status === "DRAFT", "still DRAFT");
    },
  );

  await suite("5. saveAssessmentDraft after a real publish → CONFLICT", async () => {
    const store = inMemoryStore();
    const id = await publishedAssessment(store);
    const saved = await saveAssessmentDraft(store, SCOPE_A, {
      ...validMcqDraft(),
      assessmentId: id,
    });
    assert(!saved.ok && saved.code === "CONFLICT", "CONFLICT");
  });

  await suite("6. assign on a DRAFT → CONFLICT, nothing written", async () => {
    const store = inMemoryStore();
    store.pool.push(...POOL);
    const notifier = fakeNotifier();
    const created = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(created.ok, "setup");
    if (!created.ok) return;
    const res = await assignAssessment(store, notifier, SCOPE_A, {
      assessmentId: created.data.id,
      candidateRefs: FIRST_THREE,
    });
    assert(!res.ok && res.code === "CONFLICT", "CONFLICT");
    assert(store.assignments.size === 0, "no rows");
    assert(notifier.calls.length === 0, "no notifications");
  });

  await suite("7. assign of another workspace's id → NOT_FOUND", async () => {
    const store = inMemoryStore();
    const notifier = fakeNotifier();
    const id = await publishedAssessment(store, SCOPE_A);
    const res = await assignAssessment(store, notifier, SCOPE_B, {
      assessmentId: id,
      candidateRefs: FIRST_THREE,
    });
    assert(!res.ok && res.code === "NOT_FOUND", "NOT_FOUND");
    assert(store.assignments.size === 0, "no rows");
    assert(notifier.calls.length === 0, "no notifications");
  });

  await suite(
    "8. a ref not on the Shortlist → INVALID, zero rows, zero notifications",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const id = await publishedAssessment(store);
      const res = await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: ["PROGRAM:m1", "PROGRAM:ghost"],
      });
      assert(!res.ok && res.code === "INVALID", "INVALID");
      assert(store.assignments.size === 0, "all-or-nothing: no rows");
      assert(notifier.calls.length === 0, "no notifications");
    },
  );

  await suite("9. assign 3 → 3 rows, 3 notifications", async () => {
    const store = inMemoryStore();
    const notifier = fakeNotifier();
    const id = await publishedAssessment(store);
    const res = await assignAssessment(store, notifier, SCOPE_A, {
      assessmentId: id,
      candidateRefs: FIRST_THREE,
    });
    assert(res.ok, "assign must succeed");
    if (!res.ok) return;
    assert(res.data.assigned === 3, `assigned 3, got ${res.data.assigned}`);
    assert(res.data.alreadyAssigned === 0, "none already assigned");
    assert(res.data.notificationFailures === 0, "no failures");
    assert(store.assignments.size === 3, "3 rows");
    assert(notifier.delivered.size === 3, "3 notifications");
    const rowIds = new Set(store.assignments.keys());
    assert(
      notifier.calls.every((c) => c.assessmentId === id && rowIds.has(c.assignmentId)),
      "every send names this assessment and a real assignment",
    );
    assert(
      store.poolCalls.every((u) => u === SCOPE_A.createdByUserId),
      "resolved against the caller's own Shortlist",
    );
  });

  await suite(
    "10. assigning the same 3 again → no new rows, still 3 unique notifications",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const id = await publishedAssessment(store);
      await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: FIRST_THREE,
      });
      const res = await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: FIRST_THREE,
      });
      assert(res.ok, "second assign ok");
      if (!res.ok) return;
      assert(res.data.assigned === 0, "no new");
      assert(res.data.alreadyAssigned === 3, "3 already");
      assert(store.assignments.size === 3, "still 3 rows");
      assert(notifier.delivered.size === 3, "still 3 unique notifications");
      // Every row is re-sent (and deduped) — the loop must not skip existing
      // rows, or a failed first send could never be retried.
      assert(notifier.calls.length === 6, `expected 6 sends, got ${notifier.calls.length}`);
    },
  );

  await suite(
    "11. the same candidate twice in one call → one row, one notification",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const id = await publishedAssessment(store);
      const res = await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: ["PROGRAM:m1", "PROGRAM:m1"],
      });
      assert(res.ok && res.data.assigned === 1, "one assigned");
      assert(store.assignments.size === 1, "one row");
      assert(notifier.calls.length === 1, "one notification");
    },
  );

  await suite(
    "12. a failed first send is delivered by the next assign",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const id = await publishedAssessment(store);
      notifier.failNextSends(1);
      const first = await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: FIRST_THREE,
      });
      assert(first.ok, "first assign ok");
      if (!first.ok) return;
      assert(store.assignments.size === 3, "3 rows even though a send failed");
      assert(first.data.notificationFailures === 1, "1 failure reported");
      // Read into a local: asserting on notifier.delivered.size directly would
      // narrow that property to the literal 2 for the rest of the function.
      const deliveredFirst = notifier.delivered.size;
      assert(deliveredFirst === 2, "2 delivered");

      const retry = await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: FIRST_THREE,
      });
      assert(retry.ok && retry.data.notificationFailures === 0, "retry clean");
      assert(notifier.delivered.size === 3, "all 3 delivered, none twice");
    },
  );

  await suite("13. 26 refs → INVALID", async () => {
    const store = inMemoryStore();
    const notifier = fakeNotifier();
    const id = await publishedAssessment(store);
    const refs = Array.from({ length: 26 }, (_, i) => `PROGRAM:bulk${i}`);
    const res = await assignAssessment(store, notifier, SCOPE_A, {
      assessmentId: id,
      candidateRefs: refs,
    });
    assert(!res.ok && res.code === "INVALID", "INVALID");
    assert(store.assignments.size === 0, "no rows");
  });

  await suite("14. delete: PUBLISHED → CONFLICT, DRAFT → ok", async () => {
    const store = inMemoryStore();
    const published = await publishedAssessment(store);
    const refused = await deleteAssessment(store, SCOPE_A, published);
    assert(!refused.ok && refused.code === "CONFLICT", "PUBLISHED refused");
    assert(store.rows.has(published), "published row kept");

    const draft = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(draft.ok, "setup draft");
    if (!draft.ok) return;
    const removed = await deleteAssessment(store, SCOPE_A, draft.data.id);
    assert(removed.ok, "DRAFT deleted");
    assert(!store.rows.has(draft.data.id), "draft row gone");
  });

  await suite(
    "15. listAssessments: DRAFT results null; PUBLISHED counts students / passed / failed",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const draft = await createAssessment(store, SCOPE_A, validMcqDraft());
      assert(draft.ok, "setup draft");
      if (!draft.ok) return;
      const id = await publishedAssessment(store);
      await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: FIRST_THREE,
      });
      const [a, b] = [...store.assignments.values()];
      // What T-218 will write.
      Object.assign(a!, { status: "SUBMITTED", passed: true, scorePercent: 90 });
      Object.assign(b!, { status: "SUBMITTED", passed: false, scorePercent: 30 });

      const listed = await listAssessments(store, SCOPE_A);
      assert(listed.ok, "list ok");
      if (!listed.ok) return;
      const draftRow = listed.data.find((r) => r.id === draft.data.id);
      const pubRow = listed.data.find((r) => r.id === id);
      assert(draftRow?.results === null, "DRAFT results null");
      const r = pubRow?.results;
      assert(r, "PUBLISHED has results");
      assert(
        r.students === 3 && r.passed === 1 && r.failed === 1,
        `expected 3/1/1, got ${r.students}/${r.passed}/${r.failed}`,
      );
    },
  );

  await suite(
    "16. monitor: started from startedAt, completed from SUBMITTED, alreadyAssigned flags",
    async () => {
      const store = inMemoryStore();
      const notifier = fakeNotifier();
      const id = await publishedAssessment(store);
      store.pool.push({
        candidateRef: "PROGRAM:m5",
        candidateUserId: "cand_5",
        label: "Meera",
        jobRole: "QA",
      });
      await assignAssessment(store, notifier, SCOPE_A, {
        assessmentId: id,
        candidateRefs: POOL.map((c) => c.candidateRef),
      });
      const [a, b, c] = [...store.assignments.values()];
      const t = new Date();
      Object.assign(a!, { status: "STARTED", startedAt: t });
      Object.assign(b!, {
        status: "SUBMITTED",
        startedAt: t,
        submittedAt: t,
        scorePercent: 80,
        passed: true,
      });
      // Submitted straight from ASSIGNED: completed, but never "started".
      Object.assign(c!, {
        status: "SUBMITTED",
        submittedAt: t,
        scorePercent: 20,
        passed: false,
      });

      const res = await getAssessmentMonitor(store, SCOPE_A, id);
      assert(res.ok, "monitor ok");
      if (!res.ok) return;
      const s = res.data.summary;
      assert(s.assigned === 4, `assigned 4, got ${s.assigned}`);
      assert(s.started === 2, `started counts startedAt: 2, got ${s.started}`);
      assert(s.completed === 2, `completed counts SUBMITTED: 2, got ${s.completed}`);
      assert(s.passed === 1 && s.failed === 1, "1 passed, 1 failed");
      assert(res.data.candidates.length === 5, "whole Shortlist listed");
      const flags = new Map(res.data.candidates.map((x) => [x.candidateRef, x.alreadyAssigned]));
      assert(flags.get("PROGRAM:m5") === false, "unassigned candidate selectable");
      assert(
        POOL.every((p) => flags.get(p.candidateRef) === true),
        "assigned candidates flagged",
      );

      const draft = await createAssessment(store, SCOPE_A, validMcqDraft());
      assert(draft.ok, "setup draft");
      if (!draft.ok) return;
      const draftMonitor = await getAssessmentMonitor(store, SCOPE_A, draft.data.id);
      assert(
        draftMonitor.ok && draftMonitor.data.candidates.length === 0,
        "DRAFT offers no candidates",
      );
    },
  );

  await suite("17. monitor of another workspace's id → NOT_FOUND", async () => {
    const store = inMemoryStore();
    const id = await publishedAssessment(store, SCOPE_A);
    const res = await getAssessmentMonitor(store, SCOPE_B, id);
    assert(!res.ok && res.code === "NOT_FOUND", "NOT_FOUND");
  });

  await suite(
    "18. the notifier dedupes per assessment and sends fixed copy only",
    () => {
      const src = readSource("src/app/actions/recruiter-assessment-actions.ts");
      const body = sliceBody(src, "function assessmentNotifier()", /\n(export )?(async )?function /);
      assert(body.includes('eventType: "assessment.assigned"'), "eventType assessment.assigned");
      assert(body.includes("primaryEntityId: assessmentId"), "primaryEntityId is the assessment id");
      const title = body.match(/title:\s*"([^"]*)"/);
      const text = body.match(/body:\s*"([^"]*)"/);
      assert(title, "title is a plain string literal");
      assert(text, "body is a plain string literal");
      assert(
        !title[1]!.includes("${") && !text[1]!.includes("${"),
        "no interpolation in notification copy",
      );
    },
  );

  await suite(
    "19. assignment never reads the frozen shortlistRefs",
    () => {
      const service = sliceBody(
        readSource("src/features/recruiter-assessments/service.ts"),
        "export async function assignAssessment(",
        /\nexport /,
      );
      const store = sliceBody(
        readSource("src/features/recruiter-assessments/prisma-store.ts"),
        "async listAssignableCandidates(",
        /\n {4}async /,
      );
      assert(service.length > 200, "assignAssessment body found");
      assert(store.length > 200, "listAssignableCandidates body found");
      assert(!service.includes("shortlistRefs"), "assignAssessment must not read shortlistRefs");
      assert(!store.includes("shortlistRefs"), "listAssignableCandidates must not read shortlistRefs");
    },
  );

  console.log("\nPlan 131 builder Create — save, publish and send in one step\n");

  /** A store with the fixture Shortlist loaded, and nothing else. */
  function storeWithPool() {
    const store = inMemoryStore();
    store.pool.push(...POOL);
    return store;
  }

  await suite("C1. Create sends a new assessment to the picked candidates", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const res = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: validMcqDraft(),
      candidateRefs: FIRST_THREE,
    });
    assert(res.ok, `create must succeed${res.ok ? "" : `: ${res.message}`}`);
    if (!res.ok) return;
    assert(store.rows.size === 1, "one assessment");
    assert(store.rows.get(res.data.id)?.status === "PUBLISHED", "published");
    assert(res.data.assigned === 3 && res.data.alreadyAssigned === 0, "3 assigned");
    assert(res.data.assignError === null, "no assign error");
    assert(store.assignments.size === 3, "3 assignment rows");
    assert(notifier.delivered.size === 3, "3 candidates notified once each");
  });

  await suite("C2. Create on an existing draft updates it — no duplicate", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const draft = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(draft.ok, "setup draft");
    if (!draft.ok) return;
    const res = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: { ...validMcqDraft({ title: "Renamed screen" }), assessmentId: draft.data.id },
      candidateRefs: [FIRST_THREE[0]],
    });
    assert(res.ok && res.data.id === draft.data.id, "same id");
    assert(store.rows.size === 1, "still one assessment");
    const row = store.rows.get(draft.data.id)!;
    assert(row.title === "Renamed screen", "draft content saved");
    assert(row.status === "PUBLISHED", "published");
  });

  await suite(
    "C3. publish failure keeps the draft id, assigns nobody, and the retry reuses it",
    async () => {
      const store = storeWithPool();
      const notifier = fakeNotifier();
      const refused = await createPublishAndAssign(store, notifier, SCOPE_A, {
        draft: paragraphOnlyDraft(),
        candidateRefs: FIRST_THREE,
      });
      assert(!refused.ok && refused.code === "INVALID", "publish refused");
      if (refused.ok) return;
      assert(refused.assessmentId !== null, "the saved draft's id comes back");
      const id = refused.assessmentId!;
      assert(store.rows.get(id)?.status === "DRAFT", "still a draft");
      assert(store.assignments.size === 0 && notifier.calls.length === 0, "nobody assigned or notified");

      const retry = await createPublishAndAssign(store, notifier, SCOPE_A, {
        draft: { ...validMcqDraft(), assessmentId: id },
        candidateRefs: FIRST_THREE,
      });
      assert(retry.ok && retry.data.id === id, "retry updates the same draft");
      assert(store.rows.size === 1, "no duplicate draft");
    },
  );

  await suite(
    "C4. an assign failure after publishing is reported, not hidden",
    async () => {
      const store = storeWithPool();
      const notifier = fakeNotifier();
      // The Shortlist changes between the pre-check and the assign.
      const listPool = store.listAssignableCandidates;
      let calls = 0;
      store.listAssignableCandidates = async (id) => {
        calls++;
        const pool = await listPool(id);
        return calls === 1 ? pool : pool.slice(1);
      };
      const res = await createPublishAndAssign(store, notifier, SCOPE_A, {
        draft: validMcqDraft(),
        candidateRefs: FIRST_THREE,
      });
      assert(res.ok, "the assessment is live");
      if (!res.ok) return;
      assert(res.data.assignError !== null, "assignError says it was not sent");
      assert(store.rows.get(res.data.id)?.status === "PUBLISHED", "published");
      assert(store.assignments.size === 0 && notifier.calls.length === 0, "nobody assigned");
    },
  );

  await suite("C5. another workspace's draft id → NOT_FOUND, nothing published", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const draftA = await createAssessment(store, SCOPE_A, validMcqDraft());
    assert(draftA.ok, "setup");
    if (!draftA.ok) return;
    const res = await createPublishAndAssign(store, notifier, SCOPE_B, {
      draft: { ...validMcqDraft(), assessmentId: draftA.data.id },
      candidateRefs: FIRST_THREE,
    });
    assert(!res.ok && res.code === "NOT_FOUND", "NOT_FOUND");
    if (!res.ok) assert(res.assessmentId === null, "no id leaked back");
    assert(store.rows.get(draftA.data.id)?.status === "DRAFT", "A's draft untouched");
    assert(store.assignments.size === 0 && notifier.calls.length === 0, "nothing sent");
  });

  await suite("C6. zero or 26 candidates → INVALID, nothing saved", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const none = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: validMcqDraft(),
      candidateRefs: [],
    });
    const many = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: validMcqDraft(),
      candidateRefs: Array.from({ length: 26 }, (_, i) => `PROGRAM:bulk${i}`),
    });
    assert(!none.ok && none.code === "INVALID", "zero refused");
    assert(!many.ok && many.code === "INVALID", "26 refused");
    assert(store.rows.size === 0, "no draft saved");
  });

  await suite("C7. a candidate no longer on the Shortlist → INVALID, nothing saved", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const res = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: validMcqDraft(),
      candidateRefs: ["PROGRAM:m1", "PROGRAM:ghost"],
    });
    assert(!res.ok && res.code === "INVALID", "refused");
    assert(store.rows.size === 0, "no draft saved, nothing published");
    assert(notifier.calls.length === 0, "nobody notified");
  });

  await suite("C8. an already-published id cannot be re-created → CONFLICT", async () => {
    const store = storeWithPool();
    const notifier = fakeNotifier();
    const id = await publishedAssessment(store);
    const res = await createPublishAndAssign(store, notifier, SCOPE_A, {
      draft: { ...validMcqDraft(), assessmentId: id },
      candidateRefs: FIRST_THREE,
    });
    assert(!res.ok && res.code === "CONFLICT", "CONFLICT");
    assert(store.assignments.size === 0, "nothing assigned");
  });

  await suite("C9. the builder's candidate list carries no user id", async () => {
    const store = storeWithPool();
    const list = await listSendableCandidates(store, SCOPE_A.createdByUserId);
    assert(list.length === POOL.length, "the whole Shortlist");
    assert(!JSON.stringify(list).includes("candidateUserId"), "no user id sent to the client");
  });

  await suite("C10. Create is gated and the builder page sends refs only", () => {
    const actions = readSource("src/app/actions/recruiter-assessment-actions.ts");
    // The last function in the file: its body runs to the end.
    const start = actions.indexOf(
      "export async function createAndSendRecruiterAssessmentAction(",
    );
    assert(start >= 0, "the Create action exists");
    const body = actions.slice(start);
    assert(body.includes("requireRecruiterWorkspace()"), "Create calls the workspace gate");
    assert(body.includes("assessmentNotifier()"), "Create uses the existing notifier");
    const page = readSource("src/app/hire/create-test/page.tsx");
    assert(page.includes("listSendableCandidates"), "the page reads the live Shortlist");
    assert(!page.includes("candidateUserId"), "no user id reaches the builder");
  });

  await suite(
    "20. the Assessments nav stays current on the monitor route",
    () => {
      const chrome = readSource("src/components/hire/hire-chrome.tsx");
      // The monitor is /hire/assessments/<id>. Strict equality on the nav link
      // dropped the highlight the moment a recruiter opened an assessment.
      const navBlock = chrome.slice(chrome.indexOf('href="/hire/assessments"'));
      assert(
        navBlock.includes('pathname.startsWith("/hire/assessments")'),
        "the Assessments nav link must match with startsWith, not ===",
      );
      assert(
        !navBlock.slice(0, 600).includes('pathname === "/hire/assessments"'),
        "no strict-equality pathname check may remain on the nav link",
      );
      // The desk deny-list is a different question - the single /hire/<id>
      // segment - and must keep its !== form.
      assert(
        chrome.includes('pathname !== "/hire/assessments"'),
        "the desk deny-list must keep its !== check",
      );
    },
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
