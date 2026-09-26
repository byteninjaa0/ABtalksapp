import Link from "next/link";
import { Check, ListChecks, Mail, Mic, Zap } from "lucide-react";
import type { StageData } from "@/features/dashboard/get-stage-data";
import { cn } from "@/lib/utils";
import { Accent, ArrowLink, PILL_OUTLINE, PILL_SOLID, STAGE_CARD, StageHeader } from "./stage-ui";

type Milestone = {
  key: string;
  Icon: typeof Mic;
  title: { lead?: string; accent: string };
  body: string;
  done: boolean;
  status: string;
  cta: { label: string; href: string; solid: boolean };
};

/** Milestones in order; each is a third of the Test skills score. */
export function testMilestones(
  data: StageData,
  hasActiveTrack: boolean,
  trackHref: string,
): Milestone[] {
  const { mock, quiz, hackathon } = data;
  return [
    {
      key: "mock",
      Icon: Mic,
      title: { lead: "AI mock", accent: "interview" },
      body: "Practise a technical interview out loud and get an evidence-backed report.",
      done: mock.completed > 0,
      status: mock.completed > 0
        ? `Done · ${mock.completed} ${mock.completed === 1 ? "interview" : "interviews"}`
        : "Not started",
      cta: mock.completed > 0
        ? { label: "Practise again", href: "/interview", solid: false }
        : { label: "Start an interview", href: "/interview", solid: true },
    },
    {
      key: "quiz",
      Icon: ListChecks,
      title: { lead: "Weekly", accent: "quiz" },
      body: "A short quiz on each week of your track. Pass one to reach this milestone.",
      done: quiz.passed,
      status: quiz.passed
        ? "Done · quiz passed"
        : quiz.readyHref
          ? "Ready now"
          : hasActiveTrack
            ? "Unlocks after your first week"
            : "Join a track to unlock",
      cta: quiz.readyHref
        ? { label: "Take the quiz", href: quiz.readyHref, solid: !quiz.passed }
        : hasActiveTrack
          ? { label: "Go to your track", href: trackHref, solid: false }
          : { label: "Browse tracks", href: "/challenges", solid: false },
    },
    {
      key: "hackathon",
      Icon: Zap,
      title: { accent: "Hackathon" },
      body: "Build solo or in a team against the clock and earn a certificate.",
      done: hackathon.submitted,
      status: hackathon.submitted
        ? "Done · project submitted"
        : hackathon.live && hackathon.registered
          ? "Live now"
          : hackathon.registrationOpen
            ? hackathon.registered ? "Registered · starts soon" : "Registration open"
            : "Open when one is live",
      cta: hackathon.live && hackathon.registered && !hackathon.submitted
        ? { label: "Open hackathon", href: "/hackathon", solid: true }
        : hackathon.registrationOpen && !hackathon.registered
          ? { label: "Register", href: "/hackathon", solid: true }
          : { label: "See hackathons", href: "/hackathon", solid: false },
    },
  ];
}

type TestSkillsPanelProps = {
  data: StageData;
  hasActiveTrack: boolean;
  trackHref: string;
};

export function TestSkillsPanel({ data, hasActiveTrack, trackHref }: TestSkillsPanelProps) {
  const milestones = testMilestones(data, hasActiveTrack, trackHref);
  const done = milestones.filter((m) => m.done).length;
  const pending = data.assessments.pending;

  return (
    <div className="space-y-6">
      <StageHeader
        title="Prove what you've"
        accent="learned."
        sub="Three milestones, each a third of your Test skills score."
        aside={
          <>
            <p className="flex items-baseline gap-2 text-[15px] text-[#4B4B4B]">
              <span className="font-heading text-4xl font-bold text-black">{done}</span> of 3 milestones
            </p>
            <ArrowLink href="#get-hired">Next: Get hired</ArrowLink>
          </>
        }
      />

      <ul className="grid gap-5 md:grid-cols-3">
        {milestones.map((m) => (
          <li key={m.key} className={cn(STAGE_CARD, "flex flex-col p-6 sm:p-7")}>
            <span
              className={cn(
                "relative flex size-[84px] items-center justify-center rounded-full",
                m.done
                  ? "border-[3px] border-[#2BD4A0] bg-[#DDF7EE] text-[#03535F]"
                  : "border-2 border-dashed border-[#C7D6D6] bg-[#EEF5F5] text-[#03535F]",
              )}
              aria-hidden="true"
            >
              <m.Icon className="size-8" strokeWidth={2} />
              {m.done ? (
                <span className="absolute right-0 top-0 flex size-6 items-center justify-center rounded-full bg-[#2BD4A0] text-[#053B33] ring-2 ring-white">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </span>
            <h3 className="mt-5 font-heading text-2xl font-bold tracking-tight text-black">
              {m.title.lead ? `${m.title.lead} ` : null}
              <Accent>{m.title.accent}</Accent>
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[#4B4B4B]">{m.body}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[13px] font-semibold text-[#03535F]">
              {m.done ? (
                <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
              ) : (
                <span className="size-2 rounded-full bg-[#03535F]" aria-hidden="true" />
              )}
              {m.status}
            </p>
            <div className="mt-auto pt-5">
              <Link href={m.cta.href} className={m.cta.solid ? PILL_SOLID : PILL_OUTLINE}>
                {m.cta.label}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-5 rounded-3xl border-[1.5px] border-dashed border-[#D5DEDE] bg-white p-5 sm:flex-row sm:items-center sm:p-7">
        <span className="relative shrink-0 text-[#03535F]" aria-hidden="true">
          <Mail className="size-14" strokeWidth={1.5} />
          {pending > 0 ? (
            <span className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-white bg-[#2BD4A0]" />
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-xl font-bold text-black">
            Recruiter <Accent>assessments</Accent>
          </h3>
          <p className="mt-1 text-sm text-[#4B4B4B]">
            {pending > 0
              ? `${pending} ${pending === 1 ? "assessment is" : "assessments are"} waiting for you. These are extra and don't change your score.`
              : "None yet. When a recruiter invites you, it shows up here. These are extra and don't change your score."}
          </p>
        </div>
        <Link href="/assessments" className={cn(PILL_OUTLINE, "shrink-0 self-start sm:self-center")}>
          Open assessments
        </Link>
      </section>
    </div>
  );
}
