import type { Metadata } from "next";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { isHireProPreviewEnabled, isVirtualCandidatesEnabled } from "@/lib/feature-flags";
import { ScoutChat } from "@/components/hire/scout-chat";

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
  const persist = recruiter.status === "active";

  let recent: {
    id: string;
    title: string;
    name: string | null;
    status: string;
    updatedAt: Date;
  }[] = [];
  // How many candidates the recruiter has shortlisted inside each project.
  //
  // Plan 133 scopes the header shortlist to the OPEN project, and bare /hire has
  // none — so an approved recruiter landing here saw a shortlist of zero and an
  // empty desk while `TalentRequestMatch` held their decisions. The rows were
  // never lost; this page simply had nothing to say about them. Counted per
  // project rather than summed, because merging them into one number would
  // recreate exactly the cross-project pooling plan 133 removed.
  let shortlistByRequest = new Map<string, number>();
  if (userId) {
    try {
      recent = await prisma.talentRequest.findMany({
        where: { recruiterUserId: userId, archivedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: {
          id: true,
          title: true,
          name: true,
          status: true,
          updatedAt: true,
        },
      });
      if (recent.length > 0) {
        const counts = await prisma.talentRequestMatch.groupBy({
          by: ["requestId"],
          where: {
            decision: "SHORTLISTED",
            requestId: { in: recent.map((r) => r.id) },
            // Belt and braces: `recent` is already this recruiter's own, but the
            // ownership predicate stays on the query that reads decisions.
            request: { recruiterUserId: userId },
          },
          _count: { _all: true },
        });
        shortlistByRequest = new Map(
          counts.map((c) => [c.requestId, c._count._all]),
        );
      }
    } catch {
      recent = [];
      shortlistByRequest = new Map();
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
        // A project created before the persistence migration has no `name`, and
        // one created by "New project" has an empty `title` until its first
        // search — so neither alone can label every row.
        title: r.name?.trim() || r.title.trim() || "Untitled project",
        status: r.status,
        date: r.updatedAt.toISOString().slice(0, 10),
        shortlisted: shortlistByRequest.get(r.id) ?? 0,
      }))}
    />
  );
}
