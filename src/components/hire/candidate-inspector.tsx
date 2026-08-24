"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { refPublicId, type CandidateSource } from "@/features/hire/candidate-ref";
import { COMPENSATION_DISCLAIMER } from "@/features/hire/compensation";
import { RequestIntroButton } from "@/components/hire/request-intro-button";
import { DeskShortlistButton } from "@/components/hire/desk-shortlist-button";
import {
  evidenceResumeHref,
  rememberEvidence,
} from "@/components/hire/evidence-cache";
import { ShortlistButton } from "@/components/talent/shortlist-button";
import type { MatchCardData } from "@/components/hire/match-card";
import { cn } from "@/lib/utils";

function trackLabel(source?: CandidateSource): string | null {
  switch (source) {
    case "CLAUDE":
      return "Claude challenge";
    case "CHALLENGE_60":
      return "60-day challenge";
    case "HACKATHON":
      return "Hackathon";
    case "PROGRAM":
      return "US cohort";
    default:
      return null;
  }
}

export function CandidateInspector({
  match,
  onClose,
  onCartToggle,
}: {
  match: MatchCardData;
  onClose: () => void;
  onCartToggle?: (inCart: boolean) => void;
}) {
  const e = match.evidence ?? {};
  const publicId = refPublicId(match.candidateRef);
  const sample = match.candidateRef.startsWith("SAMPLE:");
  const track = trackLabel(match.source);
  const isChallenge = match.source === "CLAUDE" || match.source === "CHALLENGE_60";
  const workLabel = isChallenge ? "Days shipped" : "Missions";
  const totalDays = e.totalTrackDays;

  useEffect(() => {
    rememberEvidence([match]);
  }, [match]);

  return (
    <aside className="hire-detail" aria-label="Candidate details">
      <div className="hire-detail__scroll">
        <button type="button" className="hire-back" onClick={onClose}>
          <ChevronLeft aria-hidden="true" />
          Back
        </button>

        <div className="hire-detail__top">
          <div>
            <h3 className="hire-detail__name">
              {match.displayName || match.jobRole}
            </h3>
            {(e.skills?.length || match.displayName) && !sample && (
              <p className="desk-card__stack">
                {e.skills?.length
                  ? e.skills.slice(0, 8).join(" · ")
                  : match.jobRole}
              </p>
            )}
            <p className="hire-detail__ref">
              {sample
                ? "Sample profile — not a person in the pool"
                : [match.locationLabel, publicId].filter(Boolean).join(" · ")}
            </p>
          </div>
          {!sample && (
            <div className="hire-detail__score">
              <b>{match.score}</b>
              <span>out of 100</span>
            </div>
          )}
        </div>

        <div className="desk-card__facts" style={{ marginTop: 16 }}>
          {track && <span className="desk-pill">{track}</span>}
          {typeof e.missionsPassed === "number" && (
            <span className="desk-pill desk-pill--good">
              {e.missionsPassed}
              {totalDays ? ` of ${totalDays}` : ""}{" "}
              {isChallenge ? "days shipped" : "missions passed"}
            </span>
          )}
          {match.source === "HACKATHON" && (
            <span className="desk-pill desk-pill--good">Shipped project</span>
          )}
          {e.certificateIssued && (
            <span className="desk-pill desk-pill--good">Certified</span>
          )}
          {typeof e.yearsExperience === "number" && e.yearsExperience > 0 && (
            <span className="desk-pill">{e.yearsExperience} yrs</span>
          )}
          {match.tier && match.tier !== "NONE" && !sample && (
            <span className="desk-pill">{match.tier}</span>
          )}
          {match.availabilityUnknown && (
            <span className="desk-pill desk-pill--warn">Availability unconfirmed</span>
          )}
        </div>

        {!sample && (
          <Link href={evidenceResumeHref(match.candidateRef)} className="hire-detail__resume">
            <Download className="size-3.5" aria-hidden="true" />
            Resume
          </Link>
        )}

        <p className="hire-detail__p" style={{ marginTop: 16 }}>
          {sample
            ? "This is an illustration of the requirement — nobody in the pool matches it yet. Figures below are taken from what you asked for, not from a candidate."
            : "Identity stays hidden until you place a request and the candidate agrees. Figures below are platform-verified where labelled."}
        </p>

        <div className="hire-metrics">
          <Metric k="AB score" v={sample ? null : `${match.score}/100`} />
          <Metric k="Track" v={track} />
          <Metric
            k="Experience"
            v={
              typeof e.yearsExperience === "number"
                ? `${e.yearsExperience} yrs`
                : null
            }
          />
          <Metric
            k={workLabel}
            v={
              typeof e.missionsPassed === "number"
                ? totalDays
                  ? `${e.missionsPassed} of ${totalDays}`
                  : String(e.missionsPassed)
                : match.source === "HACKATHON"
                  ? "Shipped project"
                  : null
            }
          />
          <Metric
            k="First-attempt"
            v={
              typeof e.cleanPassCount === "number"
                ? String(e.cleanPassCount)
                : null
            }
          />
          <Metric
            k="Commit days"
            v={
              typeof e.commitDayCount === "number"
                ? String(e.commitDayCount)
                : null
            }
          />
          <Metric
            k="Projects"
            v={
              e.projectScores?.length
                ? e.projectScores.join(" / ")
                : null
            }
          />
          <Metric
            k="Quiz average"
            v={typeof e.quizAverage === "number" ? String(e.quizAverage) : null}
          />
          <Metric
            k="Certificate"
            v={e.certificateIssued ? "Issued" : null}
          />
          <Metric
            k="Cohort day"
            v={typeof e.cohortDay === "number" ? `Day ${e.cohortDay}` : null}
          />
          <Metric k="Languages" v={(e.workingLanguages ?? []).join(" · ") || null} />
          <Metric k="Est. compensation" v={match.compensationBand ?? null} />
          <Metric k="Reference" v={sample ? null : publicId} />
        </div>
        {match.compensationBand && (
          <p className="hire-detail__p" style={{ marginTop: 10 }}>
            {COMPENSATION_DISCLAIMER}
          </p>
        )}

        {(e.skills?.length ?? 0) > 0 && (
          <div>
            <p className="hire-detail__h">Skills — declared</p>
            <div className="desk-card__facts" style={{ marginTop: 0 }}>
              {e.skills!.map((s) => (
                <span key={s} className="desk-pill">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {match.rationale && (
          <div>
            <p className="hire-detail__h">Why this ranking</p>
            <p className="hire-detail__p">{match.rationale}</p>
          </div>
        )}

        {match.gaps.length > 0 && (
          <div>
            <p className="hire-detail__h">Gaps</p>
            <ul className="m-0 list-none p-0">
              {match.gaps.slice(0, 8).map((g) => (
                <li key={g} className="hire-detail__p" style={{ marginTop: 8 }}>
                  • {g}
                </li>
              ))}
            </ul>
          </div>
        )}

        {match.coverageNote && (
          <p className="hire-detail__p" style={{ marginTop: 18 }}>
            {match.coverageNote}
          </p>
        )}

        <div className="hire-detail__actions">
          <button type="button" className="desk-ghost" onClick={onClose}>
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            See less details
          </button>
          {!sample && (
            <>
              <DeskShortlistButton
                candidateRef={match.candidateRef}
                jobRole={match.jobRole}
              />
              <ShortlistButton
                candidateRef={match.candidateRef}
                programMemberId={match.programMemberId}
                initialShortlisted={match.shortlisted ?? false}
                jobRole={match.jobRole}
                totalScore={match.score}
                onToggle={onCartToggle}
                className={cn(
                  "desk-pod",
                  match.shortlisted && "desk-pod--on",
                )}
                podLabel
              />
              <RequestIntroButton
                candidateRef={match.candidateRef}
                existingStatus={match.engagementStatus ?? null}
                publicId={publicId}
                className="desk-request"
              />
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function Metric({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="hire-metric">
      <span className="hire-metric__k">{k}</span>
      <div className={v ? "hire-metric__v" : "hire-metric__v is-empty"}>
        {v ?? "Not shared"}
      </div>
    </div>
  );
}
