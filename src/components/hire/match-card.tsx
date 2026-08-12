"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { candidatePublicId } from "@/features/hire/public-id";
import { buttonVariants } from "@/components/ui/button";
import { RequestIntroButton } from "@/components/hire/request-intro-button";
import { ShortlistButton } from "@/components/talent/shortlist-button";
import { cn } from "@/lib/utils";

export type MatchCardData = {
  programMemberId: string | null;
  /**
   * Deliberately no name and no employer. A recruiter who can identify a
   * candidate from this card has no reason to place a request, and the request
   * is how ABTalks stays in the loop — and how the candidate keeps a say in
   * being contacted at all.
   */
  jobRole: string;
  locationLabel?: string | null;
  score: number;
  tier: string;
  rationale: string | null;
  gaps: string[];
  availabilityUnknown: boolean;
  shortlisted?: boolean;
  /** Status of this recruiter's live engagement request, if any. */
  engagementStatus?: string | null;
  evidence: {
    skills?: string[];
    missionPoints?: number;
    cleanPassCount?: number;
    commitDayCount?: number;
    projectScores?: number[];
    yearsExperience?: number;
  };
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function MatchCard({
  match,
  onCartToggle,
}: {
  match: MatchCardData;
  onCartToggle?: (inCart: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const e = match.evidence ?? {};
  const publicId = match.programMemberId
    ? candidatePublicId(match.programMemberId)
    : "AB-????";

  return (
    <article className="rounded-xl border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold">
            {match.jobRole}
          </h3>
          <p className="text-sm text-muted-foreground">
            {[match.locationLabel, publicId].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">{match.score}</p>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {match.tier}
          </p>
        </div>
      </header>

      {/* Enough to decide whether to open it, and no more. */}
      <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {typeof e.yearsExperience === "number" && (
          <li className="rounded-full bg-muted px-2 py-0.5">
            {e.yearsExperience} yrs
          </li>
        )}
        {typeof e.missionPoints === "number" && (
          <li className="rounded-full bg-muted px-2 py-0.5">
            {e.missionPoints} mission pts
          </li>
        )}
        {(e.skills ?? []).slice(0, 4).map((s) => (
          <li key={s} className="rounded-full border px-2 py-0.5">
            {s}
          </li>
        ))}
        {(e.skills?.length ?? 0) > 4 && (
          <li className="px-1 py-0.5 text-muted-foreground">
            +{e.skills!.length - 4}
          </li>
        )}
      </ul>

      {match.availabilityUnknown && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Availability not shared — salary, notice and location are unconfirmed.
        </p>
      )}

      {/* Two actions, always both: put it in the cart, or look closer. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {match.programMemberId && (
          <ShortlistButton
            memberId={match.programMemberId}
            initialShortlisted={match.shortlisted ?? false}
            onToggle={onCartToggle}
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "gap-1.5",
          )}
        >
          {open ? "Hide details" : "View"}
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
        {match.programMemberId && (
          <RequestIntroButton
            programMemberId={match.programMemberId}
            existingStatus={match.engagementStatus ?? null}
            publicId={publicId}
          />
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t pt-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat label="AB score" value={`${match.score}/100`} />
            <Stat label="Tier" value={match.tier} />
            <Stat
              label="Experience"
              value={
                typeof e.yearsExperience === "number"
                  ? `${e.yearsExperience} yrs`
                  : "—"
              }
            />
            <Stat
              label="Missions"
              value={
                typeof e.missionPoints === "number"
                  ? `${e.missionPoints} pts`
                  : "—"
              }
            />
            <Stat
              label="First-attempt"
              value={
                typeof e.cleanPassCount === "number"
                  ? `${e.cleanPassCount} passes`
                  : "—"
              }
            />
            <Stat
              label="Commit days"
              value={
                typeof e.commitDayCount === "number"
                  ? String(e.commitDayCount)
                  : "—"
              }
            />
            <Stat
              label="Projects"
              value={
                e.projectScores?.length ? e.projectScores.join(" / ") : "None"
              }
            />
            <Stat label="Reference" value={publicId} />
          </dl>

          {(e.skills?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Skills on file
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {e.skills!.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border px-2 py-0.5 text-xs"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {match.rationale && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Why this ranking
              </p>
              <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                {match.rationale}
              </p>
            </div>
          )}

          {match.gaps.length > 0 && (
            <div>
              <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Gaps
              </p>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                {match.gaps.slice(0, 6).map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {match.programMemberId && (
            <Link
              href={`/talent/members/${match.programMemberId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5",
              )}
            >
              Full evidence profile
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
