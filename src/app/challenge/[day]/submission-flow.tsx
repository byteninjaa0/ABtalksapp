"use client";

import { useState } from "react";
import Link from "next/link";
import type { DailyTask, Domain } from "@prisma/client";
import { Flame } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  submitGithubStepAction,
  submitLinkedinStepAction,
} from "@/app/actions/submission-actions";

type Props = {
  dayNumber: number;
  task: Pick<DailyTask, "title" | "problemStatement">;
  userDomain: Domain;
};

export function SubmissionFlow({ dayNumber, task, userDomain }: Props) {
  const [step, setStep] = useState<"github" | "linkedin" | "success">("github");
  const [githubUrl, setGithubUrl] = useState("");
  /** Snapshot from server when entering step 2 — used for reset only. */
  const [originalLinkedinTemplate, setOriginalLinkedinTemplate] =
    useState("");
  const [editableTemplate, setEditableTemplate] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successStreak, setSuccessStreak] = useState(0);
  const [successDaysCompleted, setSuccessDaysCompleted] = useState(0);

  async function handleGithubSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("githubUrl", githubUrl);
      fd.append("dayNumber", String(dayNumber));
      const res = await submitGithubStepAction(fd);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message);
        return;
      }
      setGithubUrl(res.githubUrl);
      setOriginalLinkedinTemplate(res.linkedinTemplate);
      setEditableTemplate(res.linkedinTemplate);
      setStep("linkedin");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLinkedinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("githubUrl", githubUrl);
      fd.append("linkedinUrl", linkedinUrl);
      fd.append("dayNumber", String(dayNumber));
      const res = await submitLinkedinStepAction(fd);
      if (!res.ok) {
        setError(res.message);
        toast.error(res.message);
        return;
      }
      setSuccessStreak(res.newStreak);
      setSuccessDaysCompleted(res.daysCompleted);
      setStep("success");
      toast.success(`Day ${dayNumber} complete!`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyTemplate() {
    try {
      await navigator.clipboard.writeText(editableTemplate);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy — select the text manually");
    }
  }

  const templateTooShort = editableTemplate.length < 50;

  if (step === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            🎉 Day {dayNumber} complete!
          </CardTitle>
          <CardDescription>
            Nice work — your streak and progress are updated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
            <Flame className="size-8 shrink-0 text-orange-500" aria-hidden />
            <div>
              <p className="text-sm text-muted-foreground">Current streak</p>
              <p className="text-2xl font-semibold tabular-nums">
                {successStreak}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Days completed: {successDaysCompleted} / 60
          </p>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "default" }),
              "inline-flex w-full justify-center sm:w-auto",
            )}
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (step === "linkedin") {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{task.title}</CardTitle>
            <CardDescription>
              Step 2 of 2: Share on LinkedIn
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Post text</CardTitle>
            <CardDescription>
              1. Copy this text · 2. Post it on LinkedIn · 3. Paste the post URL
              below
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Textarea
                  value={editableTemplate}
                  onChange={(e) => setEditableTemplate(e.target.value)}
                  className="min-h-[200px] resize-y border-input bg-background text-sm text-foreground shadow-sm"
                  aria-label="LinkedIn post template"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0 sm:mt-0"
                  onClick={() => void copyTemplate()}
                >
                  Copy to clipboard
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Feel free to edit before posting — add your own thoughts or
                personal touches
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm tabular-nums text-muted-foreground">
                  {editableTemplate.length} characters
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() =>
                    setEditableTemplate(originalLinkedinTemplate)
                  }
                >
                  Reset to original
                </Button>
              </div>
            </div>

            <form onSubmit={handleLinkedinSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn post URL</Label>
                <Input
                  id="linkedinUrl"
                  name="linkedinUrl"
                  type="url"
                  placeholder="https://www.linkedin.com/posts/…"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  autoComplete="off"
                  disabled={isSubmitting}
                  aria-invalid={!!error}
                />
              </div>
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={isSubmitting || templateTooShort}
              >
                {isSubmitting ? "Submitting…" : "Submit & complete day"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{task.title}</CardTitle>
          <CardDescription>
            Day {dayNumber} · {userDomain}
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-none space-y-3 text-sm leading-relaxed whitespace-pre-wrap [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
          <ReactMarkdown>{task.problemStatement}</ReactMarkdown>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit your solution</CardTitle>
          <CardDescription>
            Paste the URL of your public GitHub repository for this day&apos;s
            work.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGithubSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="githubUrl">GitHub repository URL</Label>
              <Input
                id="githubUrl"
                name="githubUrl"
                type="url"
                placeholder="https://github.com/you/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                autoComplete="off"
                disabled={isSubmitting}
                aria-invalid={!!error}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Checking…" : "Validate & continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
