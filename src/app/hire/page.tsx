import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { isHireProPreviewEnabled, isVirtualCandidatesEnabled } from "@/lib/feature-flags";
import { ScoutChat } from "@/components/hire/scout-chat";

/**
 * Scout's turn is a blocking Server Action, and these pages host it.
 *
 * A turn is now up to ~11s of model time (see `deadlineMs` in scout-agent.ts —
 * OpenAI is slower per hop than Groq was) plus the pool query behind a search.
 * Vercel's default function budget is 10s, which would cut the action off
 * mid-search and hand the recruiter a 504 instead of cards. Server Actions
 * inherit the route's `maxDuration`, so it belongs here rather than on the
 * component that calls them.
 */
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "Scout | Hire with ABTalks",
  description:
    "Describe the role. Scout matches candidates by verified platform evidence — not resumes.",
};

export default async function HirePage() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const recruiter = userId
    ? await getRecruiterState(userId)
    : { status: "none" as const };
  const persist = recruiter.status === "approved";

  let recent: { id: string; title: string; status: string; updatedAt: Date }[] =
    [];
  if (userId) {
    try {
      recent = await prisma.talentRequest.findMany({
        where: { recruiterUserId: userId },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, status: true, updatedAt: true },
      });
    } catch {
      recent = [];
    }
  }

  return (
    <ScoutChat
      persist={persist}
      proPreview={isHireProPreviewEnabled()}
      virtualCandidates={isVirtualCandidatesEnabled()}
      initialRequestId={null}
      initialMessages={[]}
      initialSpec={{}}
      initialSummary="Not started"
      recent={recent.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        date: r.updatedAt.toISOString().slice(0, 10),
      }))}
    />
  );
}
