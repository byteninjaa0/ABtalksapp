"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

function safeRedirectPath(from: string | undefined, fallback: string) {
  if (!from || !from.startsWith("/") || from.startsWith("//")) {
    return fallback;
  }
  return from;
}

type LoginClientProps = {
  showGoogle: boolean;
  showDev: boolean;
  redirectTo: string;
};

export function LoginClient({ showGoogle, showDev, redirectTo }: LoginClientProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const target = safeRedirectPath(redirectTo, "/dashboard");

  async function handleGoogleSignIn() {
    setPending(true);
    try {
      await signIn("google", { callbackUrl: target });
    } catch {
      toast.error("Could not start Google sign-in.");
      setPending(false);
    }
  }

  async function handleCredentialsSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: target,
        redirectTo: target,
      });
      if (result?.error) {
        toast.error("Invalid email or password.");
        setPending(false);
        return;
      }
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      window.location.href = target;
    } catch {
      toast.error("Something went wrong. Try again.");
      setPending(false);
    }
  }

  if (!showGoogle && !showDev) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No sign-in methods are configured for this environment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {showGoogle ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={handleGoogleSignIn}
          >
            Sign in with Google
          </Button>
        </div>
      ) : null}

      {showGoogle && showDev ? (
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs font-medium text-muted-foreground">OR</span>
          <Separator className="flex-1" />
        </div>
      ) : null}

      {showDev ? (
        <form onSubmit={handleCredentialsSignIn} className="flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground">Dev Login</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-email">Email</Label>
            <Input
              id="dev-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="dev-password">Password</Label>
            <Input
              id="dev-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={pending}
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            Sign in
          </Button>
          <p className="text-xs text-muted-foreground">
            Dev mode — use test accounts from seed script
          </p>
        </form>
      ) : null}
    </div>
  );
}
