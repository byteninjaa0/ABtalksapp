import type { ReactNode } from "react";
import Link from "next/link";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";
import { talentEmploymentTypeSchema, talentWorkModeSchema } from "@/lib/validations/hire";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  explainCandidate,
  runRecruiterSearchAudit,
  type AuditReport,
  type CheckRow,
} from "@/features/search-qa/audit";
import type { ExplainResult } from "@/features/search-qa/explain";
import { FILTERS, type AppliedFilter } from "@/features/search-qa/filter-registry";
import { openKnownIssues } from "@/features/search-qa/known-issues";
import type { QaFinding } from "@/features/search-qa/types";

export const metadata = { title: "Recruiter Search Health | Admin" };

// The lite health check loads the real search pool and streams every
// searchable candidate; give it the same ceiling as the other admin crons.
export const maxDuration = 60;

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const paramsSchema = z.object({
  run: z.enum(["lite"]).optional().catch(undefined),
  explain: z.preprocess(blankToUndefined, z.string().trim().regex(/^[a-z0-9]{10,40}$/i).optional()).catch(undefined),
  skills: z.preprocess(blankToUndefined, z.string().max(300).optional()).catch(undefined),
  city: z.preprocess(blankToUndefined, z.string().max(80).optional()).catch(undefined),
  workMode: z.preprocess(blankToUndefined, talentWorkModeSchema.optional()).catch(undefined),
  employment: z.preprocess(blankToUndefined, talentEmploymentTypeSchema.optional()).catch(undefined),
  openToWork: z.enum(["on"]).optional().catch(undefined),
  salaryMax: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(100_000_000).optional()).catch(undefined),
  notice: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(365).optional()).catch(undefined),
  tracks: z.preprocess(blankToUndefined, z.string().max(120).regex(/^[A-Z0-9_,\s-]+$/i).optional()).catch(undefined),
  minDays: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(60).optional()).catch(undefined),
});

type Params = z.infer<typeof paramsSchema>;

const STATUS_STYLE: Record<string, string> = {
  PASS: "bg-[#18D39B]/10 text-[#197E23]",
  WARN: "bg-[#F5A524]/10 text-[#9A6700]",
  XFAIL: "bg-[#F97316]/10 text-[#B45309]",
  FAIL: "bg-[#D92D20]/10 text-[#D92D20]",
  SKIPPED: "bg-[#E9E9E9] text-[#787878]",
  "N/A": "bg-[#E9E9E9] text-[#787878]",
  READY: "bg-[#18D39B]/10 text-[#197E23]",
  READY_WITH_WARNINGS: "bg-[#F5A524]/10 text-[#9A6700]",
  NOT_READY: "bg-[#D92D20]/10 text-[#D92D20]",
};

function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_STYLE[status] ?? STATUS_STYLE.SKIPPED)}>
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-[#E9E9E9] bg-white p-5", className)}>
      <h2 className="font-display text-base font-semibold text-[#353535]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "bad" | "warn" }) {
  return (
    <div className="rounded-lg border border-[#E9E9E9] p-3">
      <p className="text-xs text-[#787878]">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold text-[#353535]", tone === "bad" && "text-[#D92D20]", tone === "warn" && "text-[#9A6700]", tone === "good" && "text-[#197E23]")}>
        {value}
      </p>
    </div>
  );
}

function IdList({ ids, total }: { ids: string[]; total: number }) {
  if (ids.length === 0) return null;
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-[#03535F]">
        {total} candidate id{total === 1 ? "" : "s"}
      </summary>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ids.map((id) => (
          <li key={id} className="flex items-center gap-1 rounded border border-[#E9E9E9] px-2 py-1 font-mono">
            <Link href={`/admin/students/${id}`} className="hover:underline">{id}</Link>
            <Link href={`/admin/search-health?explain=${id}`} className="text-[#03535F] hover:underline">explain</Link>
          </li>
        ))}
        {total > ids.length ? <li className="px-2 py-1 text-[#787878]">+{total - ids.length} more (CLI)</li> : null}
      </ul>
    </details>
  );
}

function Checks({ rows }: { rows: CheckRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-[#787878]">Not run.</p>;
  return (
    <ul className="divide-y divide-[#E9E9E9]">
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-sm text-[#353535]">{r.label}</p>
            <p className="text-xs text-[#787878]">{r.detail}</p>
          </div>
          <Badge status={r.status} />
        </li>
      ))}
    </ul>
  );
}

function FindingRow({ f }: { f: QaFinding }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={f.severity === "CRITICAL" || f.severity === "ERROR" ? "FAIL" : "WARN"} label={f.severity} />
        <span className="font-mono text-xs text-[#353535]">{f.category}</span>
        {f.knownIssue ? <span className="font-mono text-xs text-[#B45309]">{f.knownIssue}</span> : null}
        {f.productDecision ? <span className="text-xs font-semibold text-[#9A6700]">PRODUCT DECISION</span> : null}
        <span className="text-xs text-[#787878]">{f.affected} affected</span>
      </div>
      <p className="mt-1 text-sm text-[#353535]">{f.message}</p>
      <IdList ids={f.userIds} total={f.affected} />
    </li>
  );
}

function summariseFindings(list: QaFinding[]): QaFinding[] {
  const best = new Map<string, QaFinding>();
  for (const f of list) {
    const key = `${f.category}|${String(f.detail?.cause ?? f.check)}|${f.knownIssue ?? ""}`;
    const cur = best.get(key);
    if (!cur || f.affected > cur.affected) best.set(key, f);
  }
  return [...best.values()].sort((a, b) => b.affected - a.affected);
}

function explainFilters(p: Params): AppliedFilter[] {
  const out: AppliedFilter[] = [];
  const skills = p.skills?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  if (skills.length) out.push({ id: "mustHaveStack", value: skills });
  if (p.city?.trim()) out.push({ id: "locationCity", value: p.city.trim() });
  if (p.workMode) out.push({ id: "workMode", value: p.workMode });
  if (p.employment) out.push({ id: "employmentType", value: p.employment });
  if (p.openToWork === "on") out.push({ id: "openToWork", value: true });
  if (p.salaryMax != null) out.push({ id: "salaryMax", value: p.salaryMax });
  if (p.notice != null) out.push({ id: "noticePeriodDays", value: p.notice });
  return out;
}

const INPUT = "h-10 rounded-lg border border-[#D2D2D2] bg-white px-3 text-sm";

export default async function SearchHealthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params: Params = paramsSchema.parse(await searchParams);

  let report: AuditReport | null = null;
  let error: string | null = null;
  if (params.run === "lite") {
    try {
      report = await runRecruiterSearchAudit({
        sections: ["coverage", "filters", "index", "pagination", "sort", "privacy"],
        lite: true,
        latencyRounds: 0,
      });
    } catch (e) {
      logger.error("[search-qa] admin health check failed", { error: String(e).slice(0, 240) });
      error = "The health check failed. Run npm run audit:recruiter-search for the full error.";
    }
  }

  let explained: ExplainResult | null = null;
  if (params.explain?.trim()) {
    try {
      explained = await explainCandidate({
        userId: params.explain.trim(),
        filters: explainFilters(params),
        tracks: params.tracks?.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean),
        minEvidenceDays: params.minDays ?? 0,
      });
    } catch (e) {
      logger.error("[search-qa] admin explain failed", { error: String(e).slice(0, 240) });
      error = "Could not explain that candidate.";
    }
  }

  const failing = report ? summariseFindings(report.findings.filter((f) => f.searchVerdict === "FAIL" && !f.productDecision && f.severity !== "INFO")) : [];
  const decisions = report ? summariseFindings(report.findings.filter((f) => f.productDecision)) : [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Recruiter Search Health"
        description="Does recruiter search return exactly the candidates it should? Coverage, filter correctness against the canonical profile, privacy, and search-document drift, with the candidate ids behind every number. Read-only."
        actions={
          <Link href="/admin/search-health?run=lite" className={cn(buttonVariants({ variant: "default" }), "h-10 px-5")}>
            {report ? "Re-run health check" : "Run health check"}
          </Link>
        }
      />

      {error ? (
        <p className="rounded-lg border border-[#D92D20]/30 bg-[#D92D20]/5 p-3 text-sm text-[#D92D20]">{error}</p>
      ) : null}

      {!report && !explained ? (
        <Card title="What this checks">
          <p className="text-sm leading-6 text-[#787878]">
            The health check loads the search pool through the same track loaders recruiters use, compares every searchable
            candidate against the canonical 078 profile, and classifies each disagreement as a search bug, a stale search
            document, a normalization gap, a ranking issue or bad candidate data. It takes up to a minute. The full audit,
            every combination, data quality across all profiles, normalization and latency, runs from the CLI:{" "}
            <code className="font-mono text-xs">npm run audit:recruiter-search</code>.
          </p>
        </Card>
      ) : null}

      {report ? (
        <>
          <section className="flex flex-wrap items-center gap-3 rounded-xl border border-[#E9E9E9] bg-white p-5">
            <Badge status={report.readiness.readiness} />
            <p className="text-sm text-[#787878]">
              Checked {new Date(report.generatedAt).toLocaleString("en-IN")} in {(report.durationMs / 1000).toFixed(1)}s ·
              ENABLE_NEW_TALENT={String(report.environment.flags.newTalentRead)} · tracks {report.environment.enabledTracks.join(", ")}
            </p>
            <ul className="w-full list-disc pl-5 text-xs text-[#787878]">
              {report.readiness.reasons.map((r) => <li key={r}>{r}</li>)}
              {report.environment.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </section>

          {report.coverage ? (
            <Card title="Search coverage">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Eligible candidates" value={report.coverage.eligible} />
                <Metric label="Indexed (loaded by search)" value={report.coverage.indexed} />
                <Metric label="Coverage" value={`${report.coverage.coveragePct}%`} tone={report.coverage.coveragePct === 100 ? "good" : "bad"} />
                <Metric label="Missing" value={report.coverage.missing.count} tone={report.coverage.missing.count ? "bad" : "good"} />
                <Metric label="Duplicates" value={report.coverage.duplicates.count} tone={report.coverage.duplicates.count ? "bad" : "good"} />
                <Metric label="Stale documents" value={report.coverage.stale.count} tone={report.coverage.stale.count ? "warn" : "good"} />
                <Metric label="Invalid indexed (leaks)" value={report.coverage.invalidIndexed.count} tone={report.coverage.invalidIndexed.count ? "bad" : "good"} />
                <Metric label="Hidden: profile, no visibility row" value={report.coverage.usableProfileNoVisibilityRow.count} tone={report.coverage.usableProfileNoVisibilityRow.count ? "warn" : "good"} />
              </div>
              <p className="mt-3 text-xs text-[#787878]">
                {report.coverage.perTrack.map((t) => `${t.slug}: ${t.uniqueLoaded}/${t.expected}${t.truncated ? " (TRUNCATED at cap)" : ""}`).join(" · ")}
              </p>
              <IdList ids={report.coverage.missing.userIds} total={report.coverage.missing.count} />
              <IdList ids={report.coverage.invalidIndexed.userIds} total={report.coverage.invalidIndexed.count} />
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Filter health">
              <ul className="divide-y divide-[#E9E9E9]">
                {report.filters.filter((f) => f.kind !== "NOT_IMPLEMENTED").map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-[#353535]">
                        {f.label} <span className="text-xs text-[#787878]">{f.kind.replace("_", " ").toLowerCase()}</span>
                      </p>
                      <p className="text-xs text-[#787878]">
                        {f.cases ? `${f.cases} case(s) · expected ${f.expected} · actual ${f.actual} · FP ${f.falsePositives} · FN ${f.falseNegatives}` : "ranking / paging only, tested separately"}
                        {f.knownIssues.length ? ` · ${f.knownIssues.join(", ")}` : ""}
                      </p>
                    </div>
                    <Badge status={f.status} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[#787878]">
                Not implemented by recruiter search: {FILTERS.filter((f) => f.kind === "NOT_IMPLEMENTED").map((f) => f.label).join(", ")}.
              </p>
            </Card>

            <Card title="Combination tests (lite)">
              <ul className="divide-y divide-[#E9E9E9]">
                {report.combinations.map((k) => (
                  <li key={k.kind} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[#353535]">{k.kind.toLowerCase().replace("_", " ")}</span>
                    <span className="text-xs text-[#787878]">
                      {k.pass + k.warn}/{k.total} passed · {k.xfail} known issue · {k.fail} failed
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[#787878]">Pairwise, covering-array and random combinations run in the CLI audit.</p>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Privacy and visibility"><Checks rows={report.checks.privacy} /></Card>
            <Card title="Pagination and sort"><Checks rows={[...report.checks.pagination, ...report.checks.sort]} /></Card>
          </div>

          {report.indexConsistency ? (
            <Card title="Search sync (documents vs canonical profile)">
              <p className="text-sm text-[#787878]">
                No sync jobs exist: search builds documents from live tables on every request, so there is no pending or failed
                queue. Drift below is what the document says that the canonical profile does not.
              </p>
              <ul className="mt-2 divide-y divide-[#E9E9E9]">
                {report.indexConsistency.byCause.map((b) => (
                  <li key={b.cause} className="py-2">
                    <p className="text-sm text-[#353535]">
                      <span className="font-mono text-xs">{b.category}</span> {b.cause} · {b.count}
                    </p>
                    <p className="text-xs text-[#787878]">{b.example}</p>
                    <IdList ids={b.userIds} total={b.count} />
                  </li>
                ))}
              </ul>
              {report.indexConsistency.persisted ? (
                <p className="mt-2 text-xs text-[#787878]">
                  Saved matches {report.indexConsistency.persisted.matches} · for now-unsearchable candidates{" "}
                  {report.indexConsistency.persisted.matchesForUnsearchable} (re-gated on read) · PROFILE matches with a CLAUDE ref{" "}
                  {report.indexConsistency.persisted.profileSourceMatches}
                </p>
              ) : null}
            </Card>
          ) : null}

          {report.dataQuality ? (
            <Card title="Data quality (searchable candidates, full scan in CLI)">
              <div className="grid grid-cols-3 gap-3">
                <Metric label="Healthy" value={report.dataQuality.healthy} tone="good" />
                <Metric label="With warnings" value={report.dataQuality.warnings} tone="warn" />
                <Metric label="Invalid" value={report.dataQuality.invalid} tone={report.dataQuality.invalid ? "bad" : "good"} />
              </div>
              <ul className="mt-3 divide-y divide-[#E9E9E9]">
                {report.dataQuality.rules.filter((r) => r.severity !== "INFO").map((r) => (
                  <li key={r.rule} className="py-2">
                    <p className="text-sm text-[#353535]">
                      <span className="font-mono text-xs">{r.rule}</span> · {r.count} · {r.example}
                    </p>
                    <IdList ids={r.userIds} total={r.count} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#787878]">Data findings never fail recruiter search: they explain results, they do not indict them.</p>
            </Card>
          ) : null}

          <Card title={`Failures that break recruiter search (${failing.length})`}>
            {failing.length ? <ul className="divide-y divide-[#E9E9E9]">{failing.map((f) => <FindingRow key={`${f.check}-${f.message}`} f={f} />)}</ul> : <p className="text-sm text-[#787878]">None.</p>}
          </Card>

          <Card title={`Product decisions required (${decisions.length})`}>
            {decisions.length ? <ul className="divide-y divide-[#E9E9E9]">{decisions.map((f) => <FindingRow key={`${f.check}-${f.message}`} f={f} />)}</ul> : <p className="text-sm text-[#787878]">None.</p>}
          </Card>
        </>
      ) : null}

      <Card title="Explain a candidate in a search">
        <form action="/admin/search-health" className="grid gap-2 md:grid-cols-4">
          <input name="explain" defaultValue={params.explain ?? ""} placeholder="Candidate user id" className={cn(INPUT, "md:col-span-2")} required />
          <input name="skills" defaultValue={params.skills ?? ""} placeholder="Required skills, comma-separated" className={cn(INPUT, "md:col-span-2")} />
          <input name="city" defaultValue={params.city ?? ""} placeholder="City" className={INPUT} />
          <select name="workMode" defaultValue={params.workMode ?? ""} className={INPUT}>
            <option value="">Any work mode</option>
            {["REMOTE", "HYBRID", "ONSITE", "FLEXIBLE"].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <select name="employment" defaultValue={params.employment ?? ""} className={INPUT}>
            <option value="">Any engagement</option>
            {["FULL_TIME", "INTERNSHIP", "PART_TIME", "CONTRACT", "FREELANCE"].map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <input name="tracks" defaultValue={params.tracks ?? ""} placeholder="Tracks e.g. PROFILE,HACKATHON" className={INPUT} />
          <input name="salaryMax" defaultValue={params.salaryMax ?? ""} placeholder="Budget ₹/yr" className={INPUT} inputMode="numeric" />
          <input name="notice" defaultValue={params.notice ?? ""} placeholder="Notice ≤ days" className={INPUT} inputMode="numeric" />
          <label className="flex items-center gap-2 text-sm text-[#353535]">
            <input type="checkbox" name="openToWork" defaultChecked={params.openToWork === "on"} /> Open to work only
          </label>
          <button type="submit" className={cn(buttonVariants({ variant: "default" }), "h-10")}>Explain</button>
        </form>

        {explained ? <ExplainView r={explained} /> : null}
      </Card>

      <Card title="Known recruiter-search issues">
        {openKnownIssues().length === 0 ? (
          <p className="text-sm text-[#787878]">
            None open. Every confirmed issue so far is fixed and asserted by an ordinary regression test.
          </p>
        ) : (
          <ul className="divide-y divide-[#E9E9E9]">
            {openKnownIssues().map((k) => (
              <li key={k.id} className="py-2">
                <p className="text-sm text-[#353535]">
                  <span className="font-mono text-xs text-[#B45309]">{k.id}</span> {k.title}{" "}
                  <span className="text-xs text-[#787878]">· {k.category} · {k.severity}</span>
                </p>
                <p className="text-xs text-[#787878]">{k.location} · {k.proposedFix}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ExplainView({ r }: { r: ExplainResult }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg bg-[#F7FBFB] p-3">
        <p className="text-sm font-semibold text-[#353535]">{r.summary}</p>
        <p className="mt-1 text-xs text-[#787878]">
          {r.publicId} · search: {r.search} · gate {r.gate.pass ? "passes" : `fails (${r.gate.reasons.join(", ")})`} · expected tracks{" "}
          {r.tracks.expected.join(", ") || "none"} · loaded as {r.document.loadedAs ?? "n/a"}
        </p>
      </div>

      {r.filters.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-[#787878]">
              <tr><th className="py-1 pr-3">Filter</th><th className="pr-3">Expected (canonical)</th><th className="pr-3">Search</th><th>Verdict</th></tr>
            </thead>
            <tbody className="divide-y divide-[#E9E9E9]">
              {r.filters.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 pr-3">{f.label}: <span className="font-mono text-xs">{f.value}</span></td>
                  <td className="pr-3 text-xs">{f.expected.ambiguous ? `ambiguous: ${f.expected.ambiguous}` : `${f.expected.pass ? "PASS" : "FAIL"}: ${f.expected.reason}`}</td>
                  <td className="pr-3 text-xs">{f.service ? `${f.service.pass ? "PASS" : "FAIL"}${f.service.reason ? `: ${f.service.reason}` : ""}` : "n/a"}</td>
                  <td className="text-xs">
                    <Badge status={f.verdict === "AGREE" ? "PASS" : f.verdict === "DISAGREE" ? "FAIL" : "SKIPPED"} label={f.verdict} />
                    {f.diagnosis ? <p className="mt-1 text-[#787878]">{f.diagnosis.category}{f.diagnosis.knownIssue ? ` ${f.diagnosis.knownIssue}` : ""}: {f.diagnosis.message}</p> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {r.ranking ? (
        <div className="overflow-x-auto">
          <p className="text-sm text-[#353535]">
            Score <strong>{r.ranking.score}</strong> · tier {r.ranking.tier} · rank {r.position.rank ?? "n/a"} of {r.position.rankedOf} ·{" "}
            {r.position.admitted ? `match #${r.position.admittedRank} of ${r.position.admittedOf}` : "not a match"} ·{" "}
            {r.position.onPage ? `on page at #${r.position.pageRank}` : `not on the ${r.position.pageSize}-card page`}
            {r.ranking.hardFilterReasons.length ? ` · excluded by ${r.ranking.hardFilterReasons.join("; ")}` : ""}
          </p>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-[#787878]"><tr><th className="py-1 pr-3">Ranking input</th><th className="pr-3">Value</th><th className="pr-3">Weight</th><th>Points</th></tr></thead>
            <tbody className="divide-y divide-[#E9E9E9]">
              {r.ranking.contributions.map((c) => (
                <tr key={c.dimension}>
                  <td className="py-1 pr-3">{c.dimension}</td>
                  <td className="pr-3">{c.value ?? "not produced by this track"}</td>
                  <td className="pr-3">{c.weight}</td>
                  <td>+{c.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-[#787878]">
            {r.ranking.hardFiltered ? "Hard-filtered candidates score 0; the points show what they would have scored. " : ""}
            {r.ranking.coverageNote}
          </p>
        </div>
      ) : null}

      {r.drift.length ? (
        <ul className="text-xs text-[#787878]">
          {r.drift.map((d) => <li key={`${d.field}-${d.cause}`}>Document drift · {d.category} {d.cause}: canonical {d.canonical} → document {d.document}</li>)}
        </ul>
      ) : null}
      {r.dataQuality.length ? (
        <ul className="text-xs text-[#787878]">
          {r.dataQuality.map((d) => <li key={`${d.rule}-${d.field}`}>Data · [{d.severity}] {d.rule}: {d.message}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
