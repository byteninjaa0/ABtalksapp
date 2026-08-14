import { TrackRow } from "@/components/explore/track-row";

type Props = {
  isReadyForInterview: boolean;
  claudeEnabled: boolean;
  hasClaudeEnrollment: boolean;
  synergyPoints: number | null;
};

export function WhatsNext({
  isReadyForInterview,
  claudeEnabled,
  hasClaudeEnrollment,
  synergyPoints,
}: Props) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-lg font-semibold">What&apos;s next</h3>
      <ul className="space-y-2">
        <li>
          <TrackRow
            href="/jobs"
            title="Get discovered"
            support={
              isReadyForInterview
                ? "You're visible to recruiters now"
                : "Complete your profile to be listed"
            }
            icon="code"
          />
        </li>
        {claudeEnabled && !hasClaudeEnrollment ? (
          <li>
            <TrackRow
              href="/claude-signup"
              title="Claude challenge"
              support="Build with Claude · 60 days"
              icon="sparkles"
            />
          </li>
        ) : null}
        <li>
          <TrackRow
            href="/hackathon"
            title="Vibe code hackathon"
            support="48 hours · teams of 3"
            icon="bolt"
          />
        </li>
        <li>
          <TrackRow
            href="/ai-workshop"
            title="Free AI bootcamp"
            support="Live 1-hour session"
            icon="play"
          />
        </li>
        {synergyPoints !== null ? (
          <li>
            <TrackRow
              href="/marketplace"
              title="Spend your points"
              support={`${synergyPoints} synergy points`}
              icon="bolt"
            />
          </li>
        ) : null}
      </ul>
    </div>
  );
}
