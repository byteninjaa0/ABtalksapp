import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRecruiter } from "@/lib/program-auth";
import { ScoutChat } from "@/components/hire/scout-chat";
import { MatchResults } from "@/components/hire/match-results";
import { GapReport } from "@/components/hire/gap-report";
import { loadRequestMatches } from "@/features/hire/load-request-matches";
import { jobSpecSchema, type JobSpec } from "@/lib/validations/hire";

type Props = { params: Promise<{ requestId: string }> };

export const metadata: Metadata = {
  title: "Scout search | ABTalks Hire",
};

export default async function HireRequestPage({ params }: Props) {
  const { userId } = await requireRecruiter();
  const { requestId } = await params;

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
    extra:
      request.extra && typeof request.extra === "object"
        ? (request.extra as Record<string, unknown>)
        : undefined,
  });

  // What this recruiter has already asked about, so a card never offers to
  // request the same introduction twice.
  // Cards, cart count and engagement statuses all come from one scoped loader
  // shared with /hire/[requestId]/candidates.
  const matchData = await loadRequestMatches(requestId, userId);
  const matches = matchData?.matches ?? [];

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
        persist
        initialRequestId={request.id}
        initialMessages={messages}
        initialSpec={spec}
        initialSummary={summary || request.title}
      />

      <section id="hire-results" className="scroll-mt-20 space-y-4">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Step 2 · Matched profiles
        </p>
        <h2 className="font-display text-2xl font-bold tracking-tight">
          {matches.length > 0
            ? `${matches.length} matched candidate${matches.length === 1 ? "" : "s"}`
            : "No matches yet"}
        </h2>
        {matches.length === 0 ? (
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
          <>
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-100">
              <strong className="font-semibold">Privacy protected.</strong>{" "}
              Candidates are shown by reference ID. Names and contact details
              stay hidden until you place a request and our team confirms the
              engagement.
            </p>
            <MatchResults
              matches={matches}
              cartCount={matchData?.cartCount ?? 0}
              viewAllHref={`/hire/${requestId}/candidates`}
            />
          </>
        )}
      </section>
    </div>
  );
}
