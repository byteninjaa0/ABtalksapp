import "server-only";

import { prisma } from "@/lib/db";
import { matches } from "./matcher";
import type { JobAlertCriteria, JobAlertRow, MatchableJob } from "./types";

const SELECT = {
  id: true,
  candidateUserId: true,
  name: true,
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
  name: string;
  enabled?: boolean;
};

export type JobAlertStore = {
  listByCandidate(userId: string): Promise<JobAlertRow[]>;
  countByCandidate(userId: string): Promise<number>;
  getById(id: string, userId: string): Promise<JobAlertRow | null>;
  create(userId: string, input: UpsertInput): Promise<JobAlertRow>;
  updateById(
    id: string,
    userId: string,
    input: UpsertInput,
  ): Promise<JobAlertRow | null>;
  setEnabledById(
    id: string,
    userId: string,
    enabled: boolean,
  ): Promise<JobAlertRow | null>;
  deleteById(id: string, userId: string): Promise<boolean>;
  /**
   * Every enabled alert whose criteria the job satisfies. The store scans
   * enabled rows and the pure matcher does the work — SQL-side prefilter
   * is a future optimization when volumes justify it.
   */
  findEnabledMatching(job: MatchableJob): Promise<JobAlertRow[]>;
};

export function prismaJobAlertStore(): JobAlertStore {
  return {
    async listByCandidate(userId) {
      return prisma.jobAlert.findMany({
        where: { candidateUserId: userId },
        orderBy: { createdAt: "desc" },
        select: SELECT,
      });
    },

    async countByCandidate(userId) {
      return prisma.jobAlert.count({ where: { candidateUserId: userId } });
    },

    async getById(id, userId) {
      // Include candidateUserId in the where so a foreign id returns null
      // — no existence signal for other users' alert ids.
      return prisma.jobAlert.findFirst({
        where: { id, candidateUserId: userId },
        select: SELECT,
      });
    },

    async create(userId, input) {
      return prisma.jobAlert.create({
        data: {
          candidateUserId: userId,
          name: input.name,
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

    async updateById(id, userId, input) {
      // updateMany + count check keeps ownership enforcement in the SQL
      // where clause; there is no path where a foreign id can be mutated.
      const result = await prisma.jobAlert.updateMany({
        where: { id, candidateUserId: userId },
        data: {
          name: input.name,
          enabled: input.enabled ?? true,
          skills: input.skills,
          role: input.role,
          location: input.location,
          workMode: input.workMode,
          opportunityType: input.opportunityType,
        },
      });
      if (result.count === 0) return null;
      return prisma.jobAlert.findFirst({
        where: { id, candidateUserId: userId },
        select: SELECT,
      });
    },

    async setEnabledById(id, userId, enabled) {
      const result = await prisma.jobAlert.updateMany({
        where: { id, candidateUserId: userId },
        data: { enabled },
      });
      if (result.count === 0) return null;
      return prisma.jobAlert.findFirst({
        where: { id, candidateUserId: userId },
        select: SELECT,
      });
    },

    async deleteById(id, userId) {
      const result = await prisma.jobAlert.deleteMany({
        where: { id, candidateUserId: userId },
      });
      return result.count > 0;
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
