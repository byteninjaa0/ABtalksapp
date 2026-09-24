"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { CandidateLinkType } from "@prisma/client";
import { saveLinksAction } from "@/app/actions/candidate-profile-actions";
import { EXTRA_LINK_TYPES, LINK_TYPE_LABELS } from "@/lib/candidate-vocab";
import { useServerFieldErrors } from "./field-issues";
import { useSectionSave } from "./use-section-save";
import { useProfileWizard } from "./wizard-context";
import {
  PwAddMore,
  PwEntryCard,
  PwField,
  PwInput,
  PwRow,
  PwSelect,
} from "./wizard-fields";

export type ExtraLinkFormRow = {
  type: CandidateLinkType;
  label: string;
  url: string;
};

export type LinksFormValues = {
  linkedinUrl: string;
  githubUsername: string;
  portfolioUrl: string;
  leetcodeUrl: string;
  codechefUrl: string;
  extra: ExtraLinkFormRow[];
};

function BriefcaseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/**
 * A saved additional link, read-only.
 *
 * Built from `PwField` with an icon and a label, exactly like the LinkedIn,
 * GitHub and Portfolio fields above it — the link's own name becomes the
 * label and its URL sits in a box that matches an input's 48px height, 8px
 * radius and border. A first pass gave this its own compact pill, which was
 * tidier in isolation and read as the odd one out in the group.
 *
 * Before any of it, a saved link kept its editor mounted forever: a Type
 * dropdown, a Label box and a URL box, three rows deep, for a fact that is one
 * line long (issue #470). The data was always being stored correctly — this
 * was only ever how it was shown.
 */
function SavedLink({
  name,
  url,
  onEdit,
  onRemove,
}: {
  name: string;
  url: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <PwRow cols={1}>
      <PwField label={name} icon={<LinkIcon />}>
        <div className="pw-link-saved">
          {/* The href is whatever the candidate typed, so it opens in a new
              tab with `noreferrer` rather than navigating in place. */}
          <a
            className="pw-link-saved__url"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={url}
          >
            {url}
          </a>
          <span className="pw-link-saved__actions">
            <button type="button" className="pw-link-action" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="pw-link-action pw-link-action--danger"
              onClick={onRemove}
              aria-label={`Delete ${name} link`}
            >
              Delete
            </button>
          </span>
        </div>
      </PwField>
    </PwRow>
  );
}

export function LinksSection({ initial }: { initial: LinksFormValues }) {
  const { formId, onSaved, setDirty } = useProfileWizard();
  const { save } = useSectionSave(saveLinksAction, "Links", "links");
  const form = useForm<LinksFormValues>({ defaultValues: initial });
  const { control, register, handleSubmit, watch, setValue, formState } = form;
  const placeIssues = useServerFieldErrors(form);
  /**
   * Rows open for editing, keyed by `useFieldArray`'s own id — the index is
   * not stable, so removing row 1 would otherwise drag row 2 into edit mode.
   */
  const [editing, setEditing] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const openEditor = useCallback((id: string) => {
    setEditing((prev) => new Set(prev).add(id));
  }, []);
  const closeEditor = useCallback((id: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "extra",
  });

  useEffect(() => {
    setDirty(formState.isDirty);
  }, [formState.isDirty, setDirty]);

  return (
    <form
      id={formId}
      onSubmit={handleSubmit(async (v) => {
        if (await save(v, placeIssues)) onSaved();
      })}
    >
      <PwRow cols={1}>
        <PwField
          label="LinkedIn"
          required
          htmlFor="ln-linkedin"
          icon={<BriefcaseIcon />}
        >
          <PwInput
            id="ln-linkedin"
            type="url"
            inputMode="url"
            placeholder="Enter your LinkedIn URL"
            {...register("linkedinUrl")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField
          label="GitHub"
          required
          htmlFor="ln-github"
          icon={<CodeIcon />}
          helper="Username or full profile URL"
        >
          <PwInput
            id="ln-github"
            placeholder="https://github.com/username"
            {...register("githubUsername")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField
          label="Portfolio"
          required
          htmlFor="ln-portfolio"
          icon={<GlobeIcon />}
        >
          <PwInput
            id="ln-portfolio"
            type="url"
            inputMode="url"
            placeholder="Enter your Portfolio URL"
            {...register("portfolioUrl")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField
          label="LeetCode"
          htmlFor="ln-leetcode"
          icon={<CodeIcon />}
          
        >
          <PwInput
            id="ln-leetcode"
            type="url"
            inputMode="url"
            placeholder="Enter your LeetCode URL"
            {...register("leetcodeUrl")}
          />
        </PwField>
      </PwRow>

      <PwRow cols={1}>
        <PwField
          label="CodeChef"
          htmlFor="ln-codechef"
          icon={<CodeIcon />}
          
        >
          <PwInput
            id="ln-codechef"
            type="url"
            inputMode="url"
            placeholder="Enter your CodeChef URL"
            {...register("codechefUrl")}
          />
        </PwField>
      </PwRow>

      {fields.length > 0 ? (
        /* Not `.pw-entries`: a saved link is a field row like the ones above,
           and only the rows still being edited are entry cards. */
        <div>
          {fields.map((field, index) => {
            const linkType = watch(`extra.${index}.type`);
            const isOther = linkType === CandidateLinkType.OTHER;
            const url = (watch(`extra.${index}.url`) ?? "").trim();
            const label = (watch(`extra.${index}.label`) ?? "").trim();

            // A saved link collapses to one read-only line. It stays open
            // while it has no URL — a row you just added has nothing to show
            // yet — and while you are editing it (issue #470).
            if (url && !editing.has(field.id)) {
              return (
                <SavedLink
                  key={field.id}
                  name={isOther ? label || "Other" : (LINK_TYPE_LABELS[linkType] ?? linkType)}
                  url={url}
                  onEdit={() => openEditor(field.id)}
                  onRemove={() => remove(index)}
                />
              );
            }

            return (
              <PwEntryCard
                key={field.id}
                index={index}
                title="Link"
                onRemove={() => remove(index)}
              >
                <PwRow cols={isOther ? 2 : 1}>
                  <PwField label="Type">
                    <Controller
                      control={control}
                      name={`extra.${index}.type`}
                      render={({ field: f }) => (
                        <PwSelect
                          value={f.value}
                          onChange={(e) => {
                            const next = e.target.value as CandidateLinkType;
                            f.onChange(next);
                            if (next !== CandidateLinkType.OTHER) {
                              setValue(`extra.${index}.label`, "", {
                                shouldDirty: true,
                              });
                            }
                          }}
                        >
                          {EXTRA_LINK_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {LINK_TYPE_LABELS[t] ?? t}
                            </option>
                          ))}
                        </PwSelect>
                      )}
                    />
                  </PwField>
                  {isOther ? (
                    <PwField label="Label" htmlFor={`ln-label-${index}`}>
                      <PwInput
                        id={`ln-label-${index}`}
                        placeholder="ex: Personal blog"
                        {...register(`extra.${index}.label`)}
                      />
                    </PwField>
                  ) : null}
                </PwRow>
                <PwRow cols={1}>
                  <PwField label="URL" htmlFor={`ln-url-${index}`}>
                    <PwInput
                      id={`ln-url-${index}`}
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      {...register(`extra.${index}.url`)}
                    />
                  </PwField>
                </PwRow>
                {url ? (
                  <div className="pw-link-editrow">
                    <button
                      type="button"
                      className="pw-link-done"
                      onClick={() => closeEditor(field.id)}
                    >
                      Done
                    </button>
                  </div>
                ) : null}
              </PwEntryCard>
            );
          })}
        </div>
      ) : null}

      <PwAddMore
        onClick={() =>
          append({ type: CandidateLinkType.CODEFORCES, label: "", url: "" })
        }
      />
    </form>
  );
}
