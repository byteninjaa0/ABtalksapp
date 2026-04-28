"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { updateProfileAction } from "@/app/actions/profile-actions";
import {
  updateProfileSchema,
  type ProfileFormValues,
} from "@/lib/validations/profile";
import { useCallback, useState } from "react";

type Props = {
  initialProfile: ProfileFormValues;
};

export function ProfileForm({ initialProfile }: Props) {
  const router = useRouter();
  const [skillDraft, setSkillDraft] = useState("");

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      fullName: initialProfile.fullName,
      college: initialProfile.college,
      graduationYear: initialProfile.graduationYear,
      skills: initialProfile.skills ?? [],
      linkedinUrl: initialProfile.linkedinUrl ?? "",
      resumeUrl: initialProfile.resumeUrl ?? "",
      githubUsername: initialProfile.githubUsername ?? "",
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;

  const skills = watch("skills") ?? [];

  const addSkillsFromDraft = useCallback(() => {
    const parts = skillDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...skills];
    for (const p of parts) {
      if (next.length >= 10) break;
      if (!next.includes(p)) next.push(p);
    }
    setValue("skills", next, { shouldValidate: true, shouldDirty: true });
    setSkillDraft("");
  }, [skillDraft, skills, setValue]);

  const removeSkill = useCallback(
    (skill: string) => {
      setValue(
        "skills",
        skills.filter((s) => s !== skill),
        { shouldValidate: true, shouldDirty: true },
      );
    },
    [skills, setValue],
  );

  async function onSubmit(values: ProfileFormValues) {
    const fd = new FormData();
    fd.append("fullName", values.fullName);
    fd.append("college", values.college);
    fd.append("graduationYear", String(values.graduationYear));
    fd.append("skills", JSON.stringify(values.skills));
    fd.append("linkedinUrl", values.linkedinUrl ?? "");
    fd.append("resumeUrl", values.resumeUrl ?? "");
    fd.append("githubUsername", values.githubUsername ?? "");

    const result = await updateProfileAction(fd);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" autoComplete="name" {...register("fullName")} />
        {errors.fullName ? (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="college">College</Label>
        <Input id="college" {...register("college")} />
        {errors.college ? (
          <p className="text-sm text-destructive">{errors.college.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="graduationYear">Graduation year</Label>
        <Input
          id="graduationYear"
          type="number"
          min={2020}
          max={2035}
          {...register("graduationYear", { valueAsNumber: true })}
        />
        {errors.graduationYear ? (
          <p className="text-sm text-destructive">
            {errors.graduationYear.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label>Skills (max 10)</Label>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => (
            <Badge key={s} variant="secondary" className="gap-1 pr-1">
              {s}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-muted-foreground/20"
                onClick={() => removeSkill(s)}
                aria-label={`Remove ${s}`}
              >
                <X className="size-3.5" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input
            placeholder="Type skills, comma-separated, then Add"
            value={skillDraft}
            onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkillsFromDraft();
              }
            }}
            disabled={skills.length >= 10}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addSkillsFromDraft}
            disabled={skills.length >= 10}
          >
            Add
          </Button>
        </div>
        {errors.skills ? (
          <p className="text-sm text-destructive">{errors.skills.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedinUrl">LinkedIn URL (optional)</Label>
        <Input
          id="linkedinUrl"
          type="url"
          placeholder="https://www.linkedin.com/in/…"
          {...register("linkedinUrl")}
        />
        {errors.linkedinUrl ? (
          <p className="text-sm text-destructive">
            {errors.linkedinUrl.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="githubUsername">GitHub username (optional)</Label>
        <Input
          id="githubUsername"
          placeholder="octocat"
          autoComplete="username"
          {...register("githubUsername")}
        />
        {errors.githubUsername ? (
          <p className="text-sm text-destructive">
            {errors.githubUsername.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="resumeUrl">Resume Link</Label>
        <Input
          id="resumeUrl"
          type="url"
          placeholder="https://drive.google.com/... or LinkedIn resume URL"
          {...register("resumeUrl")}
        />
        <p className="text-xs text-muted-foreground">
          Visible to admins only. Paste a Google Drive, Dropbox, or LinkedIn-hosted
          resume link.
        </p>
        {errors.resumeUrl ? (
          <p className="text-sm text-destructive">{errors.resumeUrl.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
