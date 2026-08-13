import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { RecruiterRegisterForm } from "@/components/talent/recruiter-register-form";
import { RecruiterLoginForm } from "@/components/talent/recruiter-login-form";

export const metadata: Metadata = {
  title: "Recruiter access | ABTalks",
  description:
    "Register to hire on ABTalks, or sign in with your work email. No password, no Google account.",
};

type Props = { searchParams: Promise<{ from?: string }> };

function safeFrom(from: string | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/hire";
  return from;
}

/**
 * The recruiter door. Public, and deliberately both halves on one screen:
 * register on top for anyone new, sign in beneath for anyone we have already
 * verified. A first-time recruiter should never have to guess which page they
 * are supposed to be on.
 */
export default async function TalentRegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectTo = safeFrom(params.from);

  const session = await auth();
  if (session?.user?.id) {
    const state = await getRecruiterState(session.user.id);
    if (state.status === "approved") redirect(redirectTo);
    if (state.status === "pending") redirect("/talent/pending");
  }

  return (
    <div className="mx-auto max-w-md space-y-10 py-4">
      <header className="space-y-2 text-center">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          ABTalks Hire
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Recruiter access
        </h1>
        <p className="text-sm text-muted-foreground">
          Rank candidates on verified work, not resumes.
        </p>
      </header>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">
            New here? Register
          </h2>
          <p className="text-sm text-muted-foreground">
            We verify your email, then someone from ABTalks confirms your
            company before access opens.
          </p>
        </div>
        <RecruiterRegisterForm />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs tracking-wide text-muted-foreground uppercase">
            Already registered
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Sign in</h2>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you a code. No password, no Google account.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <RecruiterLoginForm redirectTo={redirectTo} />
        </div>
      </section>
    </div>
  );
}
