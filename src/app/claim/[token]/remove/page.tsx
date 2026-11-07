import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RemoveForm } from "./remove-form";

/**
 * "Remove my data" confirmation for an imported profile (plan 171). PUBLIC:
 * the signed token is checked again by the action, so this page only renders
 * the question. Passes nothing but the token string to the client form.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Remove my data — Klymb AI",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ token: string }> };

export default async function RemovePage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="theme-klymb-light theme-klymb-brand flex min-h-svh flex-col bg-[#F4F4F4] text-foreground">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 bg-card text-card-foreground shadow-md">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="font-display text-2xl font-bold tracking-tight">Remove my data</CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              This hides the profile built from your résumé from recruiters straight away and stops
              all emails about it. We then delete the rest of your data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RemoveForm token={token} />
            <p className="text-center text-xs text-muted-foreground">
              Changed your mind?{" "}
              <Link href={`/claim/${encodeURIComponent(token)}`} className="underline underline-offset-2">
                Go back
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
