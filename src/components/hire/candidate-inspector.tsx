"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CircleMinus,
  Eye,
  Gauge,
  Mail,
  Phone,
  Send,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react";
import { refPublicId, type CandidateSource } from "@/features/hire/candidate-ref";
import { isLockedPreview } from "@/features/hire/locked-preview";
import {
  LockedField,
  UpgradeNotice,
  useUpgradePrompt,
} from "@/components/hire/locked-field";
import { COMPENSATION_DISCLAIMER } from "@/features/hire/compensation";
import { DeskShortlistButton } from "@/components/hire/desk-shortlist-button";
import {
  evidenceResumeHref,
  rememberEvidence,
} from "@/components/hire/evidence-cache";
import { ShortlistButton } from "@/components/talent/shortlist-button";
import { PanelResizer } from "@/components/hire/panel-resizer";
import { EvidenceResumeBody } from "@/components/hire/evidence-resume";
import { HireScoreChart } from "@/components/hire/hire-score-chart";
import {
  buildCardPills,
  coverageLede,
  OpenToWorkBadge,
} from "@/components/hire/hire-card-facts";
import type { MatchCardData, MatchDecision } from "@/components/hire/match-card";
import { cn } from "@/lib/utils";
import { MaskedName } from "@/components/hire/desk-match-card";
import { UnlockContactDialog } from "@/components/hire/unlock-contact-dialog";
import { OutreachComposeDialog } from "@/components/hire/outreach-compose-dialog";
import { revealContactAction } from "@/app/actions/hire-unlock-actions";
import type { RevealedContact } from "@/features/hire/unlock-contact";
import {
  SubscriptionGate,
  type GateReason,
} from "@/components/hire/subscription-gate";

function trackLongLabel(source?: CandidateSource): string | null {
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

const WORK_MODE: Record<string, string> = {
  ONSITE: "Onsite",
  HYBRID: "Hybrid",
  REMOTE: "Remote",
  FLEXIBLE: "Flexible",
};

/** The panel's tabs jump to sections of one scroll, as in the design. */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "experience", label: "Experience" },
  { id: "education", label: "Education" },
  { id: "skills", label: "Skills" },
  { id: "resume", label: "Resume" },
  { id: "more", label: "More" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DECISION_LABEL: Record<MatchDecision, string | null> = {
  SHORTLISTED: "Shortlisted",
  REJECTED: "Rejected",
  UNDECIDED: null,
};

/** Letters for a logo tile: "US cohort" → "UC", "Hackathon" → "HA". */
function monogram(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : label.trim().slice(0, 2);
  return letters.toUpperCase();
}

type Role = { title: string; value: ReactNode; badge?: string; note?: string };

/**
 * The candidate profile panel (Figma 1585:189).
 *
 * The design is laid out for a work history ABTalks does not hold — employers,
 * roles, schools. Each block is filled from what the pool does have: the
 * Experience timeline lists verified work on the track, Education is the
 * declared level, and the credentials card lists the connected platforms.
 * Contact is behind the paid unlock (T-229): "Reveal email" / "Reveal number"
 * open the unlock dialog, which states the cost before charging. The resume
 * stays behind the plan gate — a different lock.
 */
export function CandidateInspector({
  match,
  onClose,
  onCartToggle,
  onPrev,
  onNext,
  decision = null,
}: {
  match: MatchCardData;
  onClose: () => void;
  onCartToggle?: (inCart: boolean) => void;
  /** The panel's arrows walk the result list; absent at either end. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Project triage state, when this candidate sits in a talent project. */
  decision?: MatchDecision | null;
}) {
  const e = match.evidence ?? {};
  const publicId = refPublicId(match.candidateRef);
  const sample = match.candidateRef.startsWith("SAMPLE:");
  const preview = isLockedPreview(match) ? match.preview : null;
  const { upgradeOpen, openUpgrade, dismissUpgrade } = useUpgradePrompt();
  const track = trackLongLabel(match.source);
  const isChallenge = match.source === "CLAUDE" || match.source === "CHALLENGE_60";
  const totalDays = e.totalTrackDays;
  const skills = e.skills ?? [];
  const languages = e.workingLanguages ?? [];
  const missions =
    typeof e.missionsPassed === "number"
      ? totalDays
        ? `${e.missionsPassed} of ${totalDays}`
        : String(e.missionsPassed)
      : match.source === "HACKATHON"
        ? "Shipped project"
        : null;
  const firstAttempt =
    typeof e.cleanPassCount === "number"
      ? e.cleanPassCount > 0
        ? String(e.cleanPassCount)
        : "None recorded"
      : null;
  const commits =
    typeof e.commitDayCount === "number" ? String(e.commitDayCount) : null;
  const projects = e.projectScores?.length
    ? e.projectScores.join(" / ")
    : null;
  const years =
    typeof e.yearsExperience === "number" && e.yearsExperience > 0
      ? e.yearsExperience
      : null;
  const workMode = e.workMode ? (WORK_MODE[e.workMode] ?? e.workMode) : null;
  const tierLabel =
    match.tier === "STRONG"
      ? "Recommended"
      : match.tier && match.tier !== "NONE"
        ? match.tier.charAt(0) + match.tier.slice(1).toLowerCase()
        : null;
  const tags = buildCardPills(match, 12).filter(
    (pill) => !pill.key.startsWith("skill:"),
  );
  const status = decision ? DECISION_LABEL[decision] : null;
  const resumeHref = evidenceResumeHref(match.candidateRef);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const scrollRef = useRef<HTMLDivElement>(null);

  const [contact, setContact] = useState<RevealedContact | null>(null);

  useEffect(() => {
    rememberEvidence([match]);
  }, [match]);

  // What this recruiter has already paid for. `revealContactAction` returns
  // null unless a CONTACT_SHARED row exists, so it reveals nothing on its own.
  // The `alive` flag stops a slow answer for the previous candidate landing on
  // the one now open.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const found = sample
        ? null
        : await revealContactAction({ candidateRef: match.candidateRef });
      if (alive) setContact(found);
    })();
    return () => {
      alive = false;
    };
  }, [match.candidateRef, sample]);

  async function loadContact() {
    setContact(await revealContactAction({ candidateRef: match.candidateRef }));
  }

  function jump(id: TabId) {
    setTab(id);
    scrollRef.current
      ?.querySelector<HTMLElement>(`[data-section="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const name = preview ? (
    <LockedField
      value={preview.displayName}
      label="Candidate name"
      onReveal={openUpgrade}
    />
  ) : match.displayName ? (
    // Same treatment as the result card — see `MaskedName`.
    <MaskedName name={match.displayName} />
  ) : (
    match.jobRole
  );

  const orgs = [match.jobRole, track].filter((v): v is string => Boolean(v));

  const roles: Role[] = [];
  if (missions) {
    roles.push({
      title: isChallenge ? "Days shipped" : "Missions passed",
      value: missions,
      badge: e.certificateIssued ? "Certified" : undefined,
    });
  }
  if (firstAttempt) roles.push({ title: "First-attempt passes", value: firstAttempt });
  if (commits) roles.push({ title: "Verified commits", value: `${commits} commit days` });
  if (projects) roles.push({ title: "Graded projects", value: projects });
  if (typeof e.interviewOverall === "number") {
    roles.push({ title: "Exit interview", value: `${e.interviewOverall}/5` });
  }
  if (typeof e.quizAverage === "number") {
    roles.push({ title: "Weekly quiz average", value: String(e.quizAverage) });
  }
  if (preview) {
    roles.push({
      title: "Expected compensation",
      value: (
        <LockedField
          value={preview.compensationBand}
          label="Expected compensation"
          onReveal={openUpgrade}
        />
      ),
    });
  } else if (match.compensationBand) {
    roles.push({
      title: match.compensationDeclared ? "Expected CTC" : "Est. compensation",
      value: match.compensationBand,
      note: match.compensationDeclared ? undefined : COMPENSATION_DISCLAIMER,
    });
  }

  const platforms: { title: string; sub: string; date: string }[] = sample
    ? []
    : [
      ...(e.certificateIssued
        ? [
          {
            title: "Track certificate",
            sub: track ?? "ABTalks",
            date: "Issued",
          },
        ]
        : []),
      {
        title: "GitHub",
        sub: e.githubConnected
          ? typeof e.commitDayCount === "number"
            ? `${e.commitDayCount} verified commit days`
            : "Connected"
          : "Not connected",
        date: e.githubConnected ? "Verified" : "",
      },
      {
        title: "LinkedIn",
        sub: e.linkedinConnected ? "Connected" : "Not connected",
        date: e.linkedinConnected ? "Verified" : "",
      },
    ];

  const experienceSummary = [
    years ? `${years} year${years === 1 ? "" : "s"} total` : null,
    track,
  ].filter(Boolean);

  return (
    <aside className="hire-detail hire-profile" aria-label="Candidate details">
      {/* Outside the scroll container so it stays on the seam as the panel
          scrolls. */}
      <PanelResizer />
      <div ref={scrollRef} className="hire-detail__scroll">
        <div className="hire-profile__controls">
          <div className="hire-profile__history">
            <button
              type="button"
              className="hire-profile__ctl"
              aria-label="Previous candidate"
              disabled={!onPrev}
              onClick={onPrev}
            >
              <ArrowLeft size={15} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </button>
            <button
              type="button"
              className="hire-profile__ctl"
              aria-label="Next candidate"
              disabled={!onNext}
              onClick={onNext}
            >
              <ArrowRight size={15} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </button>
          </div>
          <div className="hire-profile__window">
            <button
              type="button"
              className="hire-profile__ctl"
              aria-label="Back to results"
              onClick={onClose}
            >
              <ArrowLeft size={17} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </button>
            {!sample && (
              <Link
                href={resumeHref}
                className="hire-profile__more"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open the full evidence profile"
                title="Full evidence profile"
              >
                •••
              </Link>
            )}
            <button
              type="button"
              className="hire-profile__ctl"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={16} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="hire-profile__identity">
          <div className="hire-profile__namerow">
            <h3 className="hire-profile__name">
              {name}
              <OpenToWorkBadge openToWork={match.openToWork} />
            </h3>
            {e.linkedinConnected && (
              <span className="hire-profile__in" title="LinkedIn connected">
                in
              </span>
            )}
          </div>
          <p className="hire-profile__loc">
            {preview ? (
              <LockedField
                value={preview.locationLabel}
                label="Location"
                onReveal={openUpgrade}
              />
            ) : sample ? (
              "Sample profile — not a person in the pool"
            ) : (
              [match.locationLabel, workMode, publicId].filter(Boolean).join(" · ")
            )}
          </p>
          {orgs.length > 0 && (
            <div className="hire-profile__orgs">
              {orgs.map((label) => (
                <span key={label} className="hire-profile__org">
                  <span className="hire-profile__orglogo" aria-hidden="true">
                    {label.trim().charAt(0).toUpperCase()}
                  </span>
                  <span>{label}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {!sample && (
          <div className="hire-profile__actions">
            <ShortlistButton
              candidateRef={match.candidateRef}
              programMemberId={match.programMemberId}
              initialShortlisted={match.shortlisted ?? false}
              jobRole={match.jobRole}
              totalScore={match.score}
              displayName={match.displayName}
              skills={skills}
              snapshot={match}
              onToggle={onCartToggle}
              className={cn("desk-pod", match.shortlisted && "desk-pod--on")}
              podLabel
            />
            <DeskShortlistButton
              candidateRef={match.candidateRef}
              jobRole={match.jobRole}
              match={match}
            />
            {/* For a locked preview this still opens the plan dialog. For a
                readable candidate the resume is now a section of this panel,
                so the button scrolls to it instead of gating it. "•••" remains
                the way to the full page. */}
            <button
              type="button"
              className="hire-profile__view"
              aria-label={preview ? "View resume" : "Go to resume"}
              title="Resume"
              aria-haspopup={preview ? "dialog" : undefined}
              onClick={() => (preview ? setGate("resume") : jump("resume"))}
            >
              <Eye size={16} strokeWidth={1} absoluteStrokeWidth aria-hidden="true" />
            </button>
          </div>
        )}

        <nav className="hire-profile__tabs" aria-label="Profile sections">
          {/* A sample card has no evidence record, so it has no resume section
              to jump to — drop the tab rather than leave it inert. */}
          {TABS.filter((t) => t.id !== "resume" || !sample).map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn("hire-profile__tab", tab === t.id && "is-active")}
              aria-current={tab === t.id ? "true" : undefined}
              onClick={() => jump(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section
          data-section="overview"
          className="hire-profile__overview"
          aria-label="Overview"
        >
          <Row icon={CircleMinus} label="Status" muted={!status}>
            {status ?? "No status"}
          </Row>
          {!sample && (
            <Row icon={Gauge} label="AB score">
              {match.score}/100{tierLabel ? ` · ${tierLabel}` : ""}
            </Row>
          )}
          {preview ? (
            <>
              <Row icon={Mail} label="Email">
                <LockedField
                  value={preview.email}
                  label="Email address"
                  onReveal={openUpgrade}
                />
              </Row>
              <Row icon={Phone} label="Phone">
                <LockedField
                  value={preview.phone}
                  label="Phone number"
                  onReveal={openUpgrade}
                />
              </Row>
            </>
          ) : contact ? (
            // What the unlock bought, next to the control that bought it.
            <>
              <Row icon={Mail} label="Email" muted={!contact.email}>
                {contact.email ? (
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                ) : (
                  "Not provided"
                )}
              </Row>
              <Row icon={Phone} label="Phone" muted={!contact.phone}>
                {contact.phone ? (
                  <a href={`tel:${contact.phone}`}>{contact.phone}</a>
                ) : (
                  "Not provided"
                )}
              </Row>
              {/* T-232: message them from here, where the unlocked email is. */}
              <Row icon={Send} label="Message">
                <OutreachComposeDialog
                  candidateRef={match.candidateRef}
                  candidateLabel={match.displayName ?? publicId}
                />
              </Row>
            </>
          ) : !sample ? (
            // T-229: revealing contact is the paid unlock — the dialog shows the
            // configured cost, the balance and what is left before anything is
            // charged. It is not the plan gate; the plan is a different thing.
            <>
              <Row icon={Mail} label="Email">
                <UnlockContactDialog
                  candidateRef={match.candidateRef}
                  publicId={publicId}
                  onUnlocked={loadContact}
                  triggerLabel={"Reveal email  +"}
                  className="hire-profile__reveal"
                />
              </Row>
              <Row icon={Phone} label="Phone">
                <UnlockContactDialog
                  candidateRef={match.candidateRef}
                  publicId={publicId}
                  onUnlocked={loadContact}
                  triggerLabel={"Reveal number  +"}
                  className="hire-profile__reveal"
                />
              </Row>
            </>
          ) : null}
          <Row icon={Tag} label="Tags" muted={tags.length === 0}>
            {tags.length > 0 ? (
              <span className="hire-profile__tags">
                {tags.map((pill) => (
                  <span key={pill.key} className={pill.className}>
                    {pill.label}
                  </span>
                ))}
              </span>
            ) : (
              "No tags"
            )}
          </Row>
          {upgradeOpen && <UpgradeNotice onDismiss={dismissUpgrade} />}
          {preview && (
            <p className="hire-profile__note">
              This is an example of the full profile format — the details
              behind the blur are generated, not a candidate.
            </p>
          )}
          <div className="hire-profile__rule" />
        </section>

        <section
          data-section="experience"
          className="hire-profile__section hire-profile__section--ruled"
          aria-label="Experience"
        >
          <h4 className="hire-profile__h">
            Experience
            {experienceSummary.length > 0 && (
              <small>· {experienceSummary.join(" · ")}</small>
            )}
          </h4>
          <div className="hire-profile__org-block">
            <span className="hire-profile__tile" aria-hidden="true">
              {monogram(track ?? match.jobRole)}
            </span>
            <div className="hire-profile__org-main">
              <div>
                <p className="hire-profile__org-name">
                  {track ?? "Verified work on ABTalks"}
                </p>
                <p className="hire-profile__org-sub">{match.jobRole}</p>
              </div>
              {roles.length > 0 ? (
                <ul className="hire-profile__roles">
                  {roles.map((r) => (
                    <li key={r.title} className="hire-profile__role">
                      <span className="hire-profile__timeline" aria-hidden="true" />
                      <div className="hire-profile__role-body">
                        <div className="hire-profile__role-head">
                          <p className="hire-profile__role-title">{r.title}</p>
                          {r.badge && (
                            <span className="hire-profile__promo">{r.badge}</span>
                          )}
                        </div>
                        <p className="hire-profile__meta">{r.value}</p>
                        {r.note && <p className="hire-profile__text">{r.note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hire-profile__meta">
                  {sample
                    ? "Figures are taken from your requirement, not from a candidate."
                    : "No verified work recorded yet."}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="hire-profile__section hire-profile__section--ruled hire-profile__section--wide">
          <div data-section="education" className="hire-profile__block">
            <h4 className="hire-profile__h">Education</h4>
            <div className="hire-profile__org-block">
              <span
                className="hire-profile__tile hire-profile__tile--school"
                aria-hidden="true"
              >
                {(e.educationLevel ?? "?").trim().charAt(0).toUpperCase()}
              </span>
              <div className="hire-profile__org-main">
                <div>
                  <p className="hire-profile__org-name hire-profile__org-name--lg">
                    {preview ? (
                      <LockedField
                        value={preview.educationLine}
                        label="Education"
                        onReveal={openUpgrade}
                      />
                    ) : (
                      (e.educationLevel ?? "Not disclosed")
                    )}
                  </p>
                  <p className="hire-profile__org-sub">
                    Highest education · declared by the candidate
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div data-section="skills" className="hire-profile__block">
            <h4 className="hire-profile__h">Skill Map</h4>
            {skills.length > 0 ? (
              <div className="hire-profile__group">
                <p className="hire-profile__group-h">Declared by the candidate</p>
                <ul className="hire-profile__chips">
                  {skills.slice(0, 10).map((s) => (
                    <li key={s} className="hire-profile__chip">
                      {s}
                    </li>
                  ))}
                  {skills.length > 10 && (
                    <li className="hire-profile__count">+{skills.length - 10}</li>
                  )}
                </ul>
              </div>
            ) : (
              <p className="hire-profile__meta">No skills declared.</p>
            )}
            {languages.length > 0 && (
              <div className="hire-profile__group">
                <p className="hire-profile__group-h">Verified working languages</p>
                <ul className="hire-profile__chips">
                  {languages.map((l) => (
                    <li key={l} className="hire-profile__chip">
                      {l}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        {!sample && (
          <section
            data-section="resume"
            className="hire-profile__section hire-profile__section--ruled"
            aria-label="Resume"
          >
            <h4 className="hire-profile__h">Resume</h4>
            {/* The same record as /hire/evidence, rendered here so the
                recruiter never leaves the results to read it. The identity
                header is suppressed: the panel already shows the name and
                score above. */}
            <div className="hire-sheet hire-sheet--embed">
              <EvidenceResumeBody match={match} showIdentity={false} />
            </div>
          </section>
        )}

        <section
          data-section="more"
          className="hire-profile__section hire-profile__section--ruled hire-profile__section--cred"
          aria-label="More"
        >
          <h4 className="hire-profile__h">AI candidate summary</h4>
          <p className="hire-profile__text">
            {match.rationale?.trim() ||
              "Resume analysis has not been recorded for this candidate yet."}
          </p>
          <p className="hire-profile__note">
            {sample
              ? "This is an illustration of the requirement — nobody in the pool matches it yet. Figures above are taken from what you asked for, not from a candidate."
              : coverageLede(match)}
          </p>

          {!sample && match.scores && (
            <div className="hire-profile__group">
              <h4 className="hire-profile__h">Candidate parameters</h4>
              <HireScoreChart scores={match.scores} total={match.score} />
              <p className="hire-profile__note">
                Slice size is each parameter&apos;s share of this candidate&apos;s
                combined score; the exact value out of 100 is listed beside it.
                Scores are derived from the evidence on record — indicative, not
                a validated psychometric measure.
              </p>
            </div>
          )}

          {platforms.length > 0 && (
            <div className="hire-profile__card">
              <p className="hire-profile__card-head">
                Credentials <small>· {platforms.length}</small>
              </p>
              {platforms.map((p) => (
                <div key={p.title} className="hire-profile__cert">
                  <Award
                    size={14}
                    strokeWidth={1.2}
                    absoluteStrokeWidth
                    color="#F97316"
                    aria-hidden="true"
                  />
                  <span className="hire-profile__cert-body">
                    <span className="hire-profile__cert-title">{p.title}</span>
                    <span className="hire-profile__cert-sub">{p.sub}</span>
                  </span>
                  <span className="hire-profile__cert-date">{p.date}</span>
                </div>
              ))}
            </div>
          )}

          <p className="hire-profile__note">
            Mission, first-attempt, commit and project figures are verified by
            ABTalks. Experience, skills and role are self-declared. Compensation
            and availability are shown only when the candidate shared them.
          </p>
        </section>
      </div>

      <SubscriptionGate reason={gate} onClose={() => setGate(null)} />
    </aside>
  );
}

function Row({
  icon: Icon,
  label,
  muted = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="hire-profile__row">
      <span className="hire-profile__label">
        <Icon size={16} strokeWidth={1.25} absoluteStrokeWidth aria-hidden="true" />
        {label}
      </span>
      <div className={cn("hire-profile__value", muted && "is-muted")}>
        {children}
      </div>
    </div>
  );
}
