import "server-only";

import { isKnownTrack } from "@/features/hire/track-registry";
import { fieldCoverage } from "@/features/hire/criteria";
import type { ScoreableMember } from "@/features/hire/types";
import {
  criterionSchema,
  searchSpecDeltaSchema,
  searchSpecFiltersSchema,
  searchSpecSchema,
  type Criterion,
  type CriterionKind,
  type CriterionValue,
  type JobSpec,
  type SearchSpec,
} from "@/lib/validations/hire";
import { EMPTY_VALUE } from "@/features/hire/criteria";
import { readPoolExtra } from "@/features/hire/pool-brief";

/**
 * Stage 2 — pure reducer. Delta + prior spec → SearchSpec.
 *
 * The invariant: the model may not change anything the recruiter did not say,
 * and every change carries the words that justify it. An operation whose
 * sourceText cannot be found (case/punctuation/whitespace aside) is dropped
 * and reported, never applied.
 */

export const COVERAGE_GATE = 0.5;

export type DroppedOp = {
  op: "add" | "update" | "remove" | "filters";
  sourceText: string;
  reason: string;
};

export type ReduceResult = {
  spec: SearchSpec;
  dropped: DroppedOp[];
  demoted: { id: string; reason: string }[];
};

export function emptySearchSpec(statedAs = ""): SearchSpec {
  return {
    statedAs,
    filters: { tracks: [], minEvidenceDays: null, resultLimit: null },
    criteria: [],
  };
}

export function emptyValue(patch?: Partial<CriterionValue>): CriterionValue {
  return { ...EMPTY_VALUE, ...patch };
}

/** Light normalization: case, punctuation, whitespace. No fuzzy matching. */
export function normalizeSpan(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function spanOccurs(sourceText: string, corpus: string): boolean {
  const needle = normalizeSpan(sourceText);
  if (!needle) return false;
  return normalizeSpan(corpus).includes(needle);
}

function slugKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "x";
}

function nextId(kind: CriterionKind, key: string, existing: Criterion[]): string {
  const base = `${kind}:${slugKey(key)}`;
  if (!existing.some((c) => c.id === base)) return base;
  let n = 2;
  while (existing.some((c) => c.id === `${base}:${n}`)) n += 1;
  return `${base}:${n}`;
}

function keyFor(c: Pick<Criterion, "kind" | "label" | "value">): string {
  return (
    c.value.token ||
    c.value.title ||
    c.value.level ||
    c.value.city ||
    c.value.workMode ||
    c.value.text ||
    (c.value.min != null ? String(c.value.min) : "") ||
    c.label
  );
}

export function searchableSpec(spec: SearchSpec): boolean {
  return (
    spec.criteria.length > 0 ||
    spec.filters.tracks.length > 0 ||
    spec.filters.minEvidenceDays != null
  );
}

function demoteReason(kind: CriterionKind, coverage: number): string {
  const pct = Math.round(coverage * 100);
  return `I can rank on this but not enforce it — we only hold it for ${pct}% of the pool.`;
}

export function applyCoverageGate(
  spec: SearchSpec,
  members: ScoreableMember[],
  gate = COVERAGE_GATE,
): { spec: SearchSpec; demoted: { id: string; reason: string }[] } {
  const coverage = fieldCoverage(members);
  const demoted: { id: string; reason: string }[] = [];
  const criteria = spec.criteria.map((c) => {
    if (!c.absolute) return c;
    if (c.kind === "evidence") return c;
    const share = coverage[c.kind] ?? 0;
    if (share >= gate) {
      if (!c.demotedReason) return c;
      const { demotedReason: _drop, ...rest } = c;
      void _drop;
      return rest;
    }
    const reason = demoteReason(c.kind, share);
    demoted.push({ id: c.id, reason });
    return { ...c, demotedReason: reason };
  });
  return { spec: { ...spec, criteria }, demoted };
}

function applyFiltersPatch(
  current: SearchSpec["filters"],
  patch: Partial<SearchSpec["filters"]>,
): SearchSpec["filters"] {
  const parsed = searchSpecFiltersSchema.partial().safeParse(patch);
  if (!parsed.success) return current;
  const next = { ...current };
  if (parsed.data.tracks) {
    next.tracks = parsed.data.tracks.filter((s) => isKnownTrack(s));
  }
  if (parsed.data.minEvidenceDays !== undefined) {
    next.minEvidenceDays = parsed.data.minEvidenceDays;
  }
  if (parsed.data.resultLimit !== undefined) {
    next.resultLimit = parsed.data.resultLimit;
  }
  return next;
}

export function reduceSpec(
  prior: SearchSpec,
  delta: unknown,
  recruiterWords: string,
  members?: ScoreableMember[],
): ReduceResult {
  const parsed = searchSpecDeltaSchema.safeParse(delta);
  if (!parsed.success) {
    return {
      spec: prior,
      dropped: [
        {
          op: "add",
          sourceText: "",
          reason: "invalid delta — prior spec kept",
        },
      ],
      demoted: [],
    };
  }

  const d = parsed.data;
  const dropped: DroppedOp[] = [];
  let criteria = [...prior.criteria];
  let filters = { ...prior.filters };

  for (const op of d.addCriteria) {
    if (!spanOccurs(op.sourceText, recruiterWords)) {
      dropped.push({
        op: "add",
        sourceText: op.sourceText,
        reason: "sourceText not found in the recruiter's words",
      });
      continue;
    }
    const draft = criterionSchema.omit({ id: true }).safeParse({
      ...op.criterion,
      value: { ...EMPTY_VALUE, ...op.criterion.value },
    });
    if (!draft.success) {
      dropped.push({
        op: "add",
        sourceText: op.sourceText,
        reason: "criterion failed schema",
      });
      continue;
    }
    const id = nextId(draft.data.kind, keyFor(draft.data), criteria);
    const incoming = { ...draft.data, id };
    const same = criteria.findIndex(
      (c) => c.kind === incoming.kind && keyFor(c) === keyFor(incoming),
    );
    if (same >= 0) {
      criteria[same] = { ...criteria[same]!, ...incoming, id: criteria[same]!.id };
    } else {
      criteria.push(incoming);
    }
  }

  for (const op of d.updateCriteria) {
    if (!spanOccurs(op.sourceText, recruiterWords)) {
      dropped.push({
        op: "update",
        sourceText: op.sourceText,
        reason: "sourceText not found in the recruiter's words",
      });
      continue;
    }
    const idx = criteria.findIndex((c) => c.id === op.id);
    if (idx < 0) {
      dropped.push({
        op: "update",
        sourceText: op.sourceText,
        reason: `no criterion ${op.id}`,
      });
      continue;
    }
    const cur = criteria[idx]!;
    criteria[idx] = {
      ...cur,
      ...op.patch,
      id: cur.id,
      value: { ...cur.value, ...(op.patch.value ?? {}) },
    };
  }

  for (const op of d.removeCriteria) {
    if (!spanOccurs(op.sourceText, recruiterWords)) {
      dropped.push({
        op: "remove",
        sourceText: op.sourceText,
        reason: "sourceText not found in the recruiter's words",
      });
      continue;
    }
    const before = criteria.length;
    criteria = criteria.filter((c) => c.id !== op.id);
    if (criteria.length === before) {
      dropped.push({
        op: "remove",
        sourceText: op.sourceText,
        reason: `no criterion ${op.id}`,
      });
    }
  }

  if (d.filtersPatch) {
    if (!spanOccurs(d.filtersPatch.sourceText, recruiterWords)) {
      dropped.push({
        op: "filters",
        sourceText: d.filtersPatch.sourceText,
        reason: "sourceText not found in the recruiter's words",
      });
    } else {
      filters = applyFiltersPatch(filters, d.filtersPatch.patch);
    }
  }

  let spec: SearchSpec = {
    statedAs: prior.statedAs,
    filters,
    criteria,
  };

  let demoted: { id: string; reason: string }[] = [];
  if (members) {
    const gated = applyCoverageGate(spec, members);
    spec = gated.spec;
    demoted = gated.demoted;
  }

  return { spec, dropped, demoted };
}

export function isLevel2(c: Criterion): boolean {
  return c.absolute && !c.demotedReason;
}

const TALENT_SENIORITY = ["INTERN", "JUNIOR", "MID", "SENIOR", "LEAD"] as const;

function mapSeniority(
  level: string | null,
): (typeof TALENT_SENIORITY)[number] | undefined {
  if (!level) return undefined;
  const u = level.toUpperCase().replace(/[^A-Z]/g, "");
  if (u === "VP" || u === "DIRECTOR" || u === "MANAGER") return "LEAD";
  return TALENT_SENIORITY.find((s) => s === u);
}

function mapWorkMode(
  mode: string | null,
): JobSpec["workMode"] {
  if (!mode) return undefined;
  const u = mode.toUpperCase().replace(/[^A-Z]/g, "");
  if (u === "ONSITE" || u === "HYBRID" || u === "REMOTE" || u === "FLEXIBLE") {
    return u;
  }
  return undefined;
}

/** Project a SearchSpec onto the stored JobSpec so the existing UI keeps working. */
export function jobFromSearchSpec(spec: SearchSpec, prior: JobSpec = {}): JobSpec {
  const extra = {
    ...((prior.extra ?? {}) as Record<string, unknown>),
    searchSpec: spec,
    poolSources: spec.filters.tracks,
    minEvidenceDays: spec.filters.minEvidenceDays,
    resultLimit: spec.filters.resultLimit,
  };
  const next: JobSpec = { ...prior, extra };
  const must: string[] = [];
  const nice: string[] = [];
  for (const c of spec.criteria) {
    switch (c.kind) {
      case "role":
        next.title = c.value.title ?? c.label;
        break;
      case "skill": {
        const token = c.value.token ?? c.label;
        if (c.weight === "must") must.push(token);
        else nice.push(token);
        break;
      }
      case "experience":
        next.minExperience = c.value.min;
        next.maxExperience = c.value.max;
        break;
      case "seniority":
        next.seniority = mapSeniority(c.value.level ?? c.label) ?? next.seniority;
        break;
      case "education":
        next.requiresDegree = true;
        break;
      case "location":
        next.locationCity = c.value.city ?? c.label;
        break;
      case "availability":
        next.workMode = mapWorkMode(c.value.workMode) ?? next.workMode;
        break;
      case "compensation":
        next.salaryMin = c.value.min ?? next.salaryMin;
        next.salaryMax = c.value.max ?? next.salaryMax;
        break;
      default:
        break;
    }
  }
  if (must.length) next.mustHaveStack = must;
  if (nice.length) next.niceToHaveStack = nice;
  return next;
}

function criterionFromJob(
  kind: CriterionKind,
  label: string,
  value: Partial<CriterionValue>,
  opts?: { weight?: "must" | "nice"; absolute?: boolean },
): Criterion {
  return {
    id: `${kind}:${slugKey(label)}`,
    kind,
    label,
    weight: opts?.weight ?? "must",
    absolute: opts?.absolute ?? false,
    value: emptyValue(value),
  };
}

/** Read SearchSpec out of a stored JobSpec, converting legacy rows. */
export function searchSpecFromJob(job: JobSpec, statedAs = ""): SearchSpec {
  const extra = (job.extra ?? {}) as Record<string, unknown>;
  const stored = extra.searchSpec;
  if (stored && typeof stored === "object") {
    const ok = searchSpecSchema.safeParse(stored);
    if (ok.success) {
      return {
        ...ok.data,
        statedAs: statedAs || ok.data.statedAs,
      };
    }
  }
  return searchSpecFromLegacyJob(job, statedAs);
}

export function searchSpecFromLegacyJob(job: JobSpec, statedAs = ""): SearchSpec {
  const extra = readPoolExtra(job);
  const criteria: Criterion[] = [];
  if (job.title?.trim()) {
    criteria.push(
      criterionFromJob("role", job.title, { title: job.title }),
    );
  }
  for (const token of job.mustHaveStack ?? []) {
    criteria.push(
      criterionFromJob("skill", token, { token }, { weight: "must" }),
    );
  }
  for (const token of job.niceToHaveStack ?? []) {
    criteria.push(
      criterionFromJob("skill", token, { token }, { weight: "nice" }),
    );
  }
  if (job.minExperience != null || job.maxExperience != null) {
    const evidenceOnly =
      job.minExperience === 0 && (job.maxExperience ?? 0) >= 50;
    if (!evidenceOnly) {
      criteria.push(
        criterionFromJob("experience", "experience", {
          min: job.minExperience ?? null,
          max: job.maxExperience ?? null,
        }),
      );
    }
  }
  if (job.seniority) {
    criteria.push(
      criterionFromJob("seniority", job.seniority, { level: job.seniority }),
    );
  }
  if (job.requiresDegree) {
    criteria.push(criterionFromJob("education", "degree", { text: "degree" }));
  }
  if (job.locationCity?.trim() && job.locationCity !== "Any") {
    criteria.push(
      criterionFromJob("location", job.locationCity, { city: job.locationCity }),
    );
  }
  if (job.workMode && job.workMode !== "FLEXIBLE") {
    criteria.push(
      criterionFromJob("availability", job.workMode, { workMode: job.workMode }),
    );
  }
  if (
    (job.salaryMin != null || job.salaryMax != null) &&
    !(job.salaryMin === 0 && job.salaryMax === 0)
  ) {
    criteria.push(
      criterionFromJob("compensation", "budget", {
        min: job.salaryMin ?? null,
        max: job.salaryMax ?? null,
      }),
    );
  }
  return {
    statedAs,
    filters: {
      tracks: extra.sources,
      minEvidenceDays: extra.minEvidenceDays,
      resultLimit: extra.resultLimit,
    },
    criteria,
  };
}

export const __test = { nextId, keyFor, slugKey, applyFiltersPatch };
