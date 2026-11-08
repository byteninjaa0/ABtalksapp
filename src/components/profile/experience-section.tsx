"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { saveExperienceAction } from "@/app/actions/candidate-profile-actions";
import { COMMON_ROLES, EMPLOYMENT_TYPES } from "@/lib/candidate-vocab";
import { CITY_NAMES, searchCities } from "@/lib/city-catalog";
import { endBeforeStart, useServerFieldErrors } from "./field-issues";
import { useSectionSave } from "./use-section-save";
import { useProfileWizard } from "./wizard-context";
import {
  PwAddMore,
  PwCheckbox,
  PwEntryCard,
  PwField,
  PwInput,
  CURRENT_YEAR,
  PwMonthYear,
  PwRow,
  PwMenuSelect,
  PwSuggest,
  PwTextarea,
} from "./wizard-fields";

export type ExperienceFormRow = {
  companyName: string;
  title: string;
  employmentType: string;
  locationCity: string;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  isCurrent: boolean;
  description: string;
};

type FormValues = {
  hasNoWorkExperience: boolean;
  rows: ExperienceFormRow[];
};

export const emptyExperienceRow: ExperienceFormRow = {
  companyName: "",
  title: "",
  employmentType: "",
  locationCity: "",
  startMonth: null,
  startYear: null,
  endMonth: null,
  endYear: null,
  isCurrent: false,
  description: "",
};

export function ExperienceSection({
  initial,
  hasNoWorkExperience: initialSkip,
}: {
  initial: ExperienceFormRow[];
  hasNoWorkExperience: boolean;
}) {
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(saveExperienceAction, "Experience", "experience");
  const form = useForm<FormValues>({
    // Live: a wrong date pair says so while it is being picked, and stops
    // saying so the moment it is fixed.
    mode: "onChange",
    defaultValues: {
      hasNoWorkExperience: initialSkip,
      rows: initial.length > 0 ? initial : [{ ...emptyExperienceRow }],
    },
  });
  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState,
  } = form;
  const { errors } = formState;
  const placeIssues = useServerFieldErrors(form);
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "rows",
  });

  const skipExperience = watch("hasNoWorkExperience");

  useEffect(() => {
    setDirty(formState.isDirty);
  }, [formState.isDirty, setDirty]);

  function removeOrClear(index: number) {
    if (fields.length === 1) {
      replace([{ ...emptyExperienceRow }]);
      return;
    }
    remove(index);
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (v) => {
        if (await save(v, placeIssues)) onSaved();
      })}
    >
      <PwRow cols={1}>
        <Controller
          control={control}
          name="hasNoWorkExperience"
          render={({ field: f }) => (
            <PwCheckbox
              id="exp-no-experience"
              checked={f.value}
              onChange={(checked) => {
                f.onChange(checked);
                if (checked) {
                  replace([{ ...emptyExperienceRow }]);
                }
              }}
            >
              I don&apos;t have work experience yet
            </PwCheckbox>
          )}
        />
      </PwRow>
      {skipExperience ? null : (
        <>
          <div className="pw-entries">
            {fields.map((field, index) => {
          const isCurrent = watch(`rows.${index}.isCurrent`);
          const startYear = watch(`rows.${index}.startYear`);
          const employment = watch(`rows.${index}.employmentType`);
          const extraType =
            employment &&
            !(EMPLOYMENT_TYPES as readonly string[]).includes(employment)
              ? employment
              : null;
          return (
            <PwEntryCard
              key={field.id}
              index={index}
              title="Role"
              onRemove={() => removeOrClear(index)}
            >
              <PwRow cols={2}>
                <PwField
                  label="Company"
                  required
                  htmlFor={`exp-company-${index}`}
                >
                  <PwInput
                    id={`exp-company-${index}`}
                    placeholder="Enter your company name"
                    autoComplete="off"
                    {...register(`rows.${index}.companyName`, {
                    })}
                  />
                </PwField>
                <PwField label="Role" required htmlFor={`exp-title-${index}`}>
                  <PwSuggest
                    id={`exp-title-${index}`}
                    placeholder="Enter your role"
                    suggestions={COMMON_ROLES}
                    {...register(`rows.${index}.title`)}
                  />
                </PwField>
              </PwRow>

              <PwRow cols={2}>
                <PwField
                  label="Employment type"
                  required
                  htmlFor={`exp-type-${index}`}
                >
                  <Controller
                    control={control}
                    name={`rows.${index}.employmentType`}
                    render={({ field }) => (
                      <PwMenuSelect
                        id={`exp-type-${index}`}
                        aria-label="Employment type"
                        placeholder="Select"
                        value={field.value ?? ""}
                        // `extraType` is a stored value that predates the
                        // current list; it stays first so an older row can
                        // still show and keep what it has.
                        options={
                          extraType
                            ? [extraType, ...EMPLOYMENT_TYPES]
                            : EMPLOYMENT_TYPES
                        }
                        onChange={field.onChange}
                      />
                    )}
                  />
                </PwField>
                <PwField label="Location" required htmlFor={`exp-loc-${index}`}>
                  {/* The same city vocabulary the profile's own location uses,
                      so a role in Bengaluru and a candidate in Bengaluru are
                      spelled the same way. */}
                  <PwSuggest
                    id={`exp-loc-${index}`}
                    placeholder="Start typing a city"
                    suggestions={CITY_NAMES}
                    search={searchCities}
                    {...register(`rows.${index}.locationCity`)}
                  />
                </PwField>
              </PwRow>

              <PwRow cols={1}>
                <Controller
                  control={control}
                  name={`rows.${index}.isCurrent`}
                  render={({ field: f }) => (
                    <PwCheckbox
                      id={`exp-current-${index}`}
                      checked={f.value}
                      onChange={(checked) => {
                        f.onChange(checked);
                        if (checked) {
                          setValue(`rows.${index}.endMonth`, null);
                          setValue(`rows.${index}.endYear`, null);
                        }
                      }}
                    >
                      Currently working here
                    </PwCheckbox>
                  )}
                />
              </PwRow>

              <PwRow cols={2}>
                <PwField label="Starting from" required>
                  <Controller
                    control={control}
                    name={`rows.${index}.startMonth`}
                    render={({ field: month }) => (
                      <Controller
                        control={control}
                        name={`rows.${index}.startYear`}
                        render={({ field: year }) => (
                          <PwMonthYear
                            month={month.value}
                            year={year.value}
                            // Moving the start can invalidate — or fix — the
                            // end, so the rule that lives there is re-run.
                            onMonthChange={(v) => {
                              month.onChange(v);
                              void trigger(`rows.${index}.endYear`);
                            }}
                            onYearChange={(v) => {
                              year.onChange(v);
                              void trigger(`rows.${index}.endYear`);
                            }}
                            toYear={CURRENT_YEAR}
                          />
                        )}
                      />
                    )}
                  />
                </PwField>
                <div
                  style={{
                    visibility: isCurrent ? "hidden" : undefined,
                    pointerEvents: isCurrent ? "none" : undefined,
                  }}
                >
                  <PwField
                    label="Ending in"
                    required
                    error={errors.rows?.[index]?.endYear?.message}
                  >
                    <Controller
                      control={control}
                      name={`rows.${index}.endMonth`}
                      render={({ field: month }) => (
                        <Controller
                          control={control}
                          name={`rows.${index}.endYear`}
                          // The rule sits on `endYear` because that is the path
                          // the schema names, so a live failure and a server
                          // one land under the same field.
                          rules={{
                            validate: (value, values) => {
                              const row = values.rows[index];
                              if (!row || row.isCurrent) return true;
                              return (
                                endBeforeStart(
                                  { month: row.startMonth, year: row.startYear },
                                  { month: row.endMonth, year: value },
                                  "This role cannot end before it started",
                                ) ?? true
                              );
                            },
                          }}
                          render={({ field: year }) => (
                            <PwMonthYear
                              month={month.value}
                              year={year.value}
                              onMonthChange={(v) => {
                                month.onChange(v);
                                void trigger(`rows.${index}.endYear`);
                              }}
                              onYearChange={year.onChange}
                              disabled={isCurrent}
                              fromYear={startYear ?? 1975}
                              toYear={CURRENT_YEAR}
                              invalid={Boolean(errors.rows?.[index]?.endYear)}
                            />
                          )}
                        />
                      )}
                    />
                  </PwField>
                </div>
              </PwRow>

              <PwRow cols={1}>
                <PwField
                  label="Description"
                  htmlFor={`exp-desc-${index}`}
                  area
                >
                  <PwTextarea
                    id={`exp-desc-${index}`}
                    maxLength={4000}
                    placeholder="Describe your role and responsibilities"
                    {...register(`rows.${index}.description`)}
                  />
                </PwField>
              </PwRow>
            </PwEntryCard>
          );
        })}
          </div>
          <PwAddMore onClick={() => append({ ...emptyExperienceRow })} />
        </>
      )}
    </form>
  );
}
