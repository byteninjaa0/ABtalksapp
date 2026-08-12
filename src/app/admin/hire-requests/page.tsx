import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { EngagementDecision } from "@/components/admin/engagement-decision";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Hire requests | Admin",
};

const OPEN_FIRST = [
  "SUBMITTED",
  "IN_REVIEW",
  "CONTACT_SHARED",
  "DECLINED",
  "CLOSED",
];

export default async function AdminHireRequestsPage() {
  await requireAdmin();

  const engagements = await prisma.talentEngagementRequest.findMany({
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      candidatePublicId: true,
      status: true,
      note: true,
      createdAt: true,
      submittedAt: true,
      source: true,
      recruiter: {
        select: {
          name: true,
          email: true,
          recruiterProfile: { select: { company: true } },
        },
      },
      request: { select: { title: true } },
      // Admin is the party that decides, so admin sees who the candidate is.
      programMember: {
        select: {
          id: true,
          fullName: true,
          jobRole: true,
          user: { select: { email: true } },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 30,
        select: { id: true, authorRole: true, body: true, createdAt: true },
      },
    },
  });

  const sorted = [...engagements].sort(
    (a, b) => OPEN_FIRST.indexOf(a.status) - OPEN_FIRST.indexOf(b.status),
  );
  const waiting = engagements.filter((e) => e.status === "SUBMITTED").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Hire requests
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {waiting > 0
            ? `${waiting} waiting on you.`
            : "Nothing waiting right now."}{" "}
          Recruiters see only the reference ID until you share contact.
        </p>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No requests yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((e) => (
            <li key={e.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold">
                    {e.candidatePublicId}
                    {e.programMember?.fullName
                      ? ` · ${e.programMember.fullName}`
                      : " · (candidate removed)"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {e.programMember?.jobRole ?? "—"}
                    {e.request?.title ? ` · for ${e.request.title}` : ""} ·{" "}
                    {e.source}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Asked by {e.recruiter?.name ?? e.recruiter?.email ?? "—"}
                    {e.recruiter?.recruiterProfile?.company
                      ? ` (${e.recruiter.recruiterProfile.company})`
                      : ""}{" "}
                    ·{" "}
                    {(e.submittedAt ?? e.createdAt).toISOString().slice(0, 10)}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                    e.status === "SUBMITTED"
                      ? "bg-amber-500/10 text-amber-900 dark:text-amber-100"
                      : e.status === "CONTACT_SHARED"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.status.replace("_", " ")}
                </span>
              </div>

              {e.messages.length > 0 && (
                <ul className="space-y-1.5">
                  {e.messages.map((m) => (
                    <li
                      key={m.id}
                      className={cn(
                        "rounded-md px-3 py-2 text-sm",
                        m.authorRole === "admin"
                          ? "bg-primary/5"
                          : "bg-muted",
                      )}
                    >
                      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {m.authorRole}
                      </span>
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
                </ul>
              )}

              <EngagementDecision engagementId={e.id} status={e.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
