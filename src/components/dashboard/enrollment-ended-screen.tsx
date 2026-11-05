import { AlertOctagon } from "lucide-react";
import { signOutAction } from "@/app/actions/auth-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateIST } from "@/lib/date-utils";

interface EnrollmentEndedScreenProps {
  studentName: string;
  adminName: string;
  reason: string | null;
  endedAt: Date;
}

export function EnrollmentEndedScreen({
  studentName,
  adminName,
  reason,
  endedAt,
}: EnrollmentEndedScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <AlertOctagon className="mb-2 size-10 text-muted-foreground" />
          <CardTitle className="font-display text-2xl">Your Enrollment Has Ended</CardTitle>
          <p className="text-sm text-muted-foreground">
            {adminName} ended your enrollment on {formatDateIST(endedAt)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Hi {studentName},</p>
          {reason ? (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
              <span className="font-medium">Reason from admin: </span>
              {reason}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">
            You no longer have access to the daily challenge. Your submissions and
            progress remain in your account, but you cannot continue the challenge.
          </p>
          <p className="text-sm">
            If you believe this is an error, please contact support:{" "}
            <a className="text-primary underline" href="mailto:team@klymb.ai">
              team@klymb.ai
            </a>
          </p>
          <form action={signOutAction}>
            <Button type="submit">Sign Out</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
