"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Domain } from "@prisma/client";
import { BarChart3, BrainCircuit, Code2, Loader2, X } from "lucide-react";
import { type Resolver, Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { completeRegistrationAction } from "@/app/actions/registration-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  type RegisterInput,
  registerSchema,
} from "@/lib/validations/register";

const GRADUATION_YEARS = [2025, 2026, 2027, 2028, 2029, 2030] as const;

type Props = {
  initialName: string;
  initialRef: string;
};

const domainCards: {
  value: Domain;
  title: string;
  description: string;
  icon: typeof Code2;
  accent: string;
}[] = [
  {
    value: Domain.AI,
    title: "Artificial Intelligence",
    description: "Foundations and applied AI alongside the community.",
    icon: BrainCircuit,
    accent: "border-l-domains-ai",
  },
  {
    value: Domain.DS,
    title: "Data Science",
    description:
      "Data, analysis, and practical workflows from exploration to modeling.",
    icon: BarChart3,
    accent: "border-l-domains-ds",
  },
  {
    value: Domain.SE,
    title: "Software Engineering",
    description: "Build systems, APIs, and full-stack apps over 60 days.",
    icon: Code2,
    accent: "border-l-domains-se",
  },
];

export function RegistrationForm({ initialName, initialRef }: Props) {
  const router = useRouter();
  const [skillDraft, setSkillDraft] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(
      registerSchema,
    ) as Resolver<RegisterInput>,
    defaultValues: {
      fullName: initialName,
      college: "",
      graduationYear: 2026,
      domain: Domain.SE,
      skills: [],
      linkedinUrl: "",
      phone: "",
      githubUsername: "",
      referralCode: initialRef,
    },
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const skills = watch("skills") ?? [];
  const selectedDomain = watch("domain");

  function addSkillsFromDraft() {
    const parts = skillDraft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...skills];
    for (const p of parts) {
      if (next.length >= 10) break;
      const trimmed = p.slice(0, 50);
      if (trimmed && !next.includes(trimmed)) next.push(trimmed);
    }
    setValue("skills", next, { shouldValidate: true });
    setSkillDraft("");
  }

  function removeSkill(index: number) {
    setValue(
      "skills",
      skills.filter((_, i) => i !== index),
      { shouldValidate: true },
    );
  }

  async function onSubmit(values: RegisterInput) {
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("fullName", values.fullName);
      fd.append("college", values.college);
      fd.append("graduationYear", String(values.graduationYear));
      fd.append("domain", values.domain);
      fd.append("skills", values.skills.join(","));
      fd.append("linkedinUrl", values.linkedinUrl ?? "");
      fd.append("phone", values.phone ?? "");
      fd.append("githubUsername", values.githubUsername ?? "");
      fd.append("referralCode", values.referralCode ?? "");

      const res = await completeRegistrationAction(fd);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Welcome to ABTalks!");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          autoComplete="name"
          {...register("fullName")}
          aria-invalid={!!errors.fullName}
        />
        {errors.fullName ? (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="college">College</Label>
        <Input
          id="college"
          placeholder="e.g. IIT Delhi"
          {...register("college")}
          aria-invalid={!!errors.college}
        />
        {errors.college ? (
          <p className="text-sm text-destructive">{errors.college.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="graduationYear">Graduation year</Label>
        <Controller
          name="graduationYear"
          control={control}
          render={({ field }) => (
            <Select
              value={String(field.value)}
              onValueChange={(v) => {
                if (v != null) field.onChange(Number(v));
              }}
            >
              <SelectTrigger
                id="graduationYear"
                className="w-full min-w-0"
                aria-invalid={!!errors.graduationYear}
              >
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {GRADUATION_YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.graduationYear ? (
          <p className="text-sm text-destructive">
            {errors.graduationYear.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label>Domain</Label>
        <p className="text-sm text-muted-foreground">
          Choose your 60-day challenge track.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {domainCards.map(({ value, title, description, icon: Icon, accent }) => {
            const selected = selectedDomain === value;
            return (
              <Card
                key={value}
                role="button"
                tabIndex={0}
                onClick={() =>
                  setValue("domain", value, { shouldValidate: true })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setValue("domain", value, { shouldValidate: true });
                  }
                }}
                className={cn(
                  "cursor-pointer border-l-4 bg-card shadow-sm outline-none transition-transform hover:scale-[1.02] hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/25",
                  accent,
                  selected
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary/5"
                    : "border-border/60",
                )}
              >
                <CardHeader className="gap-3 pb-6">
                  <Icon
                    className={cn(
                      "size-10",
                      selected ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <CardTitle className="text-base leading-snug">{title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    {description}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
        {errors.domain ? (
          <p className="text-sm text-destructive">{errors.domain.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="skills">Skills</Label>
        <p className="text-xs text-muted-foreground">
          Comma-separated. Examples: Python, React, SQL (up to 10)
        </p>
        <Input
          id="skills"
          value={skillDraft}
          onChange={(e) => setSkillDraft(e.target.value)}
          onBlur={() => addSkillsFromDraft()}
          onKeyDown={(e) => {
            if (e.key === ",") {
              e.preventDefault();
              addSkillsFromDraft();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              addSkillsFromDraft();
            }
          }}
          placeholder="Type a skill, then comma or Enter"
          disabled={skills.length >= 10}
        />
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {skills.map((s, i) => (
              <Badge
                key={`${s}-${i}`}
                variant="secondary"
                className="gap-1 pr-1 font-normal"
              >
                {s}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  onClick={() => removeSkill(i)}
                  aria-label={`Remove ${s}`}
                >
                  <X className="size-3.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : null}
        {errors.skills ? (
          <p className="text-sm text-destructive">{errors.skills.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="linkedinUrl">LinkedIn URL (optional)</Label>
        <Input
          id="linkedinUrl"
          type="url"
          placeholder="https://www.linkedin.com/in/yourname"
          {...register("linkedinUrl")}
          aria-invalid={!!errors.linkedinUrl}
        />
        {errors.linkedinUrl ? (
          <p className="text-sm text-destructive">
            {errors.linkedinUrl.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          placeholder="+91 9876543210 or +1 555 123 4567"
          autoComplete="tel"
          {...register("phone")}
          aria-invalid={!!errors.phone}
        />
        <p className="text-xs text-muted-foreground">
          Optional. International format. Visible to admins only.
        </p>
        {errors.phone ? (
          <p className="text-sm text-destructive">{errors.phone.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="githubUsername">GitHub username (optional)</Label>
        <Input
          id="githubUsername"
          placeholder="yourname"
          {...register("githubUsername")}
          aria-invalid={!!errors.githubUsername}
        />
        {errors.githubUsername ? (
          <p className="text-sm text-destructive">
            {errors.githubUsername.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="referralCode">Referral code (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Got a referral code? Enter it here.
        </p>
        <Controller
          name="referralCode"
          control={control}
          render={({ field }) => (
            <Input
              id="referralCode"
              maxLength={6}
              placeholder="ABC123"
              className="font-mono uppercase"
              value={field.value}
              onChange={(e) => {
                const v = e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6);
                field.onChange(v);
              }}
              onBlur={field.onBlur}
              ref={field.ref}
              aria-invalid={!!errors.referralCode}
            />
          )}
        />
        {errors.referralCode ? (
          <p className="text-sm text-destructive">
            {errors.referralCode.message}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        className="inline-flex w-full items-center justify-center gap-2 sm:w-auto"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Submitting…
          </>
        ) : (
          "Complete Registration & Start Day 1"
        )}
      </Button>
    </form>
  );
}
