"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { PRACTICE_MAX_SOURCE_CHARS } from "@/features/practice/constants";
import {
  recordPracticeAttempt,
  type RecordPracticeAttemptResult,
} from "@/features/practice/record-practice-attempt";

const submitPracticeAttemptSchema = z.object({
  problemId: z.string().min(1),
  sourceCode: z.string().min(1).max(PRACTICE_MAX_SOURCE_CHARS),
  reported: z
    .array(z.object({ ordinal: z.number().int().positive(), passed: z.boolean() }))
    .min(1)
    .max(50),
  runtimeMs: z.number().int().nonnegative().max(600_000).optional(),
});

export async function submitPracticeAttemptAction(input: {
  problemId: string;
  sourceCode: string;
  reported: { ordinal: number; passed: boolean }[];
  runtimeMs?: number;
}): Promise<RecordPracticeAttemptResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, message: "You must be signed in." };
  }

  const parsed = submitPracticeAttemptSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const result = await recordPracticeAttempt({
    userId: session.user.id,
    problemId: parsed.data.problemId,
    sourceCode: parsed.data.sourceCode,
    reported: parsed.data.reported,
    runtimeMs: parsed.data.runtimeMs,
  });

  if (result.ok && result.data.isFirstSolve) {
    revalidatePath("/dashboard/practice");
  }

  return result;
}
