import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { setReferralCookie } from "@/app/actions/referral-actions";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { LoginClient } from "./login-client";

type Props = {
  searchParams: Promise<{ from?: string; ref?: string }>;
};

function resolveRedirectTo(from: string | undefined) {
  if (!from || !from.startsWith("/") || from.startsWith("//")) {
    return "/dashboard";
  }
  return from;
}

/** Preserve invite ref in URL when sending OAuth-incomplete users to register. */
function registerHrefWithRef(refRaw: string | undefined): string {
  if (typeof refRaw !== "string" || refRaw.trim() === "") {
    return "/register";
  }
  const normalized = refRaw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  if (normalized.length === 6 && /^[A-Z0-9]{6}$/.test(normalized)) {
    return `/register?ref=${encodeURIComponent(normalized)}`;
  }
  return "/register";
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const redirectTo = resolveRedirectTo(params.from);

  const session = await auth();
  if (session?.user?.id) {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    const enrollment = await prisma.enrollment.findFirst({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (profile && enrollment) {
      redirect(redirectTo);
    }

    redirect(registerHrefWithRef(params.ref));
  }

  const refRaw = params.ref;
  const normalizedRef =
    typeof refRaw === "string"
      ? refRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
      : "";
  if (normalizedRef && /^[A-Z0-9]{6}$/.test(normalizedRef)) {
    await setReferralCookie(normalizedRef);
  }
  const referralRef =
    typeof params.ref === "string" && params.ref.trim() !== ""
      ? params.ref.trim()
      : undefined;

  const showGoogle = Boolean(process.env.AUTH_GOOGLE_ID);
  const showDev = process.env.ENABLE_DEV_AUTH === "true";

  return (
    <div className="flex min-h-svh flex-col bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/60 shadow-md">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="font-display text-3xl font-bold tracking-tight">
              <span className="text-primary">A</span>Btalks
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Build your coding habit. Get discovered.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginClient
              showGoogle={showGoogle}
              showDev={showDev}
              redirectTo={redirectTo}
              referralRef={referralRef}
            />
          </CardContent>
        </Card>
        <p className="mt-8 max-w-md text-center text-xs text-muted-foreground">
          Built by Anil Bajpai&apos;s ABTalks community
        </p>
      </div>
    </div>
  );
}
