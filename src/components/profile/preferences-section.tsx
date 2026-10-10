"use client";

import { useEffect } from "react";
import { Controller, useForm, type UseFormRegister } from "react-hook-form";
import { OpportunityType } from "@prisma/client";
import { savePreferencesAction } from "@/app/actions/candidate-profile-actions";
import { OPPORTUNITY_TYPE_LABELS, WORK_MODES } from "@/lib/candidate-vocab";
import { CITY_NAMES, canonicalCityName, searchCities } from "@/lib/city-catalog";
import type { CtcCurrency } from "@/lib/validations/candidate-profile";
import { useServerFieldErrors } from "./field-issues";
import { useSectionSave } from "./use-section-save";
import { useProfileWizard } from "./wizard-context";
import {
  CURRENT_YEAR,
  PwCheckGroup,
  PwCheckbox,
  PwField,
  PwInput,
  PwMonthYear,
  PwRow,
  PwSelect,
  PwTags,
  PwTogglePanel,
} from "./wizard-fields";

/**
 * "Available from" is a date you become free, so it cannot be in the past.
 * The picker defaulted to the shared 1975 floor that education and work
 * history need, which offered every year back to 1975 — a profile could say it
 * was available from May 2017 and read as current (issue #483).
 *
 * Month index, 1-based, to match `PwMonthYear`.
 */
const CURRENT_MONTH = new Date().getMonth() + 1;

export type PreferencesFormValues = {
  openToWork: boolean;
  preferredRoles: string[];
  preferredLocations: string[];
  opportunityTypes: OpportunityType[];
  remotePreference: string;
  willingToRelocate: boolean;
  noticePeriodDays: string;
  availableFromMonth: number | null;
  availableFromYear: number | null;
  currentCtc: string;
  currentCtcCurrency: CtcCurrency;
  expectedCtc: string;
  expectedCtcCurrency: CtcCurrency;
};

const OPPORTUNITY_OPTIONS = Object.values(OpportunityType).map((t) => ({
  value: t,
  label: OPPORTUNITY_TYPE_LABELS[t] ?? t,
}));

/** Annual amount with its own INR / USD picker attached. */
function CtcInput({
  id,
  label,
  amount,
  currency,
  register,
}: {
  id: string;
  label: string;
  amount: "currentCtc" | "expectedCtc";
  currency: "currentCtcCurrency" | "expectedCtcCurrency";
  register: UseFormRegister<PreferencesFormValues>;
}) {
  return (
    <div className="pw-money">
      <PwSelect aria-label={`${label} currency`} {...register(currency)}>
        <option value="INR">₹ INR</option>
        <option value="USD">$ USD</option>
      </PwSelect>
      <PwInput
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        placeholder="e.g. 1200000"
        {...register(amount)}
      />
    </div>
  );
}

export function PreferencesSection({
  initial,
  isProfessional,
}: {
  initial: PreferencesFormValues;
  /** CTC fields are asked of working professionals only. */
  isProfessional: boolean;
}) {
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(
    savePreferencesAction,
    "Career preferences",
    "preferences",
  );
  const form = useForm<PreferencesFormValues>({ defaultValues: initial });
  const { control, register, handleSubmit, formState } = form;
  const placeIssues = useServerFieldErrors(form);

  useEffect(() => {
    setDirty(formState.isDirty);
  }, [formState.isDirty, setDirty]);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (v) => {
        // Fields a student never saw are left out, so the save keeps whatever
        // is stored instead of clearing it.
        const payload = isProfessional
          ? v
          : {
              ...v,
              currentCtc: undefined,
              currentCtcCurrency: undefined,
              expectedCtc: undefined,
              expectedCtcCurrency: undefined,
            };
        if (await save(payload, placeIssues)) onSaved();
      })}
    >
      <PwRow cols={1}>
        <Controller
          control={control}
          name="openToWork"
          render={({ field }) => (
            <PwTogglePanel
              title="Open to work"
              text="Says whether you are looking for a job right now."
              checked={Boolean(field.value)}
              onChange={(next) => field.onChange(next)}
            />
          )}
        />
      </PwRow>

      <PwRow cols={1}>
        <PwField label="Preferred roles">
          <Controller
            control={control}
            name="preferredRoles"
            render={({ field }) => (
              <PwTags
                values={field.value}
                onChange={field.onChange}
                placeholder="ex: Backend Engineer"
              />
            )}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField label="Preferred locations">
          <Controller
            control={control}
            name="preferredLocations"
            render={({ field }) => (
              <PwTags
                values={field.value}
                onChange={field.onChange}
                // Same city catalog as the profile and experience locations:
                // a recruiter filtering on Bengaluru should reach candidates
                // who typed Bangalore.
                suggestions={CITY_NAMES}
                searchSuggestions={searchCities}
                normalize={canonicalCityName}
                placeholder="Start typing a city"
              />
            )}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField label="Opportunity type">
          <Controller
            control={control}
            name="opportunityTypes"
            render={({ field }) => (
              <PwCheckGroup
                options={OPPORTUNITY_OPTIONS}
                value={field.value}
                onChange={(next) => field.onChange(next as OpportunityType[])}
              />
            )}
          />
        </PwField>
      </PwRow>

      <PwRow cols={2}>
        <PwField label="Work mode" htmlFor="pref-mode">
          <Controller
            control={control}
            name="remotePreference"
            render={({ field }) => (
              <PwSelect
                id="pref-mode"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value)}
              >
                <option value="">Select</option>
                {WORK_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </PwSelect>
            )}
          />
        </PwField>
        <PwField
          label="Notice period"
          htmlFor="pref-notice"
          helper="In days. Leave blank if you are immediately available."
        >
          <PwInput
            id="pref-notice"
            type="number"
            min={0}
            max={365}
            placeholder="e.g. 10"
            {...register("noticePeriodDays")}
          />
        </PwField>
      </PwRow>

      {isProfessional ? (
        <PwRow cols={2}>
          <PwField
            label="Current CTC"
            htmlFor="pref-current-ctc"
            helper=""
          >
            <CtcInput
              id="pref-current-ctc"
              label="Current CTC"
              amount="currentCtc"
              currency="currentCtcCurrency"
              register={register}
            />
          </PwField>
          <PwField
            label="Expected CTC"
            htmlFor="pref-expected-ctc"
            helper=""
          >
            <CtcInput
              id="pref-expected-ctc"
              label="Expected CTC"
              amount="expectedCtc"
              currency="expectedCtcCurrency"
              register={register}
            />
          </PwField>
        </PwRow>
      ) : null}

      <PwRow cols={2}>
        <PwField label="Available from">
          <Controller
            control={control}
            name="availableFromMonth"
            render={({ field: month }) => (
              <Controller
                control={control}
                name="availableFromYear"
                render={({ field: year }) => (
                  <PwMonthYear
                    month={month.value}
                    year={year.value}
                    fromYear={CURRENT_YEAR}
                    // Only the current year is part-spent; every later year is
                    // open from January.
                    minMonth={
                      year.value === CURRENT_YEAR ? CURRENT_MONTH : undefined
                    }
                    onMonthChange={month.onChange}
                    onYearChange={(next) => {
                      year.onChange(next);
                      // Coming back from a future year can strand a month that
                      // has already passed — "2027, February" becoming "this
                      // year, February". The month list no longer offers it, so
                      // the stale value has to go with it.
                      if (
                        next === CURRENT_YEAR &&
                        month.value !== null &&
                        month.value < CURRENT_MONTH
                      ) {
                        month.onChange(null);
                      }
                    }}
                  />
                )}
              />
            )}
          />
        </PwField>
        <PwField inlineCheck>
          <Controller
            control={control}
            name="willingToRelocate"
            render={({ field }) => (
              <PwCheckbox
                id="pref-relocate"
                checked={field.value}
                onChange={field.onChange}
              >
                Willing to relocate
              </PwCheckbox>
            )}
          />
        </PwField>
      </PwRow>
    </form>
  );
}
