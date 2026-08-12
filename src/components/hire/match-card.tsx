import Link from "next/link";
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

export function MatchCard({ match }: { match: MatchCardData }) {
  const e = match.evidence ?? {};
  const publicId = match.programMemberId
    ? candidatePublicId(match.programMemberId)
    : "AB-????";
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold">{match.jobRole}</h3>
          <p className="text-sm text-muted-foreground">
            {[match.locationLabel, publicId].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {match.programMemberId ? (
            <ShortlistButton
              memberId={match.programMemberId}
              initialShortlisted={match.shortlisted ?? false}
            />
          ) : null}
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{match.score}</p>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {match.tier}
            </p>
          </div>
        </div>
      </header>

      {match.availabilityUnknown ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Availability not shared — confirm salary / notice / location at
          outreach.
        </p>
      ) : null}

      <ul className="flex flex-wrap gap-1.5 text-xs">
        {typeof e.missionPoints === "number" ? (
          <li className="rounded-full bg-muted px-2 py-0.5">
            Missions {e.missionPoints} pts
          </li>
        ) : null}
        {typeof e.cleanPassCount === "number" ? (
          <li className="rounded-full bg-muted px-2 py-0.5">
            {e.cleanPassCount} first-pass
          </li>
        ) : null}
        {typeof e.commitDayCount === "number" ? (
          <li className="rounded-full bg-muted px-2 py-0.5">
            {e.commitDayCount} commit days
          </li>
        ) : null}
        {e.projectScores?.length ? (
          <li className="rounded-full bg-muted px-2 py-0.5">
            Projects {e.projectScores.join("/")}
          </li>
        ) : null}
        {(e.skills ?? []).slice(0, 5).map((s) => (
          <li key={s} className="rounded-full border px-2 py-0.5">
            {s}
          </li>
        ))}
      </ul>

      {match.rationale ? (
        <p className="text-sm leading-relaxed text-foreground/90">
          {match.rationale}
        </p>
      ) : null}

      {match.gaps.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">Gaps</p>
          <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
            {match.gaps.slice(0, 5).map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {match.programMemberId ? (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/talent/members/${match.programMemberId}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            See the evidence
          </Link>
          <RequestIntroButton
            programMemberId={match.programMemberId}
            existingStatus={match.engagementStatus ?? null}
            publicId={publicId}
          />
        </div>
      ) : null}
    </article>
  );
}
