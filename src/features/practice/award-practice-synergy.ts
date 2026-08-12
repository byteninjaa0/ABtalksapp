import type { Prisma } from "@prisma/client";

export async function awardPracticeSynergy(
  tx: Prisma.TransactionClient,
  args: {
    userId: string;
    points: number;
  },
): Promise<number> {
  await tx.synergyEvent.create({
    data: {
      userId: args.userId,
      points: args.points,
      type: "PRACTICE",
      submissionId: null,
      enrollmentId: null,
      dayNumber: null,
      rankAtAward: null,
    },
  });
  await tx.studentProfile.updateMany({
    where: { userId: args.userId },
    data: { synergyPoints: { increment: args.points } },
  });
  return args.points;
}
