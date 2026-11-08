"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PipelineStage } from "@prisma/client";
import { dsButtonVariants } from "@/components/design/ds-button";
import { CLAY_CTA } from "@/components/jobs/job-ui";
import { cn } from "@/lib/utils";
import { PipelineCard } from "./pipeline-card";
import { STAGE_EMPTY_HINT, STAGE_LABEL, STAGE_ORDER } from "./stage-labels";

/**
 * The rail's colour ramp, dark to mid along the nine stages, so the sequence is
 * readable at a glance and not just nine identical arrows. Indexed by position
 * in `STAGE_ORDER`.
 *
 * The ramp used to run all the way out to near-white (#cddcde), which forced a
 * second ink colour for the pale half — and two inks on one row of chevrons
 * read as two different font weights rather than as one label set. The ramp now
 * stops at #3a747c, the lightest teal that still carries white text at 5.3:1, so
 * every step can share one ink (issue #551).
 */
const STAGE_FILL = [
  "#063f47",
  "#0d464e",
  "#134c54",
  "#1a535b",
  "#205a62",
  "#276068",
  "#2d676f",
  "#346d75",
  "#3a747c",
] as const;

/**
 * The selected step, lifted out of the ramp with the DS clay recipe — the same
 * `--clay-lift` → `--clay` gradient the recruiter CTAs use — so selection is a
 * change of material, not a 4px bar most fills swallowed. Paired with the inset
 * moulding and the bright underline in `hire-scout.css`.
 */
const STAGE_FILL_ACTIVE = "linear-gradient(155deg, #0a6b78 0%, #03535f 72%)";

/** Row shape as the server component sends it. Dates are ISO strings so the
 *  Server→Client props boundary carries only plain data. */
export type PipelineBoardRow = {
  itemId: string;
  candidateUserId: string | null;
  candidateLabel: string;
  stage: PipelineStage;
  addedAtIso: string;
  stageChangedAtIso: string;
};

export type PipelineBoardProps = {
  rows: PipelineBoardRow[];
  /** Workspace name for the page eyebrow, matching Recruiter Analytics. */
  companyName?: string;
};

/**
 * The hiring pipeline: a chevron rail of the nine stages, and one panel showing
 * the selected stage's candidates. Owns the local optimistic bucket state so a
 * move/remove reshuffles instantly and reverts if the server refuses.
 *
 * This replaced a nine-column kanban. Nine columns could not be made to work at
 * a realistic width — they needed ~2264px against the ~1570px the shell offers,
 * so the board was either clipped or squeezed — and an empty pipeline rendered
 * as nine grey boxes each repeating a variant of "no one here yet". The rail
 * fits at any width, states the sequence honestly, and gives one stage the
 * whole page to show its people in.
 */
export function PipelineBoard({ rows, companyName }: PipelineBoardProps) {
  const [items, setItems] = useState<PipelineBoardRow[]>(rows);
  const [error, setError] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const map: Record<PipelineStage, PipelineBoardRow[]> = {
      SOURCED: [],
      SHORTLISTED: [],
      CONTACTED: [],
      SCREENING: [],
      INTERVIEWING: [],
      OFFER: [],
      HIRED: [],
      REJECTED: [],
      WITHDRAWN: [],
    };
    for (const row of items) map[row.stage].push(row);
    return map;
  }, [items]);

  function handleMoved(itemId: string, next: PipelineStage) {
    setError(null);
    setItems((prev) =>
      prev.map((row) =>
        row.itemId === itemId
          ? {
              ...row,
              stage: next,
              stageChangedAtIso: new Date().toISOString(),
            }
          : row,
      ),
    );
  }

  function handleRemoved(itemId: string) {
    setError(null);
    setItems((prev) => prev.filter((row) => row.itemId !== itemId));
  }

  function handleError(message: string) {
    setError(message);
  }

  const total = items.length;

  // Open on the first stage that actually has someone in it, so a recruiter
  // whose pipeline starts at INTERVIEWING does not land on an empty SOURCED
  // and conclude the board is broken. Falls back to the first stage.
  const [selected, setSelected] = useState<PipelineStage>(() => {
    const seeded = STAGE_ORDER.find((s) => rows.some((r) => r.stage === s));
    return seeded ?? STAGE_ORDER[0]!;
  });

  const bucket = buckets[selected];

  return (
    <div className="flex flex-col gap-3">
      {/* Same eyebrow / title / description treatment as Recruiter Analytics.
          The two are sibling recruiter pages and were reading as different
          products: this had an 18px heading with no workspace line while
          Analytics had a 36px one. */}
      <header className="mb-8">
        {companyName && (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Company Workspace · {companyName}
          </p>
        )}
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-foreground">
          Hiring Pipeline
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {total === 0
            ? "No one in your pipeline yet. Add candidates from Scout or from a job's applicants."
            : `${total} candidate${total === 1 ? "" : "s"} across ${STAGE_ORDER.length} stages.`}
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}

      {/* The stage rail. Buttons, not links: choosing a stage filters the
          panel below and is not a navigation. */}
      <nav className="hire-pipe-rail" aria-label="Pipeline stages">
        {STAGE_ORDER.map((stage, i) => {
          const isCurrent = stage === selected;
          const n = buckets[stage].length;
          return (
            <button
              key={stage}
              type="button"
              data-stage={stage}
              aria-current={isCurrent ? "true" : undefined}
              onClick={() => setSelected(stage)}
              className="hire-pipe-step"
              style={{ background: isCurrent ? STAGE_FILL_ACTIVE : STAGE_FILL[i] }}
            >
              <span>{STAGE_LABEL[stage]}</span>
              {n > 0 && <span className="hire-pipe-step__n">{n}</span>}
              {isCurrent && <span className="hire-pipe-step__bar" aria-hidden="true" />}
            </button>
          );
        })}
      </nav>

      {/* One stage at a time, with the whole page width to show it in. */}
      <section className="hire-pipe-panel" aria-label={`${STAGE_LABEL[selected]} candidates`}>
        {bucket.length === 0 ? (
          /* Tighter than it was inside the card. With no surface holding it,
             a 14-unit pad left the text, the mark and the button floating far
             apart in open page — the spacing has to do the grouping the box
             used to do. */
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <EmptyIllustration />
            <p className="text-sm text-muted-foreground">{STAGE_EMPTY_HINT[selected]}</p>
            {/* Only the first stage is something the recruiter can act on from
                here — you cannot "add someone to Offer". The rest simply have
                nobody in them yet. */}
            {selected === STAGE_ORDER[0] && (
              <Link
                href="/hire"
                className={cn(dsButtonVariants({ size: "default" }), CLAY_CTA, "mt-1")}
              >
                Start a search
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {bucket.map((row) => (
              <PipelineCard
                key={row.itemId}
                itemId={row.itemId}
                candidateLabel={row.candidateLabel}
                candidateUserId={row.candidateUserId}
                stage={row.stage}
                addedAtIso={row.addedAtIso}
                stageChangedAtIso={row.stageChangedAtIso}
                onMoved={handleMoved}
                onRemoved={handleRemoved}
                onError={handleError}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Muted "nothing here" mark. Inline so the page ships no extra asset. */
function EmptyIllustration() {
  return (
    <svg
      width="92"
      height="92"
      viewBox="0 0 92 92"
      fill="none"
      aria-hidden="true"
      className="opacity-70"
    >
      <rect
        x="16.5"
        y="12.5"
        width="42"
        height="52"
        rx="4"
        stroke="#c7cdd1"
        strokeWidth="2"
        strokeDasharray="5 4"
      />
      <rect
        x="30.5"
        y="20.5"
        width="42"
        height="52"
        rx="4"
        fill="#fff"
        stroke="#9aa4aa"
        strokeWidth="2"
      />
      <path
        d="M44 36l14 14M58 36L44 50"
        stroke="#9aa4aa"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="40" cy="62" r="12" fill="#fff" stroke="#6b7a82" strokeWidth="2.5" />
      <path d="M49 71l7 7" stroke="#6b7a82" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="48" cy="84" rx="22" ry="3" fill="#e6eaec" />
    </svg>
  );
}
