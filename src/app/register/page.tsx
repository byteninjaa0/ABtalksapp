import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegistrationForm } from "./registration-form";

type PageProps = {
  searchParams: Promise<{ ref?: string }>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      studentProfile: { select: { id: true } },
      enrollments: {
        take: 1,
        orderBy: { startedAt: "desc" },
        select: { id: true },
      },
    },
  });

  if (user?.studentProfile && user.enrollments[0]) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const refParam = params.ref;
  const initialRef =
    typeof refParam === "string"
      ? refParam.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)
      : "";

  const initialName = session.user.name?.trim() ?? "";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Welcome to ABtalks! Complete your profile to start your 60-day
            journey.
          </CardTitle>
          <CardDescription>
            You&apos;re signed in as{" "}
            <span className="font-medium text-foreground">
              {session.user.email ?? session.user.id}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrationForm
            initialName={initialName}
            initialRef={initialRef}
          />
        </CardContent>
      </Card>
    </div>
  );
}
