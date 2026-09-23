"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { CandidateGender, CandidatePersona } from "@prisma/client";
import { saveBasicInfoAction } from "@/app/actions/candidate-profile-actions";
import { PhoneVerifyField } from "@/components/shared/phone-verify-field";
import { PERSONA_LABELS, GENDER_LABELS } from "@/lib/candidate-vocab";
import { COUNTRY_NAMES, countryCodeForName, countryNameForCode } from "@/lib/country-catalog";
import {
  CITY_NAMES,
  STATE_NAMES,
  searchCities,
  searchStates,
  stateForCity,
} from "@/lib/city-catalog";
import {
  INDIA_DIALING_CODE,
  isIndianPhone,
} from "@/lib/validations/phone";
import { useServerFieldErrors } from "./field-issues";
import { useSectionSave } from "./use-section-save";
import { useProfileWizard } from "./wizard-context";
import {
  PwField,
  PwInput,
  PwRow,
  PwSelect,
  PwSuggest,
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
  gender: CandidateGender | "";
  primaryPersona: CandidatePersona;
};

/** Form shape: the candidate picks a country NAME, storage keeps the code. */
type FormValues = Omit<BasicInfoValues, "countryCode"> & { country: string };

/**
 * Letters, spaces and the punctuation real names carry. Mirrors the server
 * guard in validations/candidate-profile.ts so the message arrives before the
 * round trip rather than after it.
 */
const LETTERS_ONLY = /^[\p{L}][\p{L}\s.'\-&]*$/u;

const lettersOnly = (label: string) => (value: string) =>
  value.trim() === "" || LETTERS_ONLY.test(value.trim())
    ? true
    : `${label} cannot contain numbers or symbols`;

function splitPhone(e164: string): {
  countryCode: string;
  national: string;
} {
  const trimmed = e164.trim();
  if (trimmed.startsWith(INDIA_DIALING_CODE) && trimmed.length >= 13) {
    return {
      countryCode: INDIA_DIALING_CODE,
      national: trimmed.slice(INDIA_DIALING_CODE.length),
    };
  }
  const match = trimmed.match(/^(\+\d{1,3})(\d+)$/);
  if (match) {
    return { countryCode: match[1]!, national: match[2]! };
  }
  return { countryCode: INDIA_DIALING_CODE, national: trimmed.replace(/^\+/, "") };
}

export function BasicInfoSection({
  initial,
  phoneVerified,
  otpRequired,
}: {
  initial: BasicInfoValues;
  phoneVerified: boolean;
  otpRequired: boolean;
}) {
  const router = useRouter();
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(
    saveBasicInfoAction,
    "Basic information",
    "basic",
  );
  const form = useForm<FormValues>({
    defaultValues: {
      ...initial,
      country: countryNameForCode(initial.countryCode),
    },
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = form;
  // The form asks for a country NAME; the schema validates the stored CODE, so
  // an issue about `countryCode` belongs under the Country input.
  const placeIssues = useServerFieldErrors(form, { countryCode: "country" });

  const summary = watch("summary") ?? "";
  const [phoneError, setPhoneError] = useState<string | null>(null);

  /** City → state. Never the other way round. */
  const fillStateFrom = useCallback(
    (city: string, opts?: { onlyIfEmpty: boolean }) => {
      const state = stateForCity(city);
      if (!state) return;
      if (opts?.onlyIfEmpty && (getValues("locationRegion") ?? "").trim()) return;
      setValue("locationRegion", state, {
        shouldDirty: true,
        shouldValidate: true,
      });
    },
    [getValues, setValue],
  );

  const defaults = splitPhone(initial.phone);

  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (v) => {
        setPhoneError(null);
        if (
          otpRequired &&
          !phoneVerified &&
          (v.phone.trim() === "" || isIndianPhone(v.phone))
        ) {
          setPhoneError("Please verify your phone number to continue.");
          return;
        }
        const { country, ...rest } = v;
        if (
          await save(
            { ...rest, countryCode: countryCodeForName(country) },
            placeIssues,
          )
        ) {
          onSaved();
        }
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
            {...register("fullName", {
              required: "Full name is required",
              validate: lettersOnly("Full name"),
            })}
          />
        </PwField>
        <PwField
          label="Phone number"
          required={otpRequired}
          // Unverified, the input is PhoneVerifyField's own (`phoneNumber`);
          // this row's label is the only one shown, so it must point there.
          htmlFor={phoneVerified ? "bi-phone" : "phoneNumber"}
          verified={phoneVerified}
          error={phoneError}
        >
          {phoneVerified ? (
            <PwInput
              id="bi-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              readOnly
              {...register("phone")}
            />
          ) : (
            <div className="pw-phone-verify">
              <PhoneVerifyField
                // The row above already says "Phone number"; a second label
                // doubled it and pushed this input below Full name.
                hideLabel
                defaultCountryCode={defaults.countryCode}
                defaultPhoneNumber={defaults.national}
                verificationRequired={otpRequired}
                onChange={(v) => {
                  setValue("phone", v.e164, { shouldDirty: true });
                  setPhoneError(null);
                }}
                onVerified={(e164) => {
                  setValue("phone", e164, { shouldDirty: true });
                  setPhoneError(null);
                  router.refresh();
                }}
              />
            </div>
          )}
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
        <PwField
          label="City"
          required
          htmlFor="bi-city"
          error={errors.locationCity?.message}
        >
          <PwSuggest
            id="bi-city"
            placeholder="Start typing your city"
            autoComplete="address-level2"
            suggestions={CITY_NAMES}
            search={searchCities}
            // A city knows its state, so choosing one fills the next field in.
            // The reverse is never done: a state names dozens of cities and
            // picking one for the candidate would be a guess.
            onPick={fillStateFrom}
            aria-invalid={Boolean(errors.locationCity)}
            className={errors.locationCity ? "pw-invalid" : undefined}
            {...register("locationCity", {
              validate: lettersOnly("City"),
              // Typed in full and tabbed past, rather than picked: fill the
              // state only when it is still empty, so a deliberate answer is
              // never overwritten.
              onBlur: (e) => fillStateFrom(e.target.value, { onlyIfEmpty: true }),
            })}
          />
        </PwField>
        <PwField
          label="State / Region"
          required
          htmlFor="bi-region"
          error={errors.locationRegion?.message}
        >
          <PwSuggest
            id="bi-region"
            placeholder="Start typing your state"
            autoComplete="address-level1"
            suggestions={STATE_NAMES}
            search={searchStates}
            aria-invalid={Boolean(errors.locationRegion)}
            className={errors.locationRegion ? "pw-invalid" : undefined}
            {...register("locationRegion", {
              validate: lettersOnly("State / region"),
            })}
          />
        </PwField>
      </PwRow>

      <PwRow cols={2}>
        <PwField
          label="Country"
          required
          htmlFor="bi-country"
          error={errors.country?.message}
        >
          <PwSuggest
            id="bi-country"
            suggestions={COUNTRY_NAMES}
            placeholder="Start typing your country"
            autoComplete="country-name"
            aria-invalid={Boolean(errors.country)}
            className={errors.country ? "pw-invalid" : undefined}
            {...register("country", {
              validate: (v) =>
                v.trim() === "" || countryCodeForName(v) !== ""
                  ? true
                  : "Pick a country from the list",
            })}
          />
        </PwField>
        <PwField label="Gender" htmlFor="bi-gender" required>
          <PwSelect id="bi-gender" {...register("gender")}>
            <option value="">Select</option>
            {Object.values(CandidateGender).map((g) => (
              <option key={g} value={g}>
                {GENDER_LABELS[g] ?? g}
              </option>
            ))}
          </PwSelect>
        </PwField>
      </PwRow>

      {/* A headline is a sentence, so it gets the width of one rather than a
          third of a row shared with two dropdowns. */}
      <PwRow cols={1}>
        <PwField label="Profile Headline" required htmlFor="bi-headline">
          <PwInput
            id="bi-headline"
            maxLength={160}
            placeholder="Describe yourself in one line"
            {...register("headline")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField
          label="About"
          required
          htmlFor="bi-summary"
          counter={`${summary.length}/2000`}
        >
          <PwTextarea
            id="bi-summary"
            rows={4}
            maxLength={2000}
            placeholder="Tell recruiters who you are."
            {...register("summary")}
          />
        </PwField>
      </PwRow>
    </form>
  );
}
