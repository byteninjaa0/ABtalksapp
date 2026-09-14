"use client";

import { useState, useTransition } from "react";
import type { JobType, JobWorkMode } from "@prisma/client";
import {
  createMyJobAlertAction,
  deleteMyJobAlertAction,
  toggleMyJobAlertAction,
  updateMyJobAlertAction,
} from "@/app/actions/job-alert-actions";
import type { JobAlertRow } from "@/features/job-alerts/types";

type Props = {
  initial: JobAlertRow[];
  maxAlerts: number;
};

const WORK_MODES: JobWorkMode[] = ["REMOTE", "HYBRID", "ONSITE"];
const OPP_TYPES: { value: JobType; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PART_TIME", label: "Part-time" },
];

type Draft = {
  name: string;
  skillsInput: string;
  skills: string[];
  role: string;
  location: string;
  workMode: JobWorkMode | "";
  opportunityType: JobType | "";
};

function emptyDraft(): Draft {
  return {
    name: "",
    skillsInput: "",
    skills: [],
    role: "",
    location: "",
    workMode: "",
    opportunityType: "",
  };
}

function draftFrom(row: JobAlertRow): Draft {
  return {
    name: row.name,
    skillsInput: "",
    skills: [...row.skills],
    role: row.role ?? "",
    location: row.location ?? "",
    workMode: row.workMode ?? "",
    opportunityType: row.opportunityType ?? "",
  };
}

export function JobAlertsScreen({ initial, maxAlerts }: Props) {
  const [alerts, setAlerts] = useState<JobAlertRow[]>(initial);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const atLimit = alerts.length >= maxAlerts;

  function beginCreate() {
    setMessage(null);
    setError(null);
    setEditingId(null);
    setDraft(emptyDraft());
    setCreating(true);
  }

  function beginEdit(row: JobAlertRow) {
    setMessage(null);
    setError(null);
    setCreating(false);
    setDraft(draftFrom(row));
    setEditingId(row.id);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setError(null);
  }

  function addSkillToDraft() {
    const raw = draft.skillsInput.trim();
    if (!raw) return;
    const dupe = draft.skills.some(
      (s) => s.toLowerCase() === raw.toLowerCase(),
    );
    if (dupe) {
      setDraft((d) => ({ ...d, skillsInput: "" }));
      return;
    }
    setDraft((d) => ({
      ...d,
      skills: [...d.skills, raw].slice(0, 25),
      skillsInput: "",
    }));
  }

  function removeSkillFromDraft(skill: string) {
    setDraft((d) => ({ ...d, skills: d.skills.filter((x) => x !== skill) }));
  }

  function submitDraft() {
    setMessage(null);
    setError(null);
    const payload = {
      name: draft.name.trim() || undefined,
      skills: draft.skills,
      role: draft.role || undefined,
      location: draft.location || undefined,
      workMode: draft.workMode || null,
      opportunityType: draft.opportunityType || null,
      enabled: true,
    };
    startBusy(async () => {
      if (editingId) {
        const res = await updateMyJobAlertAction({ id: editingId, ...payload });
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setAlerts((rows) =>
          rows.map((r) => (r.id === editingId ? res.data.alert : r)),
        );
        setEditingId(null);
        setMessage("Alert updated.");
      } else {
        const res = await createMyJobAlertAction(payload);
        if (!res.ok) {
          setError(res.message);
          return;
        }
        setAlerts((rows) => [res.data.alert, ...rows]);
        setCreating(false);
        setMessage("Alert created.");
      }
    });
  }

  function handleToggle(row: JobAlertRow, next: boolean) {
    setMessage(null);
    setError(null);
    startBusy(async () => {
      const res = await toggleMyJobAlertAction({ id: row.id, enabled: next });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAlerts((rows) =>
        rows.map((r) => (r.id === row.id ? res.data.alert : r)),
      );
    });
  }

  function handleDelete(row: JobAlertRow) {
    if (
      !window.confirm(
        `Delete "${row.name}"? Its criteria will be lost. You can add a new alert any time.`,
      )
    ) {
      return;
    }
    setMessage(null);
    setError(null);
    startBusy(async () => {
      const res = await deleteMyJobAlertAction({ id: row.id });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAlerts((rows) => rows.filter((r) => r.id !== row.id));
      if (editingId === row.id) setEditingId(null);
      setMessage("Alert deleted.");
    });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {(message || error) && (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            borderRadius: 6,
            background: error ? "#fef2f2" : "#f0fdf4",
            color: error ? "#b91c1c" : "#166534",
            fontSize: 14,
          }}
        >
          {error ?? message}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <p style={{ margin: 0, color: "#555", fontSize: 14 }}>
          {alerts.length === 0
            ? "You don't have any job alerts yet."
            : `${alerts.length} of ${maxAlerts} alerts used.`}
        </p>
        <button
          type="button"
          onClick={beginCreate}
          disabled={atLimit || creating || busy}
          style={{
            padding: "10px 18px",
            background: atLimit ? "#9ca3af" : "#03535F",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: atLimit || busy ? "not-allowed" : "pointer",
          }}
        >
          + Add job alert
        </button>
      </div>

      {atLimit && !creating && (
        <p style={{ margin: 0, color: "#92400e", fontSize: 13 }}>
          You have reached the maximum of {maxAlerts} alerts. Delete one to add
          another.
        </p>
      )}

      {creating && (
        <AlertForm
          draft={draft}
          setDraft={setDraft}
          onCancel={cancelForm}
          onSubmit={submitDraft}
          onAddSkill={addSkillToDraft}
          onRemoveSkill={removeSkillFromDraft}
          submitting={busy}
          submitLabel="Create alert"
          title="New alert"
        />
      )}

      {alerts.length === 0 && !creating ? (
        <EmptyHint />
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 16,
          }}
        >
          {alerts.map((row) =>
            editingId === row.id ? (
              <li key={row.id}>
                <AlertForm
                  draft={draft}
                  setDraft={setDraft}
                  onCancel={cancelForm}
                  onSubmit={submitDraft}
                  onAddSkill={addSkillToDraft}
                  onRemoveSkill={removeSkillFromDraft}
                  submitting={busy}
                  submitLabel="Save changes"
                  title="Edit alert"
                />
              </li>
            ) : (
              <li key={row.id}>
                <AlertCard
                  row={row}
                  onEdit={() => beginEdit(row)}
                  onDelete={() => handleDelete(row)}
                  onToggle={(next) => handleToggle(row, next)}
                  busy={busy}
                />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function EmptyHint() {
  return (
    <div
      style={{
        padding: "24px",
        border: "1px dashed #d1d5db",
        borderRadius: 8,
        textAlign: "center",
        color: "#666",
      }}
    >
      Create your first alert — pick a role, skills or location, and we&apos;ll
      notify you when a matching job goes live.
    </div>
  );
}

function AlertCard({
  row,
  onEdit,
  onDelete,
  onToggle,
  busy,
}: {
  row: JobAlertRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (next: boolean) => void;
  busy: boolean;
}) {
  const summary = summarize(row);
  return (
    <article
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: "18px 20px",
        background: "#fff",
        display: "grid",
        gap: 12,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ToggleSwitch
            enabled={row.enabled}
            onChange={onToggle}
            disabled={busy}
          />
          <h3 style={{ margin: 0, fontSize: 17 }}>{row.name}</h3>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onEdit}
            style={secondaryButton}
            disabled={busy}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            style={dangerButton}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </header>

      {summary.chips.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {summary.chips.map((chip, idx) => (
            <li
              key={`${chip.label}-${idx}`}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                background: chip.tone === "skill" ? "#eef" : "#f3f4f6",
                fontSize: 13,
                color: "#1f2937",
              }}
            >
              {chip.label}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, color: "#666", fontSize: 13 }}>
          Matches every published job.
        </p>
      )}

      {!row.enabled && (
        <p style={{ margin: 0, color: "#92400e", fontSize: 12 }}>
          This alert is paused. No notifications will be sent.
        </p>
      )}
    </article>
  );
}

function summarize(row: JobAlertRow): {
  chips: { label: string; tone: "skill" | "meta" }[];
} {
  const chips: { label: string; tone: "skill" | "meta" }[] = [];
  for (const s of row.skills) chips.push({ label: s, tone: "skill" });
  if (row.role) chips.push({ label: `Role: ${row.role}`, tone: "meta" });
  if (row.location)
    chips.push({ label: `Location: ${row.location}`, tone: "meta" });
  if (row.workMode)
    chips.push({
      label:
        row.workMode.charAt(0) + row.workMode.slice(1).toLowerCase(),
      tone: "meta",
    });
  if (row.opportunityType) {
    const label =
      OPP_TYPES.find((o) => o.value === row.opportunityType)?.label ??
      row.opportunityType;
    chips.push({ label, tone: "meta" });
  }
  return { chips };
}

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      aria-pressed={enabled}
      disabled={disabled}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: enabled ? "#03535F" : "#d1d5db",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: 0,
        transition: "background 120ms",
      }}
    >
      <span
        style={{
          display: "block",
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 2,
          left: enabled ? 20 : 2,
          transition: "left 120ms",
        }}
      />
    </button>
  );
}

function AlertForm({
  draft,
  setDraft,
  onCancel,
  onSubmit,
  onAddSkill,
  onRemoveSkill,
  submitting,
  submitLabel,
  title,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  onCancel: () => void;
  onSubmit: () => void;
  onAddSkill: () => void;
  onRemoveSkill: (skill: string) => void;
  submitting: boolean;
  submitLabel: string;
  title: string;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: "18px 20px",
        background: "#fff",
        display: "grid",
        gap: 16,
      }}
    >
      <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>

      <Field label="Name">
        <input
          type="text"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          placeholder="e.g. React roles in Bengaluru"
          maxLength={80}
          style={inputStyle}
        />
      </Field>

      <Field label="Skills (any match)">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={draft.skillsInput}
            onChange={(e) =>
              setDraft((d) => ({ ...d, skillsInput: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                onAddSkill();
              }
            }}
            placeholder="e.g. React"
            style={inputStyle}
          />
          <button type="button" onClick={onAddSkill} style={secondaryButton}>
            Add
          </button>
        </div>
        {draft.skills.length > 0 && (
          <ul
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              listStyle: "none",
              padding: 0,
              margin: "8px 0 0",
            }}
          >
            {draft.skills.map((s) => (
              <li
                key={s}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "#eef",
                  fontSize: 13,
                  display: "inline-flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                {s}
                <button
                  type="button"
                  onClick={() => onRemoveSkill(s)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#555",
                  }}
                  aria-label={`Remove ${s}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Role (title contains)">
        <input
          type="text"
          value={draft.role}
          onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
          placeholder="e.g. Senior Engineer"
          maxLength={200}
          style={inputStyle}
        />
      </Field>

      <Field label="Location (contains)">
        <input
          type="text"
          value={draft.location}
          onChange={(e) =>
            setDraft((d) => ({ ...d, location: e.target.value }))
          }
          placeholder="e.g. Bengaluru"
          maxLength={200}
          style={inputStyle}
        />
      </Field>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <Field label="Work mode">
          <select
            value={draft.workMode}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                workMode: e.target.value as JobWorkMode | "",
              }))
            }
            style={inputStyle}
          >
            <option value="">Any</option>
            {WORK_MODES.map((m) => (
              <option key={m} value={m}>
                {m.charAt(0) + m.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Opportunity type">
          <select
            value={draft.opportunityType}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                opportunityType: e.target.value as JobType | "",
              }))
            }
            style={inputStyle}
          >
            <option value="">Any</option>
            {OPP_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 20px",
            background: "#03535F",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: submitting ? "not-allowed" : "pointer",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={secondaryButton}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#333", fontWeight: 500 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  fontFamily: "inherit",
  flex: 1,
  minWidth: 0,
};

const secondaryButton: React.CSSProperties = {
  padding: "8px 14px",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};

const dangerButton: React.CSSProperties = {
  padding: "8px 14px",
  background: "#fff",
  border: "1px solid #ef4444",
  color: "#b91c1c",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
