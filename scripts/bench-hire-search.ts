/**
 * Graded hire-search benchmark (plan 107 §11). READ ONLY.
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/bench-hire-search.ts
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/bench-hire-search.ts --engine=legacy
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/bench-hire-search.ts --extract
 *
 * `--engine=107` (default) runs searchCandidates (stages 3→6).
 * `--engine=legacy` ranks the same loaded pool with rankCandidates +
 * pickSearchMatches — the pre-107 card picker — as a CURRENT proxy. The
 * rewrite already stripped recruiter hard-filters from scoreCandidate, so
 * this is a best-effort CURRENT, not the Step 0.5 snapshot.
 *
 * `--extract` also runs stage 1 (costs a model call per query). Required for
 * the search-understanding gate, which is measured per FIELD (role, skills,
 * location, seniority) rather than per query.
 *
 * `--gates` exits non-zero when a release gate fails, which is what makes this
 * a gate rather than a report. Run it in CI after any ranking or prompt change:
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx scripts/bench-hire-search.ts --extract --gates
 *
 * Gates that need human gold labels (Precision@5, NDCG@5) report "—" until
 * `grades[]` is filled in `docs/hire-benchmark/queries.json`. Those labels must
 * come from two independent people per query — a recruiter plus a hiring
 * manager — resolved into one label. The model's own output is never the truth
 * for its own benchmark.
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local", override: true });

import { searchCandidates } from "@/features/hire/search-candidates";
import {
  emptySearchSpec,
  emptyValue,
  jobFromSearchSpec,
} from "@/features/hire/reduce-spec";
import { rankCandidates, pickSearchMatches } from "@/features/hire/score-candidate";
import { loadTrack, mergeTrackLoads } from "@/features/hire/track-loaders";
import { enabledTracks } from "@/features/hire/track-registry";
import type { Criterion, CriterionKind, JobSpec, SearchSpec } from "@/lib/validations/hire";
import { orderCards } from "@/features/hire/card-order";
import type { ScoredCandidate } from "@/features/hire/types";

type Grade = "excellent" | "good" | "borderline" | "bad";
const GRADE_REL: Record<Grade, number> = {
  excellent: 3,
  good: 2,
  borderline: 1,
  bad: 0,
};

type ExpectedCriterion = {
  kind: CriterionKind;
  token?: string;
  title?: string;
  min?: number;
  level?: string;
  city?: string;
  workMode?: string;
  openToWork?: boolean;
  minMissions?: number;
  minCommitDays?: number;
  absolute?: boolean;
};

type QueryRow = {
  id: string;
  query: string;
  tags: string[];
  expectSearch: boolean;
  expectClarify?: boolean;
  expectOutOfScope?: boolean;
  expectPoolQuestion?: boolean;
  zeroOnCurrent?: boolean;
  expectedCriteria: ExpectedCriterion[];
  grades: { candidateRef: string; grade: Grade }[];
};

type FileShape = { version: number; queries: QueryRow[] };

function argFlag(name: string): boolean {
  return process.argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
}

function argVal(name: string): string | null {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3) || null;
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

function criterionFromExpected(e: ExpectedCriterion, idx: number): Criterion {
  return {
    id: `${e.kind}:${idx}`,
    kind: e.kind,
    label: e.token ?? e.title ?? e.level ?? e.city ?? e.workMode ?? e.kind,
    weight: e.absolute ? "must" : "must",
    absolute: Boolean(e.absolute),
    value: emptyValue({
      token: e.token ?? null,
      title: e.title ?? null,
      min: e.min ?? null,
      level: e.level ?? null,
      city: e.city ?? null,
      workMode: e.workMode ?? null,
      openToWork: e.openToWork ?? null,
      minMissions: e.minMissions ?? null,
      minCommitDays: e.minCommitDays ?? null,
    }),
  };
}

function specFor(row: QueryRow): SearchSpec {
  const spec = emptySearchSpec(row.query);
  spec.criteria = row.expectedCriteria.map(criterionFromExpected);
  return spec;
}

function precisionAt(ranked: string[], graded: Map<string, number>, k: number): number {
  const slice = ranked.slice(0, k);
  if (slice.length === 0) return 0;
  const hits = slice.filter((id) => (graded.get(id) ?? 0) >= 2).length;
  return hits / slice.length;
}

function dcg(rels: number[]): number {
  return rels.reduce((s, rel, i) => s + rel / Math.log2(i + 2), 0);
}

function ndcgAt(ranked: string[], graded: Map<string, number>, k: number): number {
  const rels = ranked.slice(0, k).map((id) => graded.get(id) ?? 0);
  const ideal = [...graded.values()].sort((a, b) => b - a).slice(0, k);
  const denom = dcg(ideal);
  if (denom === 0) return 0;
  return dcg(rels) / denom;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i]!;
}

async function run107(job: JobSpec): Promise<{
  primary: ScoredCandidate[];
  excluded: ScoredCandidate[];
  ms: number;
}> {
  const t0 = Date.now();
  const res = await searchCandidates(job, { limit: 20 });
  const ms = Date.now() - t0;
  if (!res.ok) return { primary: [], excluded: [], ms };
  return { primary: res.data.matches, excluded: res.data.nearMisses, ms };
}

async function runLegacy(job: JobSpec): Promise<{
  primary: ScoredCandidate[];
  excluded: ScoredCandidate[];
  ms: number;
}> {
  const t0 = Date.now();
  const loads = await Promise.all(
    enabledTracks().map((t) => loadTrack(t.slug, { minEvidenceDays: 0, limit: 600 })),
  );
  const merged = mergeTrackLoads(loads);
  const ranked = rankCandidates(merged.members, job, { limit: 20 });
  const primary = pickSearchMatches(ranked, job, { limit: 20, minResults: 0 });
  const shown = new Set(primary.map((p) => p.candidateRef));
  const excluded = ranked.filter((r) => !shown.has(r.candidateRef));
  return { primary, excluded, ms: Date.now() - t0 };
}

async function main() {
  const engine = (argVal("engine") ?? "107").toLowerCase();
  const doExtract = argFlag("extract");
  const tag = argVal("tag");
  const file = resolve("docs/hire-benchmark/queries.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as FileShape;
  const selected = data.queries.filter((q) => !tag || q.tags.includes(tag));
  const limit = Number(argVal("limit") ?? selected.length);

  console.log(
    `\nScout bench  engine=${engine}  queries=${Math.min(limit, selected.length)}${tag ? `  tag=${tag}` : ""}`,
  );
  if (engine !== "107" && engine !== "legacy") {
    console.error("engine must be 107 or legacy");
    process.exit(1);
  }

  const latencies: number[] = [];
  let gradedQueries = 0;
  let p5 = 0;
  let p10 = 0;
  let ndcg = 0;
  let falseExcl = 0;
  let falseExclDenom = 0;
  let unclear = 0;
  let verdicts = 0;
  let zeros = 0;
  let zeroOnCurrentNonZero = 0;
  let zeroOnCurrentTotal = 0;
  let extractOk = 0;
  let extractN = 0;

  // ── release gates ────────────────────────────────────────────────────────
  //
  // A benchmark that only prints numbers is a report. These are the conditions
  // a build must satisfy to ship, each counting the number of times it was
  // violated, and `--gates` turns a non-zero count into a non-zero exit.
  const gate = {
    /** A candidate proven NOT to meet an absolute location criterion, shown as a match. */
    locationViolations: 0,
    /** Same, for any absolute criterion. */
    hardRequirementViolations: 0,
    /** A displayed verdict with no evidence field behind it. */
    ungroundedClaims: 0,
    claimsChecked: 0,
    /** The screen's order disagreeing with the engine's. */
    orderMismatches: 0,
    /** Per-field extraction, for the 95% understanding gate. */
    extractFieldHit: 0,
    extractFieldTotal: 0,
  };
  let ndcg5 = 0;

  const runner = engine === "legacy" ? runLegacy : run107;

  for (const row of selected.slice(0, limit)) {
    if (row.expectOutOfScope || row.expectPoolQuestion) continue;
    if (row.expectedCriteria.length === 0 && !row.expectSearch) continue;

    const search = specFor(row);
    const job = jobFromSearchSpec(search, {});
    const out = await runner(job);
    latencies.push(out.ms);

    if (out.primary.length === 0) zeros += 1;
    if (row.zeroOnCurrent) {
      zeroOnCurrentTotal += 1;
      if (out.primary.length > 0) zeroOnCurrentNonZero += 1;
    }

    for (const m of [...out.primary, ...out.excluded]) {
      for (const v of m.verdicts ?? []) {
        verdicts += 1;
        if (v.verdict === "UNCLEAR") unclear += 1;
      }
    }

    const excellent = new Set(
      row.grades.filter((g) => g.grade === "excellent").map((g) => g.candidateRef),
    );
    if (excellent.size > 0) {
      falseExclDenom += excellent.size;
      for (const id of excellent) {
        if (out.excluded.some((e) => e.candidateRef === id)) falseExcl += 1;
      }
    }
    for (const e of out.excluded) {
      if ((e.verdicts ?? []).some((v) => v.verdict === "UNCLEAR") && !(e.verdicts ?? []).some((v) => v.verdict === "NOT_MET")) {
        falseExcl += 1;
        falseExclDenom += 1;
      }
    }

    // Gate: no proven non-match in the primary list.
    //
    // `excluded` is where a level-2 contradiction belongs. A NOT_MET on an
    // absolute criterion appearing in `primary` means a stated hard
    // requirement was silently ignored — the failure the whole location audit
    // was about.
    const absoluteIds = new Set(
      search.criteria.filter((c) => c.absolute && !c.demotedReason).map((c) => c.id),
    );
    for (const m of out.primary) {
      for (const v of m.verdicts ?? []) {
        if (v.verdict !== "NOT_MET" || !absoluteIds.has(v.criterionId)) continue;
        const crit = search.criteria.find((c) => c.id === v.criterionId);
        gate.hardRequirementViolations += 1;
        if (crit?.kind === "location") gate.locationViolations += 1;
        console.log(
          `  GATE hard-requirement ${row.id}: ${m.candidateRef} shown despite NOT_MET on "${crit?.label ?? v.criterionId}"`,
        );
      }
    }

    // Gate: every visible verdict traces to a stored field.
    for (const m of [...out.primary, ...out.excluded]) {
      for (const v of m.verdicts ?? []) {
        if (v.verdict === "UNCLEAR") continue;
        gate.claimsChecked += 1;
        const grounded =
          v.evidence.length > 0 &&
          v.evidence.every((e) => Boolean(e.field) && Boolean(e.value));
        if (!grounded) {
          gate.ungroundedClaims += 1;
          console.log(
            `  GATE grounding ${row.id}: ${m.candidateRef} ${v.criterionId} has no evidence field`,
          );
        }
      }
    }

    // Gate: the screen must reproduce the engine's order.
    //
    // `match-results.tsx` re-sorts what it is given. It used to sort on role
    // fit, which put weakly-evidenced results on top and discarded the
    // ranking. This replays the display comparator over the engine's own
    // output; any difference is the screen contradicting the engine.
    {
      const engineOrder = out.primary.map((m) => m.candidateRef);
      const screenOrder = orderCards(
        out.primary.map((m) => ({
          candidateRef: m.candidateRef,
          score: Math.round(m.match ?? m.score),
          rankKey: m.rankKey,
        })),
      ).map((c) => c.candidateRef);
      if (engineOrder.join(">") !== screenOrder.join(">")) {
        gate.orderMismatches += 1;
        console.log(
          `  GATE order ${row.id}: engine ${engineOrder.slice(0, 5).join(">")} vs screen ${screenOrder.slice(0, 5).join(">")}`,
        );
      }
    }

    if (row.grades.length > 0) {
      const graded = new Map(
        row.grades.map((g) => [g.candidateRef, GRADE_REL[g.grade]]),
      );
      const ranked = out.primary.map((m) => m.candidateRef);
      p5 += precisionAt(ranked, graded, 5);
      p10 += precisionAt(ranked, graded, 10);
      ndcg += ndcgAt(ranked, graded, 10);
      ndcg5 += ndcgAt(ranked, graded, 5);
      gradedQueries += 1;
    }

    if (doExtract) {
      extractN += 1;
      const { extractDelta } = await import("@/features/hire/intake");
      const extracted = await extractDelta({
        prior: emptySearchSpec(),
        userMessage: row.query,
        history: [],
      });
      if (extracted.ok) {
        extractOk += 1;
        const kinds = new Set(extracted.delta.addCriteria.map((a) => a.criterion.kind));
        const want = new Set(row.expectedCriteria.map((c) => c.kind));
        const hit = [...want].filter((k) => kinds.has(k)).length;
        // Per FIELD, not per query: the 95% understanding gate is about role,
        // skills, location and seniority individually. A query that gets three
        // of four right is 0.75, not a pass.
        gate.extractFieldTotal += want.size;
        gate.extractFieldHit += hit;
        if (want.size > 0 && hit < want.size) {
          console.log(
            `  extract miss ${row.id}: got [${[...kinds].join(",")}] want [${[...want].join(",")}]`,
          );
        }
      } else {
        console.log(`  extract fail ${row.id}: ${extracted.reason}`);
      }
    }

    const mark = out.primary.length === 0 ? "ZERO" : String(out.primary.length);
    console.log(
      `  ${row.id}  ${mark.padStart(4)} primary  ${String(out.excluded.length).padStart(3)} excl  ${out.ms}ms  ${row.query.slice(0, 60)}`,
    );
  }

  console.log("\n── totals ─────────────────────────────────────────");
  console.log(`engine                 ${engine}`);
  console.log(`zero-result queries    ${zeros}`);
  console.log(
    `zero-on-current recovered ${zeroOnCurrentNonZero}/${zeroOnCurrentTotal}`,
  );
  console.log(
    `unknown-data rate        ${verdicts ? (unclear / verdicts).toFixed(3) : "n/a"}  (${unclear}/${verdicts} UNCLEAR)`,
  );
  console.log(
    `false-exclusion rate     ${
      falseExclDenom ? (falseExcl / falseExclDenom).toFixed(3) : "n/a (no excellent grades yet)"
    }`,
  );
  if (gradedQueries > 0) {
    console.log(`Precision@5             ${(p5 / gradedQueries).toFixed(3)}`);
    console.log(`Precision@10            ${(p10 / gradedQueries).toFixed(3)}`);
    console.log(`NDCG@10                 ${(ndcg / gradedQueries).toFixed(3)}`);
  } else {
    console.log("Precision@5 / @10 / NDCG@10  n/a (fill grades[] against live refs)");
  }
  console.log(
    `latency p50 / p95        ${percentile(latencies, 50)}ms / ${percentile(latencies, 95)}ms`,
  );
  if (doExtract) {
    console.log(`extract calls ok        ${extractOk}/${extractN}`);
  }
  if (gradedQueries > 0) {
    console.log(`NDCG@5                  ${(ndcg5 / gradedQueries).toFixed(3)}`);
  }

  // ── release gates ────────────────────────────────────────────────────────
  const extractRate =
    gate.extractFieldTotal > 0 ? gate.extractFieldHit / gate.extractFieldTotal : null;
  const groundingRate =
    gate.claimsChecked > 0 ? 1 - gate.ungroundedClaims / gate.claimsChecked : null;

  type GateRow = { name: string; ok: boolean | null; detail: string };
  const rows: GateRow[] = [
    {
      name: "Location filtering",
      ok: gate.locationViolations === 0,
      detail: `${gate.locationViolations} known-location violation(s)`,
    },
    {
      name: "Hard requirements",
      ok: gate.hardRequirementViolations === 0,
      detail: `${gate.hardRequirementViolations} proven non-match(es) in primary`,
    },
    {
      name: "Evidence grounding",
      ok: groundingRate == null ? null : groundingRate >= 1,
      detail:
        groundingRate == null
          ? "no claims to check"
          : `${(groundingRate * 100).toFixed(1)}% of ${gate.claimsChecked} claims traced to a field`,
    },
    {
      name: "Order integrity",
      ok: gate.orderMismatches === 0,
      detail: `${gate.orderMismatches} query/queries where the screen re-sorts away from the engine`,
    },
    {
      name: "Search understanding",
      ok: extractRate == null ? null : extractRate >= 0.95,
      detail:
        extractRate == null
          ? "not measured (pass --extract)"
          : `${(extractRate * 100).toFixed(1)}% of ${gate.extractFieldTotal} fields extracted`,
    },
    {
      name: "Ranking (P@5)",
      ok: gradedQueries > 0 ? p5 / gradedQueries >= 0.6 : null,
      detail:
        gradedQueries > 0
          ? `${(p5 / gradedQueries).toFixed(3)}`
          : "not measured (no gold labels yet)",
    },
    {
      name: "Ranking (NDCG@5)",
      ok: gradedQueries > 0 ? ndcg5 / gradedQueries >= 0.7 : null,
      detail:
        gradedQueries > 0
          ? `${(ndcg5 / gradedQueries).toFixed(3)}`
          : "not measured (no gold labels yet)",
    },
  ];

  console.log("\n── release gates ──────────────────────────────────");
  for (const r of rows) {
    const mark = r.ok === null ? "—" : r.ok ? "PASS" : "FAIL";
    console.log(`  ${mark.padEnd(5)} ${r.name.padEnd(22)} ${r.detail}`);
  }
  const failedGates = rows.filter((r) => r.ok === false);
  const unmeasured = rows.filter((r) => r.ok === null);
  if (unmeasured.length > 0) {
    console.log(
      `\n  ${unmeasured.length} gate(s) unmeasured. Ranking gates need gold labels in`,
    );
    console.log("  docs/hire-benchmark/queries.json — two independent human");
    console.log("  labellers per query, never the model's own output.");
  }
  console.log("");

  // `--gates` makes this a gate rather than a report: CI fails the build.
  if (argFlag("gates") && failedGates.length > 0) {
    console.error(
      `${failedGates.length} release gate(s) failed: ${failedGates.map((r) => r.name).join(", ")}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
