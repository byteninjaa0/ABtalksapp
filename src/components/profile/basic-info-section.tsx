"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { CandidatePersona } from "@prisma/client";
import { saveBasicInfoAction } from "@/app/actions/candidate-profile-actions";
import { PERSONA_LABELS } from "@/lib/candidate-vocab";
import { useSectionSave } from "./use-section-save";
import { useProfileWizard } from "./wizard-context";
import { useLocationFields } from "./location-fields";
import {
  PwField,
  PwInput,
  PwRow,
  PwSelect,
  PwTextarea,
} from "./wizard-fields";

export type BasicInfoValues = {
  fullName: string;
  phone: string;
  headline: string;
  summary: string;
  locationCity: string;
  locationRegion: string;
  countryCode: string;
  primaryPersona: CandidatePersona;
};

export function BasicInfoSection({
  initial,
  phoneVerified,
}: {
  initial: BasicInfoValues;
  phoneVerified: boolean;
}) {
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(saveBasicInfoAction, "Basic information");
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<BasicInfoValues>({ defaultValues: initial });

  const summary = watch("summary") ?? "";

  const { cityField, stateField, countryField } = useLocationFields({
    city: watch("locationCity"),
    region: watch("locationRegion"),
    countryCode: watch("countryCode"),
    onCityChange: (v) => setValue("locationCity", v, { shouldDirty: true }),
    onRegionChange: (v) =>
      setValue("locationRegion", v, { shouldDirty: true }),
    onCountryCodeChange: (v) =>
      setValue("countryCode", v, { shouldDirty: true }),
  });

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (v) => {
        if (await save(v)) onSaved();
      })}
    >
      <PwRow cols={2}>
        <PwField
          label="Full name"
          required
          htmlFor="bi-fullName"
          error={errors.fullName?.message}
        >
          <PwInput
            id="bi-fullName"
            autoComplete="name"
            placeholder="Your full name"
            aria-invalid={Boolean(errors.fullName)}
            className={errors.fullName ? "pw-invalid" : undefined}
            {...register("fullName", { required: "Full name is required" })}
          />
        </PwField>
        <PwField
          label="Phone"
          htmlFor="bi-phone"
          verified={phoneVerified}
        >
          <PwInput
            id="bi-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91-XXXXXXXXXX"
            {...register("phone")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={3}>
        <PwField label="I am a" htmlFor="bi-persona">
          <PwSelect id="bi-persona" {...register("primaryPersona")}>
            {Object.values(CandidatePersona).map((p) => (
              <option key={p} value={p}>
                {PERSONA_LABELS[p] ?? p}
              </option>
            ))}
          </PwSelect>
        </PwField>
        {cityField}
        {stateField}
      </PwRow>

      <PwRow cols={2}>
        {countryField}
        <PwField
          label="Headline"
          htmlFor="bi-headline"
          helper="One line. What you do, or what you are working toward."
        >
          <PwInput
            id="bi-headline"
            maxLength={160}
            placeholder="ex: Final-year CSE student building ML systems"
            {...register("headline")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1} grow>
        <PwField
          label="About"
          htmlFor="bi-summary"
          counter={`${summary.length}/2000`}
          area
        >
          <PwTextarea
            id="bi-summary"
            maxLength={2000}
            placeholder="Tell recruiters who you are."
            {...register("summary")}
          />
        </PwField>
      </PwRow>
    </form>
  );
}
