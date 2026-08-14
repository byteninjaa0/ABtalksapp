"use server";

import { revalidatePath } from "next/cache";
import {
  Prisma,
  TalentMatchTier,
  TalentRequestStatus,
  type TalentEmploymentType,
  type TalentSeniority,
  type TalentWorkMode,
} from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  candidateAvailabilitySchema,
  jobSpecSchema,
  runMatchSchema,
  sendScoutMessageSchema,
  type JobSpec,
} from "@/lib/validations/hire";
import { runScoutTurn } from "@/features/hire/scout-conversation";
import { searchCandidates } from "@/features/hire/search-candidates";
import { explainMatches } from "@/features/hire/explain-matches";

type ActionOk<T> = { ok: true; data: T };
type ActionErr = { ok: false; message: string };
type ActionResult<T> = ActionOk<T> | ActionErr;

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
  if (!profile?.approved) {
    return { ok: false, message: "Recruiter access not approved yet." };
  }
  return { ok: true, data: { userId: session.user.id } };
}

function specToDb(spec: JobSpec) {
  return {
    // Empty means "not asked yet" — never a placeholder. A non-empty default
    // here made the title slot look answered, so Scout skipped the role
    // question and mis-filed the recruiter's first reply as the stack.
    title: spec.title?.trim() ?? "",
    seniority: (spec.seniority ?? null) as TalentSeniority | null,
    openings: spec.openings ?? 1,
    mustHaveStack: spec.mustHaveStack ?? [],
    niceToHaveStack: spec.niceToHaveStack ?? [],
    evidencePriority: spec.evidencePriority ?? [],
    salaryMin: spec.salaryMin ?? null,
    salaryMax: spec.salaryMax ?? null,
    salaryCurrency: spec.salaryCurrency ?? "INR",
    salaryPeriod: spec.salaryPeriod ?? "ANNUAL",
    workMode: (spec.workMode ?? null) as TalentWorkMode | null,
    locationCity: spec.locationCity ?? null,
    employmentType: (spec.employmentType ?? null) as TalentEmploymentType | null,
    noticePeriodDays: spec.noticePeriodDays ?? null,
    minExperience: spec.minExperience ?? null,
    maxExperience: spec.maxExperience ?? null,
    requiresDegree: spec.requiresDegree ?? false,
    extra: (spec.extra ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

function dbToSpec(row: {
  title: string;
  seniority: TalentSeniority | null;
  openings: number;
  mustHaveStack: string[];
  niceToHaveStack: string[];
  evidencePriority: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
  workMode: TalentWorkMode | null;
  locationCity: string | null;
  employmentType: TalentEmploymentType | null;
  noticePeriodDays: number | null;
  minExperience: number | null;
  maxExperience: number | null;
  requiresDegree: boolean;
  extra: unknown;
}): JobSpec {
  return jobSpecSchema.parse({
    // Empty stays empty so the role slot reads as unanswered (see specToDb).
    title: row.title.trim() || undefined,
    seniority: row.seniority,
    openings: row.openings,
    mustHaveStack: row.mustHaveStack,
    niceToHaveStack: row.niceToHaveStack,
    evidencePriority: row.evidencePriority,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    salaryPeriod: row.salaryPeriod === "MONTHLY" ? "MONTHLY" : "ANNUAL",
    workMode: row.workMode,
    locationCity: row.locationCity,
    employmentType: row.employmentType,
    noticePeriodDays: row.noticePeriodDays,
    minExperience: row.minExperience,
    maxExperience: row.maxExperience,
    requiresDegree: row.requiresDegree,
    extra:
      row.extra && typeof row.extra === "object"
        ? (row.extra as Record<string, unknown>)
        : null,
  });
}

export async function sendScoutMessageAction(
  input: unknown,
): Promise<
  ActionResult<{
    requestId: string;
    assistantMessage: string;
    options: { label: string; value: string }[];
    allowFreeText: boolean;
    readyToSearch: boolean;
    summary: string;
    spec: JobSpec;
    /** Engine instruction: run the search, or start a fresh brief. */
    action: "search" | "reset" | null;
  }>
> {
  const gate = await requireApprovedRecruiter();
  if (!gate.ok) return gate;
  const parsed = sendScoutMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Invalid message." };
  }

  const { message, display, requestId: existingId } = parsed.data;
  const userId = gate.data.userId;

  try {
    let requestId = existingId;
    let priorSpec: JobSpec = {};

    if (requestId) {
      const existing = await prisma.talentRequest.findFirst({
        where: { id: requestId, recruiterUserId: userId },
        select: {
          id: true,
          title: true,
          seniority: true,
          openings: true,
          mustHaveStack: true,
          niceToHaveStack: true,
          evidencePriority: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          salaryPeriod: true,
          workMode: true,
          locationCity: true,
          employmentType: true,
          noticePeriodDays: true,
          minExperience: true,
          maxExperience: true,
          requiresDegree: true,
          extra: true,
        },
      });
      if (!existing) return { ok: false, message: "Request not found." };
      priorSpec = dbToSpec(existing);
    } else {
      const created = await prisma.talentRequest.create({
        data: {
          recruiterUserId: userId,
          status: TalentRequestStatus.DRAFT,
          // Unset until the recruiter answers the role question.
          title: "",
        },
        select: { id: true },
      });
      requestId = created.id;
    }

    const historyRows = await prisma.talentRequestMessage.findMany({
      where: { requestId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
      take: 40,
    });

    await prisma.talentRequestMessage.create({
      data: {
        requestId,
        role: "user",
        // What the recruiter saw on the chip, not the machine value behind it.
        // A bubble reading "30" under a button labelled "Within 30 days" is not
        // the conversation they had. The engine still parses `message`.
        content: display ?? message,
      },
    });

    const turn = await runScoutTurn({
      priorSpec,
      history: historyRows.map((r) => ({
        role: r.role === "assistant" ? "assistant" : "user",
        content: r.content,
      })),
      userMessage: message,
    });

    const dbFields = specToDb(turn.spec);
    await prisma.talentRequest.update({
      where: { id: requestId },
      data: {
        ...dbFields,
        extra: dbFields.extra ?? Prisma.JsonNull,
      },
    });

    // What the recruiter sees live and what is replayed on reload must be the
    // same string. They were not: the stored copy prefixed the running summary,
    // so every reloaded bubble repeated it above the actual question.
    // A notice is Scout answering something or naming a limit; the question is
    // what comes next. Stored as one message so the reload replays exactly what
    // the recruiter saw.
    const assistantMessage = [turn.notice, turn.nextQuestion]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("\n\n") ||
      "That's everything I need. Ready to search verified talent.";

    await prisma.talentRequestMessage.create({
      data: {
        requestId,
        role: "assistant",
        content: assistantMessage,
        options: turn.options,
      },
    });

    revalidatePath("/hire");
    revalidatePath(`/hire/${requestId}`);

    return {
      ok: true,
      data: {
        requestId,
        assistantMessage,
        options: turn.options,
        allowFreeText: turn.allowFreeText,
        readyToSearch: turn.readyToSearch,
        summary: turn.summary,
        spec: turn.spec,
        action: turn.action ?? null,
      },
    };
  } catch (error) {
    logger.error("[hire] sendScoutMessageAction", { error: String(error) });
    return {
      ok: false,
      message:
        "Could not save message. Apply the hire migration on your Neon branch if tables are missing.",
    };
  }
}

export async function runMatchAction(
  input: unknown,
): Promise<
  ActionResult<{
    requestId: string;
    matchCount: number;
    overallGap: string;
  }>
> {
  const gate = await requireApprovedRecruiter();
  if (!gate.ok) return gate;
  const parsed = runMatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid request." };

  try {
    const req = await prisma.talentRequest.findFirst({
      where: {
        id: parsed.data.requestId,
        recruiterUserId: gate.data.userId,
      },
      select: {
        id: true,
        title: true,
        seniority: true,
        openings: true,
        mustHaveStack: true,
        niceToHaveStack: true,
        evidencePriority: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryPeriod: true,
        workMode: true,
        locationCity: true,
        employmentType: true,
        noticePeriodDays: true,
        minExperience: true,
        maxExperience: true,
        requiresDegree: true,
        extra: true,
      },
    });
    if (!req) return { ok: false, message: "Request not found." };

    const spec = dbToSpec(req);
    const search = await searchCandidates(spec, { limit: 20 });
    if (!search.ok) return search;

    const explained = await explainMatches(
      search.data.matches,
      search.data.nearMisses,
      spec,
      {
        totalEligible: search.data.totalEligible,
        belowEvidenceFloor: search.data.belowEvidenceFloor,
        coverageNote: search.data.coverage.note,
        stage: search.data.stage,
      },
    );

    await prisma.talentRequestMatch.deleteMany({
      where: { requestId: req.id },
    });

    if (explained.matches.length > 0) {
      await prisma.talentRequestMatch.createMany({
        data: explained.matches.map((m) => ({
          requestId: req.id,
          programMemberId: m.programMemberId,
          studentUserId: m.userId,
          score: m.score,
          tier: m.tier as TalentMatchTier,
          scoreBreakdown: m.scoreBreakdown as unknown as Prisma.InputJsonValue,
          evidence: m.evidence as unknown as Prisma.InputJsonValue,
          rationale: m.rationale,
          gaps: m.gaps,
          availabilityUnknown: m.availabilityUnknown,
        })),
      });
    }

    // Always promote to ACTIVE so demand board sees the requirement
    const status =
      explained.matches.length > 0
        ? TalentRequestStatus.MATCHED
        : TalentRequestStatus.ACTIVE;

    await prisma.talentRequest.update({
      where: { id: req.id },
      data: { status },
    });

    await prisma.talentRequestMessage.create({
      data: {
        requestId: req.id,
        role: "assistant",
        content: explained.overallGap,
      },
    });

    revalidatePath(`/hire/${req.id}`);
    revalidatePath("/admin/hire");

    return {
      ok: true,
      data: {
        requestId: req.id,
        matchCount: explained.matches.length,
        overallGap: explained.overallGap,
      },
    };
  } catch (error) {
    logger.error("[hire] runMatchAction", { error: String(error) });
    return {
      ok: false,
      message: "Match failed. Check migration and try again.",
    };
  }
}

export async function saveCandidateAvailabilityAction(
  input: unknown,
): Promise<ActionResult<{ openToWork: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "Please sign in." };
  }
  const parsed = candidateAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Please check availability fields." };
  }
  const v = parsed.data;
  try {
    await prisma.candidateAvailability.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        openToWork: v.openToWork,
        expectedSalaryMin: v.expectedSalaryMin ?? null,
        expectedSalaryMax: v.expectedSalaryMax ?? null,
        salaryCurrency: v.salaryCurrency ?? "INR",
        noticePeriodDays: v.noticePeriodDays ?? null,
        preferredWorkMode: (v.preferredWorkMode ?? null) as TalentWorkMode | null,
        preferredCities: (v.preferredCities ?? [])
          .map((c) =>
            c
              .trim()
              .replace(/\s+/g, " ")
              .replace(/\b\w/g, (ch) => ch.toUpperCase()),
          )
          .slice(0, 5),
        openToRelocate: v.openToRelocate ?? false,
      },
      update: {
        openToWork: v.openToWork,
        expectedSalaryMin: v.expectedSalaryMin ?? null,
        expectedSalaryMax: v.expectedSalaryMax ?? null,
        salaryCurrency: v.salaryCurrency ?? "INR",
        noticePeriodDays: v.noticePeriodDays ?? null,
        preferredWorkMode: (v.preferredWorkMode ?? null) as TalentWorkMode | null,
        preferredCities: (v.preferredCities ?? [])
          .map((c) =>
            c
              .trim()
              .replace(/\s+/g, " ")
              .replace(/\b\w/g, (ch) => ch.toUpperCase()),
          )
          .slice(0, 5),
        openToRelocate: v.openToRelocate ?? false,
      },
    });
    revalidatePath("/profile");
    revalidatePath("/program/dashboard");
    return { ok: true, data: { openToWork: v.openToWork } };
  } catch (error) {
    logger.error("[hire] saveCandidateAvailabilityAction", {
      error: String(error),
    });
    return {
      ok: false,
      message:
        "Could not save availability. Apply the hire migration if tables are missing.",
    };
  }
}

export async function requestCohortTrainAction(
  requestId: string,
): Promise<ActionResult<{ requestId: string }>> {
  const gate = await requireApprovedRecruiter();
  if (!gate.ok) return gate;
  if (!requestId) return { ok: false, message: "Missing request." };

  try {
    const updated = await prisma.talentRequest.updateMany({
      where: { id: requestId, recruiterUserId: gate.data.userId },
      data: {
        alertWhenAvailable: true,
        status: TalentRequestStatus.ACTIVE,
      },
    });
    if (updated.count === 0) {
      return { ok: false, message: "Request not found." };
    }
    revalidatePath(`/hire/${requestId}`);
    revalidatePath("/admin/hire");
    return { ok: true, data: { requestId } };
  } catch (error) {
    logger.error("[hire] requestCohortTrainAction", { error: String(error) });
    return { ok: false, message: "Could not save training request." };
  }
}
