import "server-only";

import { prisma } from "@/lib/db";
import { matches } from "./matcher";
import type { JobAlertCriteria, JobAlertRow, MatchableJob } from "./types";

const SELECT = {
  id: true,
  candidateUserId: true,
  enabled: true,
  skills: true,
  role: true,
  location: true,
  workMode: true,
  opportunityType: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type UpsertInput = Omit<JobAlertCriteria, "enabled"> & {
  enabled?: boolean;
};

export type JobAlertStore = {
  getByCandidate(userId: string): Promise<JobAlertRow | null>;
  upsert(userId: string, input: UpsertInput): Promise<JobAlertRow>;
  setEnabled(userId: string, enabled: boolean): Promise<JobAlertRow | null>;
  /**
   * Return every enabled alert whose criteria are satisfied by `job`. The
   * store scans all enabled rows and delegates to the pure matcher — an
   * SQL-side prefilter on skills is a future optimization when row counts
   * make it worthwhile; T-250 acceptance does not require it.
   */
  findEnabledMatching(job: MatchableJob): Promise<JobAlertRow[]>;
};

export function prismaJobAlertStore(): JobAlertStore {
  return {
    async getByCandidate(userId) {
      return prisma.jobAlert.findUnique({
        where: { candidateUserId: userId },
        select: SELECT,
      });
    },

    async upsert(userId, input) {
      // enabled defaults to true on a fresh row and preserves the caller's
      // value on save; the disable endpoint uses setEnabled(), not this.
      return prisma.jobAlert.upsert({
        where: { candidateUserId: userId },
        create: {
          candidateUserId: userId,
          enabled: input.enabled ?? true,
          skills: input.skills,
          role: input.role,
          location: input.location,
          workMode: input.workMode,
          opportunityType: input.opportunityType,
        },
        update: {
          enabled: input.enabled ?? true,
          skills: input.skills,
          role: input.role,
          location: input.location,
          workMode: input.workMode,
          opportunityType: input.opportunityType,
        },
        select: SELECT,
      });
    },

    async setEnabled(userId, enabled) {
      const existing = await prisma.jobAlert.findUnique({
        where: { candidateUserId: userId },
        select: { id: true },
      });
      if (!existing) return null;
      return prisma.jobAlert.update({
        where: { candidateUserId: userId },
        data: { enabled },
        select: SELECT,
      });
    },

    async findEnabledMatching(job) {
      const rows = await prisma.jobAlert.findMany({
        where: { enabled: true },
        select: SELECT,
      });
      return rows.filter((row) => matches(job, row));
    },
  };
}
