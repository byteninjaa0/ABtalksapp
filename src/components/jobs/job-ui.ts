import type { JobApplicationStatus, JobType, JobWorkMode } from "@prisma/client";

/**
 * Shared vocabulary for the candidate Jobs tab — the row shapes the server
 * hands the client browser, the enum labels both sides render, and the clay
 * CTA depth.
 *
 * No "use client" and no client-only imports: both the Server Components under
 * `src/app/jobs/` and the client browser import from here.
 */

/**
 * DS v2 §9A clay depth, layered on `dsButtonVariants` — the same treatment the
 * recruiter onboarding CTAs use. Copied rather than imported from
 * `recruiter-onboarding/onboarding-shell`: that module is a client component
 * carrying framer-motion, and the Jobs tab should not pull it in for a class
 * string. Keep the two in sync if the DS clay recipe changes.
 */
export const CLAY_CTA = [
  "shadow-[inset_0_-4px_8px_rgba(0,0,0,0.38),inset_0_1px_1px_rgba(255,255,255,0.14),0_4px_12px_rgba(3,83,95,0.16)]",
  "hover:shadow-[inset_0_-4px_8px_rgba(0,0,0,0.38),inset_0_1px_1px_rgba(255,255,255,0.14),0_8px_20px_rgba(3,83,95,0.28)]",
  "active:!bg-[#02434D] [a]:active:!bg-[#02434D] active:shadow-[inset_0_-1px_3px_rgba(0,0,0,0.28),inset_0_3px_6px_rgba(0,0,0,0.40),0_2px_6px_rgba(3,83,95,0.14)]",
  "disabled:shadow-none",
].join(" ");

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  FULL_TIME: "Full-time",
  INTERNSHIP: "Internship",
  CONTRACT: "Contract",
  PART_TIME: "Part-time",
};

export const WORK_MODE_LABEL: Record<JobWorkMode, string> = {
  REMOTE: "Remote",
  HYBRID: "Hybrid",
  ONSITE: "On-site",
};

/**
 * Saved jobs are per-device: there is no SavedJob table, so the ids live in
 * this browser only and never reach the server.
 */
export const SAVED_JOBS_KEY = "abtalks.savedJobs";

/** One browsable job card. Dates arrive pre-formatted — see `formatPostedLabel`. */
export type JobCardRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobWorkMode | null;
  type: JobType;
  skills: string[];
  postedLabel: string;
  /** True when this candidate already has an application row for the job. */
  applied: boolean;
};

/** One row of the candidate's own application tracker. */
export type ApplicationCardRow = {
  id: string;
  jobId: string;
  title: string;
  company: string;
  location: string | null;
  workMode: JobWorkMode | null;
  type: JobType;
  status: JobApplicationStatus;
  appliedLabel: string;
  isOpen: boolean;
};

/**
 * "2 days ago" for a job card. Formatted on the server so the string is
 * identical for every viewer and nothing has to re-render on hydration.
 */
export function formatPostedLabel(posted: Date, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - posted.getTime()) / 86_400_000);
  if (days <= 0) return "Posted today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 5) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return months <= 1 ? "1 month ago" : `${months} months ago`;
}
