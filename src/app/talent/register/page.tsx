import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { RecruiterRegisterForm } from "@/components/talent/recruiter-register-form";

export default async function TalentRegisterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?from=/talent/register");

  const state = await getRecruiterState(session.user.id);
  // /hire, not /talent: the pool browser was removed, so an approved
  // recruiter was being sent to a 404 — which reads exactly like this
  // page having been deleted. Scout is where they actually work.
  if (state.status === "approved") redirect("/hire");
  if (state.status === "pending") redirect("/talent/pending");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Recruiter registration
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign up to browse AI Cohort graduates after cohort results are
          published. Access is free during the launch period.
        </p>
      </header>
      <RecruiterRegisterForm />
    </div>
  );
}
