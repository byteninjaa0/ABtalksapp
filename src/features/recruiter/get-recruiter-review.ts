import { prisma } from "@/lib/db";
import {
  parseCertifications,
  parseCodingChallenges,
  parseCompensation,
  parseEducation,
  parseExperience,
  parseLogistics,
  parseProjects,
  parseSkillGroups,
} from "@/lib/validations/recruiter";

function formatAssessmentDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export async function getRecruiterReview(userId: string) {
  const r = await prisma.recruiterReview.findUnique({
    where: { userId },
    select: {
      targetRole: true,
      skillGroups: true,
      education: true,
      certifications: true,
      languagesSpoken: true,
      achievements: true,
      headline: true,
      summary: true,
      experience: true,
      projects: true,
      communicationScore: true,
      programmingScore: true,
      behaviorScore: true,
      communicationFeedback: true,
      programmingFeedback: true,
      behaviorFeedback: true,
      codingChallenges: true,
      strengths: true,
      areasForGrowth: true,
      recommendation: true,
      assessmentDate: true,
      interviewerName: true,
      challengeRound: true,
      klymbId: true,
      logistics: true,
      compensation: true,
      adminNote: true,
      isPublished: true,
      shareToken: true,
    },
  });

  return {
    targetRole: r?.targetRole ?? "",
    skillGroups: parseSkillGroups(r?.skillGroups),
    education: parseEducation(r?.education),
    certifications: parseCertifications(r?.certifications),
    languagesSpoken: r?.languagesSpoken ?? [],
    achievements: r?.achievements ?? [],
    headline: r?.headline ?? "",
    summary: r?.summary ?? "",
    experience: parseExperience(r?.experience),
    projects: parseProjects(r?.projects),
    communicationScore: r?.communicationScore ?? null,
    programmingScore: r?.programmingScore ?? null,
    behaviorScore: r?.behaviorScore ?? null,
    communicationFeedback: r?.communicationFeedback ?? "",
    programmingFeedback: r?.programmingFeedback ?? "",
    behaviorFeedback: r?.behaviorFeedback ?? "",
    codingChallenges: parseCodingChallenges(r?.codingChallenges),
    strengths: r?.strengths ?? [],
    areasForGrowth: r?.areasForGrowth ?? [],
    recommendation: r?.recommendation ?? null,
    assessmentDate: formatAssessmentDate(r?.assessmentDate),
    interviewerName: r?.interviewerName ?? "",
    challengeRound: r?.challengeRound ?? "",
    klymbId: r?.klymbId ?? "",
    logistics: parseLogistics(r?.logistics),
    compensation: parseCompensation(r?.compensation),
    adminNote: r?.adminNote ?? "",
    isPublished: r?.isPublished ?? false,
    shareToken: r?.shareToken ?? null,
  };
}
