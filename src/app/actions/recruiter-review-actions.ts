"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  achievementsSchema,
  areasForGrowthSchema,
  codingChallengesSchema,
  compensationSchema,
  educationListSchema,
  experienceListSchema,
  languagesSpokenSchema,
  logisticsSchema,
  projectsSchema,
  recommendationSchema,
  scoreSchema,
  skillGroupsSchema,
  strengthsSchema,
  certificationsListSchema,
} from "@/lib/validations/recruiter";

function revalidateAdminViews(targetUserId: string) {
  revalidatePath(`/admin/students/${targetUserId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/submissions");
  revalidatePath("/admin/analytics");
  revalidatePath("/dashboard");
  revalidatePath(`/students/${targetUserId}`);
  revalidatePath("/challenge");
  revalidatePath("/quiz");
  revalidatePath("/register");
}

const upsertSchema = z.object({
  userId: z.string().min(1),
  targetRole: z.string().max(120).optional(),
  headline: z.string().max(200).optional(),
  summary: z.string().max(4000).optional(),
  adminNote: z.string().max(4000).optional(),
  skillGroups: skillGroupsSchema.optional(),
  education: educationListSchema.optional(),
  certifications: certificationsListSchema.optional(),
  languagesSpoken: languagesSpokenSchema.optional(),
  achievements: achievementsSchema.optional(),
  experience: experienceListSchema.optional(),
  projects: projectsSchema.optional(),
  communicationScore: scoreSchema.nullable().optional(),
  programmingScore: scoreSchema.nullable().optional(),
  behaviorScore: scoreSchema.nullable().optional(),
  communicationFeedback: z.string().max(2000).optional(),
  programmingFeedback: z.string().max(2000).optional(),
  behaviorFeedback: z.string().max(2000).optional(),
  codingChallenges: codingChallengesSchema.optional(),
  strengths: strengthsSchema.optional(),
  areasForGrowth: areasForGrowthSchema.optional(),
  recommendation: recommendationSchema.nullable().optional(),
  assessmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
    .optional()
    .or(z.literal("")),
  interviewerName: z.string().max(120).optional(),
  challengeRound: z.string().max(120).optional(),
  klymbId: z.string().max(40).optional(),
  logistics: logisticsSchema.optional(),
  compensation: compensationSchema.optional(),
});

const userIdSchema = z.object({ userId: z.string().min(1) });

function generateShareToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

function parseAssessmentDate(value: string | undefined): Date | null {
  if (!value?.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export async function upsertRecruiterReviewAction(
  input: z.infer<typeof upsertSchema>,
) {
  const admin = await requireAdmin();
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid input" };

  const { userId, assessmentDate, ...data } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.recruiterReview.upsert({
        where: { userId },
        create: {
          userId,
          targetRole: data.targetRole ?? null,
          headline: data.headline ?? null,
          summary: data.summary ?? null,
          adminNote: data.adminNote ?? null,
          skillGroups: data.skillGroups ?? [],
          education: data.education ?? [],
          certifications: data.certifications ?? [],
          languagesSpoken: data.languagesSpoken ?? [],
          achievements: data.achievements ?? [],
          experience: data.experience ?? [],
          projects: data.projects ?? [],
          communicationScore: data.communicationScore ?? null,
          programmingScore: data.programmingScore ?? null,
          behaviorScore: data.behaviorScore ?? null,
          communicationFeedback: data.communicationFeedback ?? null,
          programmingFeedback: data.programmingFeedback ?? null,
          behaviorFeedback: data.behaviorFeedback ?? null,
          codingChallenges: data.codingChallenges ?? [],
          strengths: data.strengths ?? [],
          areasForGrowth: data.areasForGrowth ?? [],
          recommendation: data.recommendation ?? null,
          assessmentDate: parseAssessmentDate(assessmentDate),
          interviewerName: data.interviewerName ?? null,
          challengeRound: data.challengeRound ?? null,
          klymbId: data.klymbId?.trim() ? data.klymbId.trim() : null,
          logistics: data.logistics ?? {},
          compensation: data.compensation ?? {},
          reviewedByAdminId: admin.userId,
          reviewedAt: new Date(),
        },
        update: {
          targetRole: data.targetRole ?? null,
          headline: data.headline ?? null,
          summary: data.summary ?? null,
          adminNote: data.adminNote ?? null,
          skillGroups: data.skillGroups ?? [],
          education: data.education ?? [],
          certifications: data.certifications ?? [],
          languagesSpoken: data.languagesSpoken ?? [],
          achievements: data.achievements ?? [],
          experience: data.experience ?? [],
          projects: data.projects ?? [],
          communicationScore: data.communicationScore ?? null,
          programmingScore: data.programmingScore ?? null,
          behaviorScore: data.behaviorScore ?? null,
          communicationFeedback: data.communicationFeedback ?? null,
          programmingFeedback: data.programmingFeedback ?? null,
          behaviorFeedback: data.behaviorFeedback ?? null,
          codingChallenges: data.codingChallenges ?? [],
          strengths: data.strengths ?? [],
          areasForGrowth: data.areasForGrowth ?? [],
          recommendation: data.recommendation ?? null,
          assessmentDate: parseAssessmentDate(assessmentDate),
          interviewerName: data.interviewerName ?? null,
          challengeRound: data.challengeRound ?? null,
          klymbId: data.klymbId?.trim() ? data.klymbId.trim() : null,
          logistics: data.logistics ?? {},
          compensation: data.compensation ?? {},
          reviewedByAdminId: admin.userId,
          reviewedAt: new Date(),
        },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: admin.userId,
          actorUserId: admin.userId,
          targetUserId: userId,
          actionType: "RECRUITER_REVIEW_UPDATED",
        },
      });
    });

    revalidateAdminViews(userId);
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Failed to save review",
    };
  }
}

export async function publishRecruiterProfileAction(input: { userId: string }) {
  const admin = await requireAdmin();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid input" };

  const { userId } = parsed.data;

  try {
    const shareToken = await prisma.$transaction(async (tx) => {
      const existing = await tx.recruiterReview.findUnique({
        where: { userId },
        select: { shareToken: true },
      });

      const token = existing?.shareToken ?? generateShareToken();

      await tx.recruiterReview.upsert({
        where: { userId },
        create: {
          userId,
          shareToken: token,
          isPublished: true,
          reviewedByAdminId: admin.userId,
          reviewedAt: new Date(),
        },
        update: {
          shareToken: token,
          isPublished: true,
        },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: admin.userId,
          actorUserId: admin.userId,
          targetUserId: userId,
          actionType: "RECRUITER_PROFILE_PUBLISHED",
        },
      });

      return token;
    });

    revalidateAdminViews(userId);
    return { ok: true as const, data: { shareToken } };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Failed to publish profile",
    };
  }
}

export async function unpublishRecruiterProfileAction(input: { userId: string }) {
  const admin = await requireAdmin();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid input" };

  const { userId } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.recruiterReview.update({
        where: { userId },
        data: { isPublished: false },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: admin.userId,
          actorUserId: admin.userId,
          targetUserId: userId,
          actionType: "RECRUITER_PROFILE_UNPUBLISHED",
        },
      });
    });

    revalidateAdminViews(userId);
    return { ok: true as const };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Failed to unpublish profile",
    };
  }
}

export async function regenerateShareTokenAction(input: { userId: string }) {
  const admin = await requireAdmin();
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid input" };

  const { userId } = parsed.data;

  try {
    const shareToken = await prisma.$transaction(async (tx) => {
      const token = generateShareToken();

      await tx.recruiterReview.update({
        where: { userId },
        data: { shareToken: token },
      });

      await tx.adminAction.create({
        data: {
          adminUserId: admin.userId,
          actorUserId: admin.userId,
          targetUserId: userId,
          actionType: "RECRUITER_LINK_REGENERATED",
        },
      });

      return token;
    });

    revalidateAdminViews(userId);
    return { ok: true as const, data: { shareToken } };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Failed to regenerate link",
    };
  }
}
