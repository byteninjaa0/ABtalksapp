import Link from "next/link";
import { Clock } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function TalentPendingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/talent/register");

  const state = await getRecruiterState(session.user.id);
  if (state.status === "none") redirect("/talent/register");
  // /hire, not /talent: the pool browser was removed, so an approved
  // recruiter was being sent to a 404 — which reads exactly like this
  // page having been deleted. Scout is where they actually work.
  if (state.status === "approved") redirect("/hire");

  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Clock className="size-7 text-primary" />
      </div>
      <header className="space-y-2">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Application received
        </h1>
        <p className="text-sm text-muted-foreground">
          Thanks, {state.fullName}. We&apos;re reviewing your recruiter
          application for {state.company}. You&apos;ll receive an email once
          approved.
        </p>
      </header>
      <Link href="/program" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to program
      </Link>
    </div>
  );
}
