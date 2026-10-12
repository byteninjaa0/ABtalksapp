"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { JobType, JobWorkMode } from "@prisma/client";
import {
  createJobAction,
  updateJobAction,
} from "@/app/actions/admin-job-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Empty means "not specified": `Job.workMode` is nullable for that case. */
const WORK_MODES: { value: JobWorkMode | ""; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "On-site" },
];

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PART_TIME", label: "Part-time" },
];

type JobFormValues = {
  id: string;
  title: string;
  company: string;
  location: string;
  type: JobType;
  description: string;
  applyExternalUrl: string;
  skills: string[];
  workMode: JobWorkMode | "";
};

type Props =
  | { mode: "create" }
  | { mode: "edit"; job: JobFormValues };

export function JobForm(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial =
    props.mode === "edit"
      ? props.job
      : {
          id: "",
          title: "",
          company: "",
          location: "",
          type: "FULL_TIME" as JobType,
          description: "",
          applyExternalUrl: "",
          skills: [] as string[],
          workMode: "" as JobWorkMode | "",
        };

  const [title, setTitle] = useState(initial.title);
  const [company, setCompany] = useState(initial.company);
  const [location, setLocation] = useState(initial.location);
  const [type, setType] = useState<JobType>(initial.type);
  const [description, setDescription] = useState(initial.description);
  const [applyExternalUrl, setApplyExternalUrl] = useState(
    initial.applyExternalUrl,
  );
  // Held as the raw comma-separated string the admin is typing, so a trailing
  // comma mid-edit does not keep re-splitting under them. It is split on
  // submit and `normalizeSkills` on the server has the final say.
  const [skillsText, setSkillsText] = useState(initial.skills.join(", "));
  const [workMode, setWorkMode] = useState<JobWorkMode | "">(initial.workMode);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        title,
        company,
        location,
        type,
        description,
        applyExternalUrl,
        skills: skillsText
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        workMode,
      };

      if (props.mode === "create") {
        const result = await createJobAction(payload);
        if (result.ok) {
          toast.success("Job posted");
          router.push(`/admin/jobs/${result.data.id}`);
          router.refresh();
          return;
        }
        toast.error(result.message);
        return;
      }

      const result = await updateJobAction({
        jobId: props.job.id,
        ...payload,
      });
      if (result.ok) {
        toast.success("Job updated");
        router.refresh();
        return;
      }
      toast.error(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border p-4">
      <h2 className="font-display text-lg font-semibold">
        {props.mode === "create" ? "Post a new job" : "Edit job"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="job-title">Title *</Label>
          <Input
            id="job-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-company">Company *</Label>
          <Input
            id="job-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-location">Location</Label>
          <Input
            id="job-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={pending}
            placeholder="Remote, Bangalore, …"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-type">Type</Label>
          <select
            id="job-type"
            value={type}
            onChange={(e) => setType(e.target.value as JobType)}
            disabled={pending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {JOB_TYPES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-work-mode">Work mode</Label>
          <select
            id="job-work-mode"
            value={workMode}
            onChange={(e) => setWorkMode(e.target.value as JobWorkMode | "")}
            disabled={pending}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {WORK_MODES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="job-skills">Skills</Label>
          <Input
            id="job-skills"
            value={skillsText}
            onChange={(e) => setSkillsText(e.target.value)}
            disabled={pending}
            placeholder="React, Node.js, SQL"
          />
          <p className="text-xs text-muted-foreground">
            Comma separated. Candidates&apos; job alerts match on these, so a
            job posted without them reaches almost nobody.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="job-description">Description *</Label>
          <Textarea
            id="job-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            disabled={pending}
            className="min-h-[160px]"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="job-external-url">External apply URL (optional)</Label>
          <Input
            id="job-external-url"
            type="url"
            value={applyExternalUrl}
            onChange={(e) => setApplyExternalUrl(e.target.value)}
            disabled={pending}
            placeholder="https://company.com/careers/…"
          />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : props.mode === "create"
            ? "Post job"
            : "Save changes"}
      </Button>
    </form>
  );
}
