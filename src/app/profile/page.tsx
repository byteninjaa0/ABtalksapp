import Link from "next/link";
import { redirect } from "next/navigation";
import { Domain } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import { auth } from "@/auth";
import { getProfile } from "@/features/profile/get-profile";
import { getReferralStats } from "@/features/profile/get-referral-stats";
import { AppHeader } from "@/components/shared/app-header";
import { ReferralCard } from "@/components/profile/referral-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SoundPreferences } from "@/components/profile/sound-preferences";
import { ProfileForm } from "./profile-form";
import type { ProfileFormValues } from "@/lib/validations/profile";

function domainDisplayName(domain: Domain) {
  switch (domain) {
    case Domain.SE:
      return "Software Engineering";
    case Domain.DS:
      return "Data Science";
    case Domain.AI:
      return "Artificial Intelligence";
    default:
      return domain;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0] + parts[1]![0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

function publicAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;
  const [bundle, referralStats] = await Promise.all([
    getProfile(userId),
    getReferralStats(userId),
  ]);

  const headerUser = {
    name: session.user.name ?? null,
    email: session.user.email ?? "",
    image: session.user.image ?? null,
    role: session.user.role ?? "STUDENT",
    isAdmin: session.user.isAdmin ?? false,
  };

  if (!bundle.profile) {
    return (
      <div className="flex min-h-svh flex-col">
        <AppHeader user={headerUser} />
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-12 text-center">
          <h1 className="font-display text-lg font-semibold">
            Complete your registration first
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your student profile is not set up yet. Registration will be available
            soon — for now you can return to the dashboard.
          </p>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "default" }), "mt-6")}
          >
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  const { user, profile } = bundle;
  const stats =
    referralStats ??
    ({
      referralCode: profile.referralCode,
      totalReferrals: 0,
      rewardedReferrals: 0,
      pendingReferrals: 0,
      currentBadge: "none" as const,
      nextBadge: { name: "Bronze", requiredCount: 1 },
      referrals: [],
    });

  const referralLink = `${publicAppUrl()}/register?ref=${encodeURIComponent(stats.referralCode)}`;

  const formDefaults: ProfileFormValues = {
    fullName: profile.fullName,
    college: profile.college,
    graduationYear: profile.graduationYear,
    skills: [...profile.skills],
    linkedinUrl: profile.linkedinUrl ?? "",
    resumeUrl: profile.resumeUrl ?? "",
    phone: profile.phone ?? "",
    githubUsername: profile.githubUsername ?? "",
  };

  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <AppHeader user={headerUser} domain={profile.domain} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Profile</h1>

        <SoundPreferences />

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <Card>
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center sm:flex-row sm:items-start sm:text-left">
              <Avatar size="lg" className="size-20 text-lg">
                {user.image ? (
                  <AvatarImage src={user.image} alt="" />
                ) : null}
                <AvatarFallback>{initials(profile.fullName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-2xl font-semibold tracking-tight">
                  {profile.fullName}
                </p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <Badge variant="secondary">
                    {domainDisplayName(profile.domain)}
                  </Badge>
                  {profile.isReadyForInterview ? (
                    <Badge className="bg-green-600 text-white hover:bg-green-600/90">
                      Ready for interview
                    </Badge>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Your information</CardTitle>
                <CardDescription>
                  Domain and email cannot be changed here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProfileForm initialProfile={formDefaults} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resume</CardTitle>
                <CardDescription>Visible to you and admins only.</CardDescription>
              </CardHeader>
              <CardContent>
                {profile.resumeUrl ? (
                  <Link
                    href={profile.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary underline"
                  >
                    View Resume <ExternalLink className="size-3.5" />
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No resume link added yet
                  </p>
                )}
              </CardContent>
            </Card>

            <ReferralCard
              referralCode={stats.referralCode}
              stats={stats}
              referralLink={referralLink}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
