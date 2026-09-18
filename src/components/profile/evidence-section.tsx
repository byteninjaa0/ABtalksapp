import { Award, BadgeCheck, EyeOff, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProfileEvidence } from "@/features/profile/get-evidence";

const EVIDENCE_SOURCE_LABEL: Record<string, string> = {
  ACTIVITY_EVALUATION: "Activity",
  ASSESSMENT_SCORE: "Assessment",
  HACKATHON: "Hackathon",
  CREDENTIAL: "Credential",
  EXTERNAL: "External",
};

const CREDENTIAL_TYPE_LABEL: Record<string, string> = {
  COMPLETION: "Completion",
  DISTINCTION: "Distinction",
  PARTICIPATION: "Participation",
  PLACEMENT: "Placement",
  ASSESSMENT: "Assessment",
};

const STAGES = [
  "Claimed",
  "Learning",
  "Practicing",
  "Applied",
  "Verified",
  "Advanced",
] as const;

/**
 * The stage track. Stages come from evidence, so this is a read-out, not a
 * control — the current stage is marked by shape and label, never colour alone.
 */
function SkillStageTrack({ stage }: { stage: string }) {
  const currentIndex = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return (
    <ol className="mt-3 flex items-start justify-between gap-1">
      {STAGES.map((label, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <li
            key={label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
          >
            <span
              className={
                current
                  ? "size-4 rounded-full border-4 border-[#197E23] bg-white"
                  : done
                    ? "size-4 rounded-full bg-[#197E23]"
                    : "size-4 rounded-full border-2 border-[#CDD3D3] bg-white"
              }
              aria-hidden
            />
            <span
              className={
                current
                  ? "text-[10px] font-semibold leading-tight text-foreground"
                  : "text-[10px] leading-tight text-muted-foreground"
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/**
 * Read-only. Every row here was written by something the candidate actually
 * did — a graded activity, an issued credential, a placed hackathon team. There
 * is no editing, and nothing is inferred to fill a gap.
 */
export function EvidenceSection({ evidence }: { evidence: ProfileEvidence }) {
  const { verifiedSkills, credentials, achievements } = evidence;

  if (!evidence.hasAny) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing here yet. Completing challenge days, cohort missions, and
        assessments builds evidence that recruiters can see alongside what you
        have claimed.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {verifiedSkills.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <BadgeCheck className="size-4 text-[#197E23]" aria-hidden />
            Verified skills
          </h3>
          <ul className="space-y-2">
            {verifiedSkills.map((skill) => (
              <li
                key={skill.skillId}
                className="rounded-xl border bg-muted/20 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{skill.name}</span>
                  <Badge className="bg-[#197E23] text-white hover:bg-[#197E23]/90">
                    {skill.stage}
                  </Badge>
                </div>

                <SkillStageTrack stage={skill.stage} />

                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Strength</span>
                  <div
                    className="h-2 flex-1 overflow-hidden rounded-full bg-[#E9E9E9]"
                    role="progressbar"
                    aria-valuenow={skill.evidenceScore}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuetext={`${skill.evidenceScore} of 100 — ${skill.band}`}
                  >
                    <div
                      className="h-full rounded-full bg-[#03535F]"
                      style={{ width: `${Math.min(100, skill.evidenceScore)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums">
                    {skill.evidenceScore}
                  </span>
                  <span className="text-xs text-muted-foreground">{skill.band}</span>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {skill.evidenceCount} piece
                  {skill.evidenceCount === 1 ? "" : "s"} of evidence
                  {skill.nextStageHint ? ` · Next: ${skill.nextStageHint}` : ""}
                </p>
                <ul className="mt-2 space-y-1">
                  {skill.items.map((item, i) => (
                    <li
                      key={`${skill.skillId}-${i}`}
                      className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
                    >
                      <span className="font-medium text-foreground/80">
                        {EVIDENCE_SOURCE_LABEL[item.sourceType] ??
                          item.sourceType}
                      </span>
                      <span>{item.sourceLabel}</span>
                      {item.score !== null && item.maxScore !== null ? (
                        <span>
                          · {item.score}/{item.maxScore}
                        </span>
                      ) : null}
                      <span>· {formatDate(item.occurredAt)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {credentials.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Award className="size-4 text-primary" aria-hidden />
            ABTalks credentials
          </h3>
          <ul className="space-y-2">
            {credentials.map((c) => (
              <li
                key={c.credentialId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{c.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.credentialId} · {formatDate(c.issuedAt)}
                  </p>
                </div>
                <Badge variant="secondary">
                  {CREDENTIAL_TYPE_LABEL[c.type] ?? c.type}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {achievements.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-[#AA821D]" aria-hidden />
            Achievements
          </h3>
          <ul className="space-y-2">
            {achievements.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{a.title}</p>
                  {a.description ? (
                    <p className="text-xs text-muted-foreground">
                      {a.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatDate(a.occurredAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {a.outcomeLabel ? <Badge>{a.outcomeLabel}</Badge> : null}
                  {!a.isPublic ? (
                    <Badge variant="outline" className="gap-1">
                      <EyeOff className="size-3" aria-hidden />
                      Private
                    </Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
