"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/admin-auth";
import { recruiterDevBypassEnabled } from "@/lib/program-auth";
import { candidatePublicId } from "@/features/hire/public-id";
import {
  decideEngagementSchema,
  engagementMessageSchema,
  placeEngagementRequestSchema,
} from "@/lib/validations/hire-request";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireApprovedRecruiter(): Promise<
  ActionResult<{ userId: string }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Sign in as an approved recruiter." };
  }
  const profile = await prisma.recruiterProfile.findUnique({
    where: { userId: session.user.id },
    select: { approved: true },
  });
  if (!profile?.approved && !recruiterDevBypassEnabled()) {
    return { ok: false, message: "Recruiter access not approved yet." };
  }
  return { ok: true, data: { userId: session.user.id } };
}

/**
 * Ask to be introduced to one candidate.
 *
 * The recruiter never sees who this is — the request is how ABTalks stays in
 * the loop, and how the candidate keeps a say in being contacted at all.
 */
export async function placeEngagementRequestAction(
  input: unknown,
): Promise<ActionResult<{ engagementId: string; status: string }>> {
  const gate = await requireApprovedRecruiter();
  if (!gate.ok) return gate;

  const parsed = placeEngagementRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { programMemberId, requestId, note } = parsed.data;

  try {
    // The candidate must be someone this recruiter could legitimately have
    // seen: in the pool, and consenting to be discoverable.
    const member = await prisma.programMember.findFirst({
      where: {
        id: programMemberId,
        status: { in: ["ENROLLED", "COMPLETED"] },
        recruiterVisibilityConsentAt: { not: null },
      },
      select: { id: true, userId: true },
    });
    if (!member) return { ok: false, message: "Candidate not available." };

    // One open request per recruiter/candidate pair. Asking twice is a
    // duplicate, not a second ask.
    const open = await prisma.talentEngagementRequest.findFirst({
      where: {
        recruiterUserId: gate.data.userId,
        programMemberId,
        status: { notIn: ["CLOSED", "DECLINED"] },
      },
      select: { id: true, status: true },
    });
    if (open) {
      return { ok: true, data: { engagementId: open.id, status: open.status } };
    }

    const created = await prisma.$transaction(async (tx) => {
      const engagement = await tx.talentEngagementRequest.create({
        data: {
          recruiterUserId: gate.data.userId,
          requestId: requestId ?? null,
          source: "PROGRAM",
          programMemberId,
          candidateUserId: member.userId,
          candidatePublicId: candidatePublicId(programMemberId),
          note: note ?? null,
          status: "SUBMITTED",
          submittedAt: new Date(),
        },
        select: { id: true, status: true },
      });

      if (note) {
        await tx.talentEngagementMessage.create({
          data: {
            engagementId: engagement.id,
            authorUserId: gate.data.userId,
            authorRole: "recruiter",
            body: note,
          },
        });
      }

      return engagement;
    });

    revalidatePath("/hire/requests");
    revalidatePath("/admin/hire-requests");
    return {
      ok: true,
      data: { engagementId: created.id, status: created.status },
    };
  } catch (error) {
    logger.error("[hire] placeEngagementRequestAction", {
      error: String(error),
    });
    return { ok: false, message: "Could not place the request." };
  }
}

/** Recruiter adds a comment to their own request thread. */
export async function addEngagementCommentAction(
  input: unknown,
): Promise<ActionResult<{ engagementId: string }>> {
  const gate = await requireApprovedRecruiter();
  if (!gate.ok) return gate;

  const parsed = engagementMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Write a message first." };

  try {
    // Scoped to the caller, so a valid id belonging to someone else is a miss
    // rather than an authorisation check that could be forgotten.
    const owned = await prisma.talentEngagementRequest.findFirst({
      where: {
        id: parsed.data.engagementId,
        recruiterUserId: gate.data.userId,
      },
      select: { id: true },
    });
    if (!owned) return { ok: false, message: "Request not found." };

    await prisma.talentEngagementMessage.create({
      data: {
        engagementId: owned.id,
        authorUserId: gate.data.userId,
        authorRole: "recruiter",
        body: parsed.data.body,
      },
    });

    revalidatePath("/hire/requests");
    revalidatePath("/admin/hire-requests");
    return { ok: true, data: { engagementId: owned.id } };
  } catch (error) {
    logger.error("[hire] addEngagementCommentAction", { error: String(error) });
    return { ok: false, message: "Could not post the comment." };
  }
}

/** Admin decision. CONTACT_SHARED is what releases identity to the recruiter. */
export async function decideEngagementAction(
  input: unknown,
): Promise<ActionResult<{ engagementId: string; status: string }>> {
  const admin = await requireAdmin();

  const parsed = decideEngagementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid decision." };
  const { engagementId, decision, note } = parsed.data;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.talentEngagementRequest.update({
        where: { id: engagementId },
        data: {
          status: decision,
          decidedAt: new Date(),
          decidedByAdminId: admin.userId ?? null,
        },
        select: { id: true, status: true },
      });

      if (note) {
        await tx.talentEngagementMessage.create({
          data: {
            engagementId: row.id,
            authorUserId: admin.userId ?? null,
            authorRole: "admin",
            body: note,
          },
        });
      }

      return row;
    });

    revalidatePath("/admin/hire-requests");
    revalidatePath("/hire/requests");
    return {
      ok: true,
      data: { engagementId: updated.id, status: updated.status },
    };
  } catch (error) {
    logger.error("[hire] decideEngagementAction", { error: String(error) });
    return { ok: false, message: "Could not save the decision." };
  }
}
