import { requireProgramMember } from "@/lib/program-auth";
import { getMemberDashboard } from "@/features/program/dashboard";
import { getMemberAtRiskStatus } from "@/features/program/commits";
import { getMemberProjectsSummary } from "@/features/program/projects";
import { getMemberRecommendation } from "@/features/program/recommendations";
import { getInterviewDashboardCard } from "@/features/program/interview";
import { ProgramDashboardView } from "@/components/program/program-dashboard-view";
import { AvailabilityForm } from "@/components/hire/availability-form";
import { VisibilityToggle } from "@/components/program/visibility-toggle";
import { prisma } from "@/lib/db";

export default async function ProgramDashboardPage() {
  const { member, cohort, userId } = await requireProgramMember();
  const [data, atRisk, projects, aiRec, interviewCard, availability, visibility] =
    await Promise.all([
      getMemberDashboard(member.id, cohort.id),
      getMemberAtRiskStatus(member.id, cohort.id),
      getMemberProjectsSummary(member.id),
      getMemberRecommendation(member.id),
      getInterviewDashboardCard(member.id),
      prisma.candidateAvailability
        .findUnique({
          where: { userId },
          select: {
            openToWork: true,
            expectedSalaryMin: true,
            expectedSalaryMax: true,
            salaryCurrency: true,
            noticePeriodDays: true,
            preferredWorkMode: true,
            preferredCities: true,
            openToRelocate: true,
          },
        })
        .catch(() => null),
      prisma.programMember.findUnique({
        where: { id: member.id },
        select: { recruiterVisibilityConsentAt: true },
      }),
    ]);

  if (!data) {
    return (
      <p className="text-sm text-[#9CA3AF]">Dashboard unavailable.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-white text-foreground">
        <VisibilityToggle
          initial={visibility?.recruiterVisibilityConsentAt != null}
        />
      </div>
      <div className="rounded-xl border border-white/10 bg-white text-foreground">
        <AvailabilityForm
          initial={
            availability
              ? {
                  openToWork: availability.openToWork,
                  expectedSalaryMin: availability.expectedSalaryMin,
                  expectedSalaryMax: availability.expectedSalaryMax,
                  salaryCurrency: availability.salaryCurrency,
                  noticePeriodDays: availability.noticePeriodDays,
                  preferredWorkMode: availability.preferredWorkMode,
                  preferredCities: availability.preferredCities,
                  openToRelocate: availability.openToRelocate,
                }
              : null
          }
        />
      </div>
      <ProgramDashboardView
        data={data}
        atRisk={atRisk}
        projects={projects}
        aiRec={aiRec}
        interviewCard={interviewCard}
      />
    </div>
  );
}
