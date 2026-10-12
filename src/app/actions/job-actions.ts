"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  applyToPublishedJob,
  listMyApplications,
} from "@/features/candidate-jobs/service";
import { prismaApplicationStore } from "@/features/candidate-jobs/prisma-store";
import { prismaJobStore } from "@/features/recruiter-jobs/prisma-store";
import { convergeApplicantToPipeline } from "@/features/pipeline-convergence/converge-applicant";
import { logger } from "@/lib/logger";

const applySchema = z.object({
  jobId: z.string().min(1),
  note: z.string().max(1000).optional().default(""),
  resumeUrl: z.string().url().max(2048).optional(),
  coverLetter: z.string().max(5000).optional(),
});

function deps() {
  return {
    jobs: prismaJobStore(),
    applications: prismaApplicationStore(),
  };
}

export async function applyToJobAction(input: {
  jobId: string;
  note?: string;
  resumeUrl?: string;
  coverLetter?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, message: "Sign in to apply.", status: 401 };
  }

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: "Invalid input", status: 400 };
  }

  const res = await applyToPublishedJob(
    deps(),
    { userId: session.user.id },
    parsed.data,
  );

  if (!res.ok) {
    return {
      ok: false as const,
      message: res.message,
      status: res.status ?? 400,
    };
  }

  // T-247: applicants land on the recruiter's pipeline at SOURCED. Wrapped
  // in try/catch so a broken pipeline never breaks the applicant — the
  // apply already succeeded, converge is a side effect and stays one.
  try {
    await convergeApplicantToPipeline({ applicationId: res.data.id });
  } catch (err) {
    logger.warn("job-actions.converge_wrapper_caught", {
      applicationId: res.data.id,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return { ok: true as const, applicationId: res.data.id, status: res.data.status };
}

export async function listMyApplicationsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, message: "Sign in to view your applications.", status: 401 };
  }

  const res = await listMyApplications(deps(), { userId: session.user.id });
  if (!res.ok) {
    return { ok: false as const, message: res.message, status: res.status ?? 400 };
  }
  return { ok: true as const, applications: res.data };
}

/**
 * How many jobs are open right now, for the sidebar badge.
 *
 * The same predicate the candidate list uses — `status: "PUBLISHED"`, see
 * `listPublishedJobsFiltered` in `features/candidate-jobs/prisma-store.ts` —
 * so the badge and the page can never disagree about what "open" means. A
 * count, not a findMany: the badge needs the number, not the rows, and there
 * is an index on `[status, createdAt]`.
 *
 * Signed-in only. It leaks nothing personal, but the sidebar it feeds is a
 * signed-in surface and an open endpoint is a free row-count oracle.
 */
export async function getOpenJobsCountAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, message: "Not authenticated" };
  }
  try {
    const count = await prisma.job.count({ where: { status: "PUBLISHED" } });
    return { ok: true as const, data: { count } };
  } catch (error) {
    logger.error("[job-actions] open jobs count failed", {
      error: String(error),
    });
    return { ok: false as const, message: "Failed to count jobs" };
  }
}
