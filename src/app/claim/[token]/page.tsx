import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { loadClaimPreview } from "@/features/resume/import/outreach";

/**
 * The claim link from the imported-profile emails (plan 171).
 *
 * PUBLIC on purpose — the person is not signed in yet. The signed token in
 * the URL is the only thing that opens it, and it signs nobody in: the button
 * goes to /login (which asks for the Terms and offers Google or an emailed
 * code), and that sign-in with the résumé's email is the claim. After it, the
 * person lands on /claim-profile, the existing "check your pre-filled
 * profile" screen.
 *
 * Shows only a masked email, name, headline, top skills and completeness —
 * never the phone, the full email or education.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Claim your Klymb AI profile",
  robots: { index: false, follow: false },
};

const SIGN_IN_HREF = "/login?from=%2Fclaim-profile";

type Props = { params: Promise<{ token: string }> };

function Shell({ title, description, children }: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="theme-klymb-light theme-klymb-brand flex min-h-svh flex-col bg-[#F4F4F4] text-foreground">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 bg-card text-card-foreground shadow-md">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="font-display text-2xl font-bold tracking-tight">{title}</CardTitle>
            <CardDescription className="text-base text-muted-foreground">{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function ClaimPage({ params }: Props) {
  const { token } = await params;
  const preview = await loadClaimPreview(token);

  if (preview.kind === "claimed") redirect(SIGN_IN_HREF);

  if (preview.kind === "invalid") {
    return (
      <Shell
        title="This link has expired"
        description="Sign in with the email on your résumé to reach your Klymb AI profile."
      >
        <Link href={SIGN_IN_HREF} className={cn(buttonVariants(), "w-full")}>
          Go to sign in
        </Link>
      </Shell>
    );
  }

  if (preview.kind === "gone") {
    return (
      <Shell title="This profile is no longer available" description="There is nothing to claim at this link.">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
          Go to Klymb AI
        </Link>
      </Shell>
    );
  }

  const firstName = preview.fullName.trim().split(/\s+/)[0] ?? "";

  return (
    <Shell
      title={firstName ? `${firstName}, your profile is ready` : "Your profile is ready"}
      description="Claim it to review what's there and add what's missing."
    >
      <div className="rounded-lg border border-border/60 p-4">
        <p className="font-semibold text-foreground">{preview.fullName}</p>
        {preview.headline ? (
          <p className="text-sm text-muted-foreground">{preview.headline}</p>
        ) : null}
        {preview.topSkills.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Top skills">
            {preview.topSkills.map((skill) => (
              <li key={skill} className="rounded-full bg-[#E8F4F5] px-2 py-0.5 text-xs font-medium text-[#006875]">
                {skill}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-sm text-foreground">
          Your profile is <strong>{preview.completeness.percent}%</strong> complete.
        </p>
      </div>

      <Link href={SIGN_IN_HREF} className={cn(buttonVariants(), "w-full")}>
        Claim my profile
      </Link>
      <p className="text-center text-sm text-muted-foreground">
        Sign in with <strong className="text-foreground">{preview.maskedEmail}</strong> — the email on
        your résumé — using Google or a code we email you.
      </p>

      <p className="pt-2 text-center text-xs text-muted-foreground">
        Not you, or don&apos;t want this profile?{" "}
        <Link href={`/claim/${encodeURIComponent(token)}/remove`} className="underline underline-offset-2">
          Remove my data
        </Link>
      </p>
    </Shell>
  );
}
