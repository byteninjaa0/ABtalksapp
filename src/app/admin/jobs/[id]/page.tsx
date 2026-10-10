import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { JobForm } from "@/components/admin/job-form";
import { JobAdminControls } from "@/components/admin/job-admin-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatDateTimeIST } from "@/lib/date-utils";
import { getJobApplicants } from "@/features/jobs/get-job-applicants";
import type { JobType } from "@prisma/client";

function jobTypeLabel(type: JobType): string {
  switch (type) {
    case "FULL_TIME":
      return "Full-time";
    case "INTERNSHIP":
      return "Internship";
    case "CONTRACT":
      return "Contract";
    case "PART_TIME":
      return "Part-time";
    default:
      return type;
  }
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminJobDetailPage({ params }: PageProps) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      company: true,
      location: true,
      type: true,
      description: true,
      applyExternalUrl: true,
      isOpen: true,
      skills: true,
      workMode: true,
    },
  });

  if (!job) {
    notFound();
  }

  const applicants = await getJobApplicants(id);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/admin/jobs"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2")}
          >
            ← All jobs
          </Link>
          <h1 className="font-display text-3xl font-bold">{job.title}</h1>
          <p className="text-sm text-muted-foreground">
            {job.company} · {jobTypeLabel(job.type)}
          </p>
        </div>
        <Badge variant={job.isOpen ? "default" : "secondary"}>
          {job.isOpen ? "Open" : "Closed"}
        </Badge>
      </div>

      <JobAdminControls jobId={job.id} isOpen={job.isOpen} />

      <JobForm
        mode="edit"
        job={{
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location ?? "",
          type: job.type,
          description: job.description,
          applyExternalUrl: job.applyExternalUrl ?? "",
          skills: job.skills,
          workMode: job.workMode ?? "",
        }}
      />

      <div className="space-y-4">
        <h2 className="font-display text-xl font-semibold">
          Applicants ({applicants.length})
        </h2>

        {applicants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {applicants.map((a) => {
                const name =
                  a.user.studentProfile?.fullName?.trim() || a.user.email;
                return (
                  <li key={a.id} className="rounded-xl border p-4 text-sm">
                    <Link
                      href={`/admin/students/${a.user.id}`}
                      className="font-medium text-primary underline"
                    >
                      {name}
                    </Link>
                    <p className="text-muted-foreground">{a.user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Applied {formatDateTimeIST(a.createdAt)}
                    </p>
                    {a.note ? (
                      <p className="mt-2 text-sm">{a.note}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="hidden rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Applied</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applicants.map((a) => {
                    const name =
                      a.user.studentProfile?.fullName?.trim() || a.user.email;
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Link
                            href={`/admin/students/${a.user.id}`}
                            className="text-primary underline"
                          >
                            {name}
                          </Link>
                        </TableCell>
                        <TableCell>{a.user.email}</TableCell>
                        <TableCell>{formatDateTimeIST(a.createdAt)}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {a.note ?? "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
