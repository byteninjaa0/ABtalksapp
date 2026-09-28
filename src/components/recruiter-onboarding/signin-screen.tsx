"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { requestRecruiterOtpAction } from "@/app/actions/recruiter-auth-actions";
import { useMotionMode, type Direction, type StepMotion } from "./motion";
import {
  EMAIL_RE,
  Field,
  FieldError,
  INPUT_CLASS,
  fieldA11y,
} from "./onboarding-fields";
import { OnboardingShell } from "./onboarding-shell";
import {
  OnboardingNavigation,
  OnboardingStage,
  OnboardingStep,
  StaggerItem,
  TEXT_LINK,
} from "./onboarding-step";
import { CodeStep } from "./steps/verify-step";
import { EMPTY_VISUAL, SupportingVisual } from "./supporting-visual";

/*
 * Recruiter sign-in, in the onboarding's frame: two cards in the same stack.
 *
 * Recruiters are passwordless, so this is the same flow as /talent/login:
 * request a code for the email (the server refuses an address with no
 * registration), then sign in with the `recruiter-otp` provider.
 */

export function SigninScreen({
  initialEmail = "",
  /** Where to go once the session exists; the desk unless `from` said otherwise. */
  redirectTo = "/hire",
}: {
  initialEmail?: string;
  redirectTo?: string;
}) {
  const motionMode = useMotionMode();
  const [screen, setScreen] = useState<"email" | "code">("email");
  const [dir, setDir] = useState<Direction>(1);
  const [navigated, setNavigated] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [pending, startTransition] = useTransition();

  const emailError = EMAIL_RE.test(email.trim()) ? null : "Enter a valid work email address.";
  const stepMotion = useMemo<StepMotion>(
    () => ({ dir, mode: navigated ? motionMode : "fade" }),
    [dir, motionMode, navigated],
  );

  function go(next: "email" | "code", direction: Direction) {
    setDir(direction);
    setNavigated(true);
    setScreen(next);
  }

  function requestCode() {
    if (emailError) {
      setShowErrors(true);
      document.getElementById("si-email")?.focus();
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await requestRecruiterOtpAction({ email, intent: "signin" });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setDevCode(res.data.devCode ?? null);
      setCode("");
      go("code", 1);
    });
  }

  function submitCode() {
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await signIn("recruiter-otp", { email, code, redirect: false });
      if (!res || res.error) {
        setError("That code isn’t right, or it has expired.");
        setCode("");
        return;
      }
      // Full navigation: the session cookie was just set and every guard
      // downstream reads it server-side. Straight to the desk — registering
      // provisions the workspace, so there is no setup or review step.
      window.location.href = redirectTo;
    });
  }

  return (
    <OnboardingShell
      aside={
        <p className="text-sm text-[#626262]">
          <span className="hidden sm:inline">New to ABTalks Hire? </span>
          <Link href="/recruiter-onboarding" className={TEXT_LINK}>
            Create an account
          </Link>
        </p>
      }
      visual={
        <SupportingVisual stage="signin" data={{ ...EMPTY_VISUAL, email: email.trim() }} />
      }
    >
      <div className="lg:pt-[clamp(8px,6vh,72px)]">
        <OnboardingStage motion={stepMotion}>
          {screen === "email" ? (
            <OnboardingStep
              key="email"
              motion={stepMotion}
              focusHeading={navigated}
              eyebrow="ABTalks Hire"
              title="Welcome back"
              description={
                <p>
                  Pick up where you left off. Review candidates, track
                  conversations, and keep your hiring pipeline moving.
                </p>
              }
              onSubmit={requestCode}
              actions={<OnboardingNavigation primaryLabel="Send code" pending={pending} />}
              footer={
                <p>
                  Don’t have an account?{" "}
                  <Link href="/recruiter-onboarding/signup" className={TEXT_LINK}>
                    Sign up
                  </Link>
                </p>
              }
            >
              <StaggerItem>
                <Field
                  id="si-email"
                  label="Work email"
                  hint="We’ll email you a 6-digit code. No password needed."
                  error={showErrors ? emailError : null}
                  valid={!emailError}
                >
                  <input
                    id="si-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoFocus
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={pending}
                    {...fieldA11y(
                      "si-email",
                      showErrors ? emailError : null,
                      "We’ll email you a 6-digit code. No password needed.",
                    )}
                    className={INPUT_CLASS}
                  />
                </Field>
                <FieldError message={error} />
              </StaggerItem>
            </OnboardingStep>
          ) : (
            <CodeStep
              key="code"
              codeId="si-code"
              motion={stepMotion}
              focusHeading={navigated}
              eyebrow="Sign in"
              title="Check your email"
              lead="We sent a 6-digit code to"
              email={email.trim()}
              code={code}
              devCode={devCode}
              error={error}
              pending={pending}
              primaryLabel="Sign in"
              resendIn={0}
              onCodeChange={setCode}
              onResend={requestCode}
              onBack={() => {
                setCode("");
                setDevCode(null);
                setError(null);
                go("email", -1);
              }}
              onSubmit={submitCode}
            />
          )}
        </OnboardingStage>
      </div>
    </OnboardingShell>
  );
}
