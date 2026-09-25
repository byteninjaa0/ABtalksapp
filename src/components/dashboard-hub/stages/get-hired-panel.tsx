import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check } from "lucide-react";
import type { SectionStatus } from "@/features/profile/completeness";
import type { StageData } from "@/features/dashboard/get-stage-data";
import { cn } from "@/lib/utils";
import { Accent, ArrowLink, STAGE_CARD, StageHeader } from "./stage-ui";

/** Largest weight a section can carry (Basic information). Bars scale to it. */
const MAX_WEIGHT = 25;

function pct(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

type GetHiredPanelProps = {
  profile: StageData["profile"];
  /** Career guidance deck (client), rendered under the panel. */
  guidance?: ReactNode;
};

export function GetHiredPanel({ profile, guidance }: GetHiredPanelProps) {
  const { score, sections, openToWork } = profile;
  // Next: the incomplete section with the most still to earn.
  const next = sections
    .filter((s) => !s.complete)
    .sort((a, b) => b.weight * (1 - b.fraction) - a.weight * (1 - a.fraction))[0];

  return (
    <div className="space-y-6">
      <StageHeader
        title="Let recruiters"
        accent="find you."
        sub="Your profile is where your proof comes together. Fill it in, then apply."
        aside={<ArrowLink href="#build-skills" back>Back to Build skills</ArrowLink>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <StrengthCard score={score} next={next} />
        <ScoreBreakdown sections={sections} />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <section className={cn(STAGE_CARD, "p-6")}>
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-heading text-xl font-bold text-black">
              Open to <Accent>work</Accent>
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                openToWork ? "bg-[#DDF7EE] text-[#03535F]" : "bg-[#EDEDED] text-[#4B4B4B]",
              )}
            >
              <span className={cn("size-1.5 rounded-full", openToWork ? "bg-[#2BD4A0]" : "bg-[#9A9A9A]")} aria-hidden="true" />
              {openToWork ? "On" : "Off"}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-[#4B4B4B]">
            {openToWork ? "Recruiters can see you're looking." : "Let recruiters know you're looking."}
          </p>
          <ArrowLink href="/profile" className="mt-5">
            Change in profile
          </ArrowLink>
        </section>

        <Link
          href="/jobs"
          className="group flex items-center justify-between gap-4 rounded-3xl border border-[#D9E9EA] bg-[#E6F1F1] p-6 transition-colors hover:bg-[#DDEDED]"
        >
          <span>
            <span className="block font-heading text-xl font-bold text-black">
              Browse <Accent>jobs</Accent>
            </span>
            <span className="mt-1.5 block text-sm text-[#4B4B4B]">Roles, applications and alerts.</span>
          </span>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#03535F] text-white transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-5" aria-hidden="true" />
          </span>
        </Link>
      </div>

      {guidance}
    </div>
  );
}

function StrengthCard({ score, next }: { score: number; next: SectionStatus | undefined }) {
  const r = 64;
  const c = 2 * Math.PI * r;
  const left = next ? next.weight * (1 - next.fraction) : 0;
  return (
    <section className="flex flex-col items-center rounded-3xl bg-[#03535F] px-6 py-9 text-center text-white">
      <div className="relative size-[168px]">
        <svg viewBox="0 0 168 168" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="84" cy="84" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="16" />
          <circle
            cx="84"
            cy="84"
            r={r}
            fill="none"
            stroke="#2BD4A0"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - score / 100)}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-5xl font-bold leading-none">{score}%</span>
          <span className="mt-1.5 text-xs text-white/75">profile strength</span>
        </div>
      </div>

      {next ? (
        <>
          <p className="mt-7 font-heading text-xl font-bold">
            Next: <span className="text-[#2BD4A0]">{next.label}</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-white/85">
            {next.hint ?? `Complete your ${next.label.toLowerCase()}.`} Worth up to {pct(left)} more.
          </p>
        </>
      ) : (
        <p className="mt-7 font-heading text-xl font-bold">Your profile is complete.</p>
      )}

      <Link
        href="/profile"
        className="mt-auto inline-flex h-11 items-center justify-center rounded-full bg-[#2BD4A0] px-6 pt-0 text-sm font-semibold text-[#053B33] shadow-[inset_0_-4px_10px_rgba(0,0,0,0.12)] transition-colors hover:bg-[#3ADDAA] sm:mt-10"
      >
        {next ? "Complete your profile" : "View your profile"}
      </Link>
    </section>
  );
}

function ScoreBreakdown({ sections }: { sections: SectionStatus[] }) {
  return (
    <section className={cn(STAGE_CARD, "p-6 sm:p-7")}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-heading text-xl font-bold text-black">
          What makes up your <Accent>score</Accent>
        </h3>
        <span className="text-xs text-[#8A8A8A]">worth</span>
      </div>
      <ul className="mt-4 divide-y divide-[#EEF0F0]">
        {sections.map((s) => {
          const partial = !s.complete && s.fraction > 0;
          const value = s.complete
            ? pct(s.weight)
            : partial
              ? `+${pct(s.weight * (1 - s.fraction))} left`
              : `+${pct(s.weight)}`;
          return (
            <li key={s.key} className="flex items-center gap-3 py-2.5">
              <StatusDot complete={s.complete} partial={partial} />
              <span className="w-40 shrink-0 truncate text-sm font-medium text-black sm:w-44">{s.label}</span>
              <span className="min-w-0 flex-1">
                <span
                  className="block h-1.5 overflow-hidden rounded-full bg-[#E9ECEC]"
                  style={{ width: `${(s.weight / MAX_WEIGHT) * 100}%` }}
                  aria-hidden="true"
                >
                  <span
                    className="block h-full rounded-full bg-[#03535F]"
                    style={{ width: `${(s.complete ? 1 : s.fraction) * 100}%` }}
                  />
                </span>
              </span>
              <span className="w-[74px] shrink-0 text-right text-xs font-semibold text-[#1F1F1F]">{value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusDot({ complete, partial }: { complete: boolean; partial: boolean }) {
  if (complete) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#03535F] text-white" aria-label="Complete">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (partial) {
    return (
      <span
        className="size-5 shrink-0 rounded-full border-2 border-[#03535F] bg-[linear-gradient(90deg,#03535F_50%,transparent_50%)]"
        aria-label="Partly done"
      />
    );
  }
  return <span className="size-5 shrink-0 rounded-full border-[1.5px] border-[#BFC6C6]" aria-label="Not started" />;
}
