import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { ScoutChat } from "@/components/hire/scout-chat";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="space-y-8">
      <div className="space-y-2">
        {/* The step label says where this sits in a four-step flow — define,
            review matches, request, track — so the page is not a dead end. */}
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Step 1 · Define your requirement
        </p>
        <h2 className="font-display text-3xl font-bold tracking-tight">
          Tell us who you&apos;re looking for
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Describe the role in plain language. Scout asks a few follow-ups, then
          ranks candidates on work the platform actually verified — missions,
          commits, projects and interviews. Never resumes.
        </p>
      </div>

      <ScoutChat
        persist={persist}
        initialRequestId={null}
        initialMessages={[]}
        initialSpec={{}}
        initialSummary="Not started"
      />

      {recent.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Pick up where you left off
          </h3>
          <ul className="divide-y rounded-xl border bg-card">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/hire/${r.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.status} · {r.updatedAt.toISOString().slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : persist ? (
        <p className="text-center text-xs text-muted-foreground">
          No saved requirements yet. If send fails, apply the hire migration on
          a Neon branch first.
        </p>
      ) : null}

    </div>
  );
}
