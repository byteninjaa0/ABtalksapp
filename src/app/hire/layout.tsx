import type { ReactNode } from "react";
import { auth } from "@/auth";
import { getRecruiterState } from "@/features/talent-pool/recruiter-registration";
import { getRecruiterAccountSnapshot } from "@/features/hire/recruiter-account";
import { HireAuthProvider } from "@/components/hire/hire-auth-provider";
import { HireChrome } from "@/components/hire/hire-chrome";
import { MergeGuestCart } from "@/components/hire/merge-guest-cart";

export default async function HireLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const state = userId ? await getRecruiterState(userId) : { status: "none" as const };
  const approved = state.status === "approved";
  const pending = state.status === "pending";
  const account = userId && approved ? await getRecruiterAccountSnapshot(userId) : null;

  return (
    <HireAuthProvider
      approved={approved}
      signedIn={Boolean(userId)}
      pending={pending}
    >
      {/* Also for a recruiter still awaiting approval: they registered
          *because* they wanted specific candidates, and that ask lives in
          sessionStorage until it is recorded. Approval arrives hours later in
          another session, by which time it is gone. */}
      {(approved || pending) && <MergeGuestCart />}
      <HireChrome
        account={account}
        serverCartCount={account?.cartCount ?? 0}
        pendingName={pending && state.status === "pending" ? state.fullName : null}
      >
        {children}
      </HireChrome>
    </HireAuthProvider>
  );
}
