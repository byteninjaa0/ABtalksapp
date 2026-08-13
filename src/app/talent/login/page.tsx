import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RecruiterLoginForm } from "@/components/talent/recruiter-login-form";

export const metadata: Metadata = {
  title: "Recruiter sign-in | ABTalks",
  description:
    "Sign in to ABTalks Hire with your work email. Verified companies only.",
};

type Props = { searchParams: Promise<{ from?: string }> };

/** Same-origin `from`, or the portal. */
function safeFrom(from: string | undefined): string {
  if (!from || !from.startsWith("/") || from.startsWith("//")) return "/hire";
  return from;
}

export default async function RecruiterLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectTo = safeFrom(params.from);

  // Already signed in — there is nothing to do here.
  const session = await auth();
  if (session?.user?.id) redirect(redirectTo);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-background p-6">
      <Card className="w-full max-w-md border-border/60 shadow-md">
        <CardHeader className="space-y-2 text-center">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            ABTalks Hire
          </p>
          <CardTitle className="font-display text-2xl font-bold tracking-tight">
            Sign in to hire
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Rank candidates on verified work, not resumes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecruiterLoginForm redirectTo={redirectTo} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Looking for the candidate side?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Sign in as a candidate
        </Link>
      </p>
    </div>
  );
}
