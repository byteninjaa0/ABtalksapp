import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ScoutChat } from "@/components/hire/scout-chat";
import { MatchCard } from "@/components/hire/match-card";
import { GapReport } from "@/components/hire/gap-report";
import { jobSpecSchema, type JobSpec } from "@/lib/validations/hire";

type Props = { params: Promise<{ requestId: string }> };

export const metadata: Metadata = {
  title: "Scout search | ABTalks Hire",
};

export default async function HireRequestPage({ params }: Props) {
  const { requestId } = await params;
  const session = await auth();
  const userId = session!.user!.id;

  let request;
  try {
    request = await prisma.talentRequest.findFirst({
      where: { id: requestId, recruiterUserId: userId },
      select: {
        id: true,
        title: true,
        status: true,
        alertWhenAvailable: true,
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
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            content: true,
            options: true,
          },
          take: 50,
        },
        matches: {
          orderBy: { score: "desc" },
          select: {
            programMemberId: true,
            score: true,
            tier: true,
            rationale: true,
            gaps: true,
            availabilityUnknown: true,
            evidence: true,
            programMember: {
              select: {
                fullName: true,
                jobRole: true,
                company: true,
                shortlistedBy: {
                  where: { recruiterUserId: userId },
                  select: { id: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
  } catch {
    notFound();
  }

  if (!request) notFound();

  const spec: JobSpec = jobSpecSchema.parse({
    title: request.title,
    seniority: request.seniority,
    openings: request.openings,
    mustHaveStack: request.mustHaveStack,
    niceToHaveStack: request.niceToHaveStack,
    evidencePriority: request.evidencePriority,
    salaryMin: request.salaryMin,
    salaryMax: request.salaryMax,
    salaryCurrency: request.salaryCurrency,
    salaryPeriod: request.salaryPeriod === "MONTHLY" ? "MONTHLY" : "ANNUAL",
    workMode: request.workMode,
    locationCity: request.locationCity,
    employmentType: request.employmentType,
    noticePeriodDays: request.noticePeriodDays,
    minExperience: request.minExperience,
    maxExperience: request.maxExperience,
    requiresDegree: request.requiresDegree,
  });

  const messages = request.messages.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as
      | "user"
      | "assistant",
    content: m.content,
    options: Array.isArray(m.options)
      ? (m.options as { label: string; value: string }[])
      : null,
  }));

  const summary = [
    request.title,
    request.mustHaveStack.join(", "),
    request.seniority,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-10">
      <ScoutChat
        initialRequestId={request.id}
        initialMessages={messages}
        initialSpec={spec}
        initialSummary={summary || request.title}
      />

      <section className="space-y-4">
        <h2 className="font-display text-xl font-semibold">Results</h2>
        {request.matches.length === 0 ? (
          <GapReport
            requestId={request.id}
            overallGap={
              request.status === "DRAFT"
                ? "Search when you're ready — or keep chatting with Scout to refine the spec."
                : "No verified matches in the published pool for this requirement yet. Your demand is saved."
            }
            alertWhenAvailable={request.alertWhenAvailable}
          />
        ) : (
          <ul className="space-y-4">
            {request.matches.map((m, i) => {
              const evidence =
                m.evidence && typeof m.evidence === "object"
                  ? (m.evidence as MatchCardDataEvidence)
                  : {};
              return (
                <li key={`${m.programMemberId}-${i}`}>
                  <MatchCard
                    match={{
                      programMemberId: m.programMemberId,
                      fullName: m.programMember?.fullName ?? "Candidate",
                      jobRole: m.programMember?.jobRole ?? "—",
                      company: m.programMember?.company ?? "—",
                      score: m.score,
                      tier: m.tier,
                      rationale: m.rationale,
                      gaps: m.gaps,
                      availabilityUnknown: m.availabilityUnknown,
                      shortlisted: (m.programMember?.shortlistedBy?.length ?? 0) > 0,
                      evidence,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

type MatchCardDataEvidence = {
  skills?: string[];
  missionPoints?: number;
  cleanPassCount?: number;
  commitDayCount?: number;
  projectScores?: number[];
  yearsExperience?: number;
};
