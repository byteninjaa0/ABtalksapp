import type { Domain } from "@prisma/client";
import { prisma } from "@/lib/db";

export type ProfileUser = {
  email: string;
  image: string | null;
  createdAt: Date;
};

export type ProfileStudent = {
  fullName: string;
  college: string;
  graduationYear: number;
  domain: Domain;
  skills: string[];
  resumeUrl: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  githubUsername: string | null;
  referralCode: string;
  isReadyForInterview: boolean;
};

export async function getProfile(userId: string): Promise<{
  user: ProfileUser;
  profile: ProfileStudent | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      image: true,
      createdAt: true,
      studentProfile: {
        select: {
          fullName: true,
          college: true,
          graduationYear: true,
          domain: true,
          skills: true,
          resumeUrl: true,
          phone: true,
          linkedinUrl: true,
          githubUsername: true,
          referralCode: true,
          isReadyForInterview: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const { studentProfile, ...userFields } = user;

  return {
    user: userFields,
    profile: studentProfile,
  };
}
