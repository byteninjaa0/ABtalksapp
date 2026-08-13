"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { z } from "zod";
import { registerRecruiterAction } from "@/app/actions/talent-actions";
import {
  LegalConsentFields,
  legalConsentAccepted,
  type LegalConsentValues,
} from "@/components/legal/legal-consent-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recruiterRegisterSchema,
  type RecruiterRegisterInput,
} from "@/lib/validations/talent";

type FormInput = z.input<typeof recruiterRegisterSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[0.8rem] font-medium text-destructive">{message}</p>;
}

export function RecruiterRegisterForm({
  company,
  defaultFullName = "",
}: {
  /** From the verified seat. Shown, never edited — it is what was verified. */
  company: string;
  defaultFullName?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [legalConsent, setLegalConsent] = useState<LegalConsentValues>({ acceptLegal: false, newsletterOptIn: true });

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormInput, unknown, RecruiterRegisterInput>({
    resolver: zodResolver(recruiterRegisterSchema),
    defaultValues: {
      fullName: defaultFullName,
      company,
      phone: "",
      acceptLegal: false,
      newsletterOptIn: true,
    },
  });

  async function onSubmit(data: RecruiterRegisterInput) {
    if (!legalConsentAccepted(legalConsent)) {
      toast.error("Please accept the Terms of Service and Privacy Policy.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerRecruiterAction({
        ...data,
        acceptLegal: legalConsent.acceptLegal,
        newsletterOptIn: legalConsent.newsletterOptIn,
      });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Application submitted!");
      router.push("/talent/pending");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" {...register("fullName")} />
        <FieldError message={errors.fullName?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">Company</Label>
        {/* Read-only on purpose: this is the company ABTalks verified. Letting
            it be typed would mean the seat says one thing and the profile
            another. It is still registered so the value is submitted. */}
        <Input
          id="company"
          readOnly
          className="bg-muted text-muted-foreground"
          {...register("company")}
        />
        <FieldError message={errors.company?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" type="tel" {...register("phone")} />
        <FieldError message={errors.phone?.message} />
      </div>
      <LegalConsentFields
        values={legalConsent}
        newsletterLabel={
          <>
            Send me occasional updates about talent-pool access, cohort
            releases, and recruiter product news.
          </>
        }
        onChange={(next) => {
          setLegalConsent(next);
          setValue("acceptLegal", next.acceptLegal);
          setValue("newsletterOptIn", next.newsletterOptIn);
        }}
      />
      <Button
        type="submit"
        disabled={submitting || !legalConsentAccepted(legalConsent)}
        className="w-full gap-2"
      >
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Submit application
      </Button>
    </form>
  );
}
