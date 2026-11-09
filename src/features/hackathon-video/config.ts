/**
 * VideoThon (video editors hackathon) — event config.
 *
 * Working name and dates are TODO(organizer). The whole flow scaffolds
 * end-to-end against the placeholders below; final values swap in without
 * touching component code (every string here has one home).
 *
 * Sibling to `src/components/hackathon/hackathon-config.ts` (code hackathon,
 * postponed). This one lives under `features/` because it's read by both
 * client and server code and belongs with the rest of the video-track
 * feature (`features/hackathon-video/*`).
 */

import { isHackathonPreviewEnabled } from "@/lib/feature-flags";

export const VIDEOTHON = {
  // TODO(organizer): finalize this slug before shipping the first row. It is
  // written to every HackathonVideoRegistration.eventId and cannot easily be
  // renamed once real rows exist. `videothon-1` is a safe default.
  eventId: "videothon-1",

  // TODO(organizer): rename if the event is called anything other than VideoThon.
  name: "VideoThon",
  tagline: "24 hours. One brief. Cut something worth watching.",

  // Manual kill switch (cutover / emergency). Time gate is registrationClosesUtc.
  registrationOpen: true,

  // Event window (changed 2026-09-28 to 24 hours): kickoff Fri 9 Oct
  // 8:00 PM IST, deadline Sat 10 Oct 8:00 PM IST. UTC = IST − 5:30.
  kickoffUtc: "2026-10-09T14:30:00Z", // Fri 9 Oct · 8:00 PM IST
  deadlineUtc: "2026-10-10T14:30:00Z", // Sat 10 Oct · 8:00 PM IST
  registrationClosesUtc: "2026-10-09T12:30:00Z", // Fri 9 Oct · 6:00 PM IST

  kickoffLabel: "Friday, 9 Oct · 8:00 PM IST",
  deadlineLabel: "Saturday, 10 Oct · 8:00 PM IST",
  resultsLabel: "Winners announced: Friday, 16 Oct",
  // Event over: the hero swaps the countdown for a "winners declared" notice.
  resultsAnnounced: true,
  registrationClosesLabel: "Registration closes Friday, 9 Oct · 6:00 PM IST",

  // Live WhatsApp group link (locked in 2026-09-25). The Coming Soon that
  // this replaces did not have a Discord — leaving that slot empty by
  // design. Add one if it comes back.
  whatsappLink: "https://chat.whatsapp.com/D4TiA9y16nl3JGjo7drtCo",
  discordLink: "" as string,

  // TODO(organizer): decide whether VideoThon is themeless or brief-picked.
  // The current build assumes ONE open prompt announced on WhatsApp; the
  // dashboard renders the string below directly, no picker. Wire in briefs
  // (like the code hackathon's HackathonProblem rows) as a follow-up.
  //
  // Everything from `brief` to `guidePdf` is the problem statement. It is
  // rendered by the dashboard Server Component from kickoff onwards and must
  // never be passed to (or imported by) a client component: that would ship
  // the text in the JS bundle before kickoff.
  brief: "Record a 2–4 minutes screen video that shows Klymb AI working from both sides: a recruiter looking for talent, and a student building proof of skill.",
  briefPoints: [
    {
      lead: "Show both sides.",
      body: "Start from the website's landing page, sign up as a recruiter and as a candidate, and connect the two.",
    },
    {
      lead: "Explore.",
      body: "There is more in the product than this guide covers. Click around and find the features you find most interesting.",
    },
    {
      lead: "Be creative.",
      body: "Your angle, story, voice-over and editing are yours. Two demos that look the same are a missed chance.",
    },
    {
      lead: "Keep it tight.",
      body: "2 minutes minimum, 4 minutes maximum.",
    },
  ],
  // Recruiter sign-up refuses personal mailboxes (lib/validations/work-email).
  tempMailUrl: "https://temp-mail.org",
  // Served from public/hackathon-v2/. The file name carries spaces.
  guidePdf: "/hackathon-v2/VideoThon%20Demo%20Guide%20-%20Klymb%20AI.pdf",
  guidePdfFileName: "VideoThon Demo Guide - Klymb AI.pdf",
  // TODO(organizer): sponsor slot. Set `enabled: false` to hide the panel.
  sponsor: {
    enabled: false as boolean,
    name: "" as string,
    kicker: "Sponsor" as string,
    headline: "" as string,
    blurb: "" as string,
    siteUrl: "" as string,
  },

  // TODO(organizer): fill prize tiers before kickoff. Empty ⇒ prizes section
  // renders the "revealed soon" state.
  prizes: [] as Array<{ place: string; reward: string }>,
} as const;

/** Open while the kill switch is on and now is before registrationClosesUtc. */
export function isVideothonRegistrationOpen(now: number = Date.now()): boolean {
  if (!VIDEOTHON.registrationOpen) return false;
  return now < new Date(VIDEOTHON.registrationClosesUtc).getTime();
}

export type VideothonSubmissionWindow = {
  unlocked: boolean;
  closed: boolean;
  editable: boolean;
};

/**
 * Window for the submission surface. Distinct from the registration gate.
 *
 * Local preview: `HACKATHON_PREVIEW=true` in `.env.local` unlocks the brief and
 * the submission form before kickoff — under `next dev` only, so the flag can
 * never open the window in production. It lifts the kickoff lock only; the
 * deadline still closes submissions.
 */
export function getVideothonSubmissionWindow(
  now: number = Date.now(),
): VideothonSubmissionWindow {
  const kickoff = new Date(VIDEOTHON.kickoffUtc).getTime();
  const deadline = new Date(VIDEOTHON.deadlineUtc).getTime();
  const preview =
    process.env.NODE_ENV === "development" && isHackathonPreviewEnabled();
  const unlocked = now >= kickoff || preview;
  const closed = now >= deadline;
  return { unlocked, closed, editable: unlocked && !closed };
}
