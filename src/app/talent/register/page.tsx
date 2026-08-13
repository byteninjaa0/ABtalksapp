import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { RecruiterRegisterForm } from "@/components/talent/recruiter-register-form";
import { findLiveSeat } from "@/features/recruiter-auth/otp";

export default async function TalentRegisterPage() {
  const session = await auth();
  // The recruiter door, not the candidate one.
  if (!session?.user?.id) redirect("/talent/login?from=/talent/register");

  const state = await getRecruiterState(session.user.id);
  // /hire, not /talent: the pool browser was removed, so an approved
  // recruiter was being sent to a 404 — which reads exactly like this
  // page having been deleted. Scout is where they actually work.
  if (state.status === "approved") redirect("/hire");
  if (state.status === "pending") redirect("/talent/pending");

  // Reached only after the emailed code proved this address, so the company is
  // already known — it comes from the verified seat, not from a field anyone
  // can type into.
  const seat = session.user.email
    ? await findLiveSeat(session.user.email)
    : null;
  if (!seat) redirect("/talent/login");

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2 text-center">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          Last step
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Finish setting up
        </h1>
        <p className="text-sm text-muted-foreground">
          {session.user.email} is verified for{" "}
          <span className="font-medium text-foreground">{seat.company}</span>.
          Tell us who you are and you&apos;re in.
        </p>
      </header>
      <RecruiterRegisterForm
        company={seat.company}
        defaultFullName={seat.contactName ?? ""}
      />
    </div>
  );
}
