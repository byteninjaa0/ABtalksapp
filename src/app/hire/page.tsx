import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
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
  const userId = session!.user!.id;

  let recent: { id: string; title: string; status: string; updatedAt: Date }[] =
    [];
  try {
    recent = await prisma.talentRequest.findMany({
      where: { recruiterUserId: userId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, updatedAt: true },
    });
  } catch {
    // Tables may not exist until migration is applied on Neon branch.
    recent = [];
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2 text-center sm:text-left">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Find people by what they shipped
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Scout asks a few high-signal questions, then ranks consenting cohort
          members by missions, projects, commits, and interviews. If nobody
          matches yet, your requirement is saved as demand so we can train for
          it.
        </p>
      </div>

      <ScoutChat
        initialRequestId={null}
        initialMessages={[]}
        initialSpec={{}}
        initialSummary="Not started"
      />

      {recent.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Your recent requirements
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
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          No saved requirements yet. If send fails, apply the hire migration on
          a Neon branch first.
        </p>
      )}

      <p className="text-center">
        <Link
          href="/talent"
          className={cn(buttonVariants({ variant: "link", size: "sm" }))}
        >
          Prefer browsing the full pool?
        </Link>
      </p>
    </div>
  );
}
