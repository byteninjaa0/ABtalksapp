"use client";

import { useEffect } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { GradeType } from "@prisma/client";
import { CollegeCombobox } from "@/components/shared/college-combobox";
import { saveEducationAction } from "@/app/actions/candidate-profile-actions";
import {
  DEGREES,
  GRADE_TYPE_LABELS,
  SCORE_TYPE_OPTIONS,
  departmentsForDegree,
  searchDegrees,
} from "@/lib/candidate-vocab";
import {
  EDUCATION_MAX_SPAN_YEARS,
  EDUCATION_MIN_YEAR,
  gradeScoreIssue,
} from "@/lib/validations/candidate-profile";
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
  PwMenuSelect,
  PwMonthYear,
  PwRow,
  PwSuggest,
  PwTextarea,
} from "./wizard-fields";

export type EducationFormRow = {
  institutionName: string;
  collegeId: string;
  degree: string;
  fieldOfStudy: string;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  graduationYear: number | null;
  isCurrent: boolean;
  gradeType: GradeType | "";
  grade: string;
  description: string;
};

type FormValues = { rows: EducationFormRow[] };

export const emptyEducationRow: EducationFormRow = {
  institutionName: "",
  collegeId: "",
  degree: "",
  fieldOfStudy: "",
  startMonth: null,
  startYear: null,
  endMonth: null,
  graduationYear: null,
  isCurrent: false,
  gradeType: "",
  grade: "",
  description: "",
};

const GRADE_PLACEHOLDER: Record<string, string> = {
  PERCENTAGE: "e.g. 82.5",
  CGPA_10: "e.g. 8.6",
  GPA_4: "e.g. 3.7",
  GRADE: "e.g. A+",
};

/**
 * `PwMonthYear` caps the YEAR but not the month, so in the current year every
 * month stayed selectable — in September you could still pick December and
 * claim a start date that has not happened yet. `maxMonth` is only applied
 * when the selected year IS the current year; every earlier year is complete
 * and offers all twelve. Same guard `accomplishments-section` already uses.
 */
const CURRENT_MONTH = new Date().getMonth() + 1;

export function EducationSection({ initial }: { initial: EducationFormRow[] }) {
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(saveEducationAction, "Education", "education");
  const form = useForm<FormValues>({
    // Live: a wrong date pair says so while it is being picked, and stops
    // saying so the moment it is fixed.
    mode: "onChange",
    defaultValues: {
      rows: initial.length > 0 ? initial : [{ ...emptyEducationRow }],
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

  useEffect(() => {
    setDirty(formState.isDirty);
  }, [formState.isDirty, setDirty]);

  function removeOrClear(index: number) {
    if (fields.length === 1) {
      replace([{ ...emptyEducationRow }]);
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
      <div className="pw-entries">
        {fields.map((field, index) => {
          const isCurrent = watch(`rows.${index}.isCurrent`);
          const startYear = watch(`rows.${index}.startYear`);
          const gradeType = watch(`rows.${index}.gradeType`);
          const degree = watch(`rows.${index}.degree`);
          const numericScore =
            gradeType === "PERCENTAGE" ||
            gradeType === "CGPA_10" ||
            gradeType === "GPA_4";
          return (
            <PwEntryCard
              key={field.id}
              index={index}
              title="Education"
              onRemove={() => removeOrClear(index)}
            >
              <PwRow cols={1}>
                <PwField label="School / College" required>
                  <Controller
                    control={control}
                    name={`rows.${index}.institutionName`}
                    render={({ field: f }) => (
                      <CollegeCombobox
                        id={`edu-college-${index}`}
                        value={f.value}
                        onChange={(name, collegeId) => {
                          f.onChange(name);
                          setValue(`rows.${index}.collegeId`, collegeId ?? "");
                        }}
                        placeholder="Enter your school or college name"
                      />
                    )}
                  />
                </PwField>
              </PwRow>

              <PwRow cols={2}>
                <PwField label="Degree" required htmlFor={`edu-degree-${index}`}>
                  <PwSuggest
                    id={`edu-degree-${index}`}
                    placeholder="e.g. B.E / B.Tech"
                    suggestions={DEGREES}
                    search={searchDegrees}
                    {...register(`rows.${index}.degree`)}
                  />
                </PwField>
                <PwField
                  label="Department / field"
                  required
                  htmlFor={`edu-field-${index}`}
                >
                  {/* Offers the branches that belong to the degree beside it —
                      engineering for a B.Tech, commerce for a B.Com — and every
                      branch when the degree is blank or unrecognised. */}
                  <PwSuggest
                    id={`edu-field-${index}`}
                    placeholder="Enter your field of study"
                    suggestions={departmentsForDegree(degree ?? "")}
                    maxSuggestions={80}
                    {...register(`rows.${index}.fieldOfStudy`)}
                  />
                </PwField>
              </PwRow>

              <PwRow cols={1}>
                <Controller
                  control={control}
                  name={`rows.${index}.isCurrent`}
                  render={({ field: f }) => (
                    <PwCheckbox
                      id={`edu-current-${index}`}
                      checked={f.value}
                      onChange={(checked) => {
                        f.onChange(checked);
                        if (checked) {
                          setValue(`rows.${index}.endMonth`, null);
                          setValue(`rows.${index}.graduationYear`, null);
                        }
                      }}
                    >
                      Currently studying here
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
                              void trigger(`rows.${index}.graduationYear`);
                            }}
                            onYearChange={(v) => {
                              year.onChange(v);
                              void trigger(`rows.${index}.graduationYear`);
                            }}
                            fromYear={EDUCATION_MIN_YEAR}
                            toYear={CURRENT_YEAR}
                            maxMonth={
                              year.value === CURRENT_YEAR
                                ? CURRENT_MONTH
                                : undefined
                            }
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
                    error={errors.rows?.[index]?.graduationYear?.message}
                  >
                    <Controller
                      control={control}
                      name={`rows.${index}.endMonth`}
                      render={({ field: month }) => (
                        <Controller
                          control={control}
                          name={`rows.${index}.graduationYear`}
                          // Same two rules the schema applies, run here so the
                          // answer arrives without a round trip — and on the
                          // same path, so a server issue lands here too.
                          rules={{
                            validate: (value, values) => {
                              const row = values.rows[index];
                              if (!row || row.isCurrent) return true;
                              if (
                                row.startYear !== null &&
                                value !== null &&
                                value > row.startYear + EDUCATION_MAX_SPAN_YEARS
                              ) {
                                return `End year cannot be more than ${EDUCATION_MAX_SPAN_YEARS} years after the start year`;
                              }
                              return (
                                endBeforeStart(
                                  { month: row.startMonth, year: row.startYear },
                                  { month: row.endMonth, year: value },
                                  "End date cannot be before the start date",
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
                                void trigger(`rows.${index}.graduationYear`);
                              }}
                              onYearChange={year.onChange}
                              disabled={isCurrent}
                              fromYear={startYear ?? EDUCATION_MIN_YEAR}
                              toYear={
                                (startYear ?? CURRENT_YEAR) +
                                EDUCATION_MAX_SPAN_YEARS
                              }
                              invalid={Boolean(
                                errors.rows?.[index]?.graduationYear,
                              )}
                            />
                          )}
                        />
                      )}
                    />
                  </PwField>
                </div>
              </PwRow>

              <PwRow cols={2}>
                <PwField label="Score type" htmlFor={`edu-grade-type-${index}`}>
                  <Controller
                    control={control}
                    name={`rows.${index}.gradeType`}
                    render={({ field: f }) => (
                      <PwMenuSelect
                        id={`edu-grade-type-${index}`}
                        aria-label="Score type"
                        placeholder="Select"
                        value={f.value}
                        options={SCORE_TYPE_OPTIONS}
                        labels={GRADE_TYPE_LABELS}
                        onChange={(v) => {
                          f.onChange(v as GradeType | "");
                          void trigger(`rows.${index}.grade`);
                        }}
                      />
                    )}
                  />
                </PwField>
                <PwField
                  label="Score"
                  htmlFor={`edu-grade-${index}`}
                  error={errors.rows?.[index]?.grade?.message}
                >
                  <PwInput
                    id={`edu-grade-${index}`}
                    inputMode={numericScore ? "decimal" : undefined}
                    placeholder={
                      gradeType ? GRADE_PLACEHOLDER[gradeType] : "e.g. 7.9"
                    }
                    {...register(`rows.${index}.grade`, {
                      validate: (value, values) => {
                        const type = values.rows[index]?.gradeType || null;
                        return gradeScoreIssue(type, value) ?? true;
                      },
                    })}
                  />
                </PwField>
              </PwRow>

              <PwRow cols={1}>
                <PwField
                  label="Description"
                  htmlFor={`edu-desc-${index}`}
                  area
                >
                  <PwTextarea
                    id={`edu-desc-${index}`}
                    maxLength={4000}
                    placeholder="Describe your coursework, thesis, societies, or anything else worth knowing."
                    {...register(`rows.${index}.description`)}
                  />
                </PwField>
              </PwRow>
            </PwEntryCard>
          );
        })}
      </div>
      <PwAddMore onClick={() => append({ ...emptyEducationRow })} />
    </form>
  );
}
