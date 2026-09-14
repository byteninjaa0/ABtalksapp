"use client";

import { useState, useTransition } from "react";
import type { JobType, JobWorkMode } from "@prisma/client";
import {
  deleteMyJobAlertAction,
  saveMyJobAlertAction,
  toggleMyJobAlertAction,
} from "@/app/actions/job-alert-actions";
import type { JobAlertRow } from "@/features/job-alerts/types";

type Props = {
  initial: JobAlertRow | null;
};

/**
 * Three modes:
 * - `empty`   : no alert exists. Only the form is shown.
 * - `view`    : an alert exists. Show a read-only summary with Edit +
 *               Delete. This is the default when `initial` is present.
 * - `edit`    : same fields as `empty` but pre-filled, with a Cancel that
 *               returns to `view`.
 */
type Mode = "empty" | "view" | "edit";

type FormState = {
  enabled: boolean;
  skillsInput: string;
  skills: string[];
  role: string;
  location: string;
  workMode: JobWorkMode | "";
  opportunityType: JobType | "";
};

const WORK_MODES: JobWorkMode[] = ["REMOTE", "HYBRID", "ONSITE"];
const OPP_TYPES: { value: JobType; label: string }[] = [
  { value: "FULL_TIME", label: "Full-time" },
  { value: "INTERNSHIP", label: "Internship" },
  { value: "CONTRACT", label: "Contract" },
  { value: "PART_TIME", label: "Part-time" },
];

function fromInitial(row: JobAlertRow | null): FormState {
  return {
    enabled: row?.enabled ?? true,
    skillsInput: "",
    skills: row?.skills ?? [],
    role: row?.role ?? "",
    location: row?.location ?? "",
    workMode: row?.workMode ?? "",
    opportunityType: row?.opportunityType ?? "",
  };
}

function initialMode(row: JobAlertRow | null): Mode {
  return row ? "view" : "empty";
}

export function JobAlertForm({ initial }: Props) {
  const [current, setCurrent] = useState<JobAlertRow | null>(initial);
  const [mode, setMode] = useState<Mode>(() => initialMode(initial));
  const [state, setState] = useState<FormState>(() => fromInitial(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [deleting, startDelete] = useTransition();

  function addSkill() {
    const raw = state.skillsInput.trim();
    if (!raw) return;
    const dupe = state.skills.some((s) => s.toLowerCase() === raw.toLowerCase());
    if (dupe) {
      setState((s) => ({ ...s, skillsInput: "" }));
      return;
    }
    setState((s) => ({
      ...s,
      skills: [...s.skills, raw].slice(0, 25),
      skillsInput: "",
    }));
  }

  function removeSkill(skill: string) {
    setState((s) => ({ ...s, skills: s.skills.filter((x) => x !== skill) }));
  }

  function handleSave() {
    setMessage(null);
    setError(null);
    startSave(async () => {
      const res = await saveMyJobAlertAction({
        skills: state.skills,
        role: state.role || undefined,
        location: state.location || undefined,
        workMode: state.workMode || null,
        opportunityType: state.opportunityType || null,
        enabled: state.enabled,
      });
      if (!res.ok) {
        setError(res.message);
      } else {
        setMessage("Alert saved.");
        setCurrent(res.data.alert);
        setState(fromInitial(res.data.alert));
        setMode("view");
      }
    });
  }

  function handleToggle(next: boolean) {
    setMessage(null);
    setError(null);
    startToggle(async () => {
      const res = await toggleMyJobAlertAction({ enabled: next });
      if (!res.ok) {
        // No row yet — flip local state and stay in whatever mode we're in;
        // Save creates the first row.
        setState((s) => ({ ...s, enabled: next }));
        if (next) {
          setMessage(
            "Add your criteria and press Save to create your first alert.",
          );
        }
        return;
      }
      setCurrent(res.data.alert);
      setState(fromInitial(res.data.alert));
      setMessage(next ? "Alerts turned on." : "Alerts turned off.");
    });
  }

  function handleDelete() {
    if (
      !window.confirm(
        "Delete this job alert? Your criteria will be lost. You can create a new alert any time.",
      )
    ) {
      return;
    }
    setMessage(null);
    setError(null);
    startDelete(async () => {
      const res = await deleteMyJobAlertAction();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setCurrent(null);
      setState(fromInitial(null));
      setMode("empty");
      setMessage("Alert deleted.");
    });
  }

  function beginEdit() {
    setMessage(null);
    setError(null);
    setState(fromInitial(current));
    setMode("edit");
  }

  function cancelEdit() {
    setMessage(null);
    setError(null);
    setState(fromInitial(current));
    setMode("view");
  }

  if (mode === "view" && current) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <label style={masterToggleStyle}>
          <input
            type="checkbox"
            checked={current.enabled}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={toggling}
          />
          <span>
            <strong>
              Alerts are {current.enabled ? "on" : "off"}.
            </strong>{" "}
            <span style={{ color: "#666" }}>
              {current.enabled
                ? "You will be notified once per matching job."
                : "Your criteria are saved but no alerts will fire."}
            </span>
          </span>
        </label>

        <section style={cardStyle}>
          <header
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Your saved alert</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={beginEdit}
                style={secondaryButton}
                disabled={deleting}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={dangerButton}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </header>

          <dl style={dlStyle}>
            <SummaryRow
              label="Skills"
              value={
                current.skills.length > 0
                  ? current.skills.join(", ")
                  : "Any"
              }
            />
            <SummaryRow label="Role" value={current.role?.trim() || "Any"} />
            <SummaryRow
              label="Location"
              value={current.location?.trim() || "Any"}
            />
            <SummaryRow
              label="Work mode"
              value={
                current.workMode
                  ? current.workMode.charAt(0) +
                    current.workMode.slice(1).toLowerCase()
                  : "Any"
              }
            />
            <SummaryRow
              label="Opportunity type"
              value={
                OPP_TYPES.find((o) => o.value === current.opportunityType)
                  ?.label ?? "Any"
              }
            />
          </dl>

          {(message || error) && (
            <p
              style={{
                marginTop: 12,
                marginBottom: 0,
                color: error ? "#b91c1c" : "#166534",
              }}
            >
              {error ?? message}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      style={{ display: "grid", gap: 20 }}
    >
      <label style={masterToggleStyle}>
        <input
          type="checkbox"
          checked={state.enabled}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={toggling}
        />
        <span>
          <strong>Alerts are {state.enabled ? "on" : "off"}.</strong>{" "}
          <span style={{ color: "#666" }}>
            {state.enabled
              ? "You will be notified once per matching job."
              : "You will not receive any job alerts."}
          </span>
        </span>
      </label>

      <Field label="Skills (any match)">
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={state.skillsInput}
            onChange={(e) =>
              setState((s) => ({ ...s, skillsInput: e.target.value }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addSkill();
              }
            }}
            placeholder="e.g. React"
            style={inputStyle}
          />
          <button type="button" onClick={addSkill} style={secondaryButton}>
            Add
          </button>
        </div>
        {state.skills.length > 0 && (
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
            {state.skills.map((s) => (
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
                  onClick={() => removeSkill(s)}
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
          value={state.role}
          onChange={(e) => setState((s) => ({ ...s, role: e.target.value }))}
          placeholder="e.g. Senior Engineer"
          maxLength={200}
          style={inputStyle}
        />
      </Field>

      <Field label="Location (contains)">
        <input
          type="text"
          value={state.location}
          onChange={(e) =>
            setState((s) => ({ ...s, location: e.target.value }))
          }
          placeholder="e.g. Bengaluru"
          maxLength={200}
          style={inputStyle}
        />
      </Field>

      <Field label="Work mode">
        <select
          value={state.workMode}
          onChange={(e) =>
            setState((s) => ({
              ...s,
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
          value={state.opportunityType}
          onChange={(e) =>
            setState((s) => ({
              ...s,
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

      <div
        style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}
      >
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            background: "#03535F",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save alert"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={cancelEdit}
            style={secondaryButton}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        {message && <span style={{ color: "#166534" }}>{message}</span>}
        {error && <span style={{ color: "#b91c1c" }}>{error}</span>}
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 8,
        padding: "8px 0",
        borderBottom: "1px solid #eee",
      }}
    >
      <dt style={{ color: "#666", fontSize: 13 }}>{label}</dt>
      <dd style={{ margin: 0, color: "#111", fontSize: 14 }}>{value}</dd>
    </div>
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

const masterToggleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
  background: "#f6f6f6",
  borderRadius: 8,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "16px 20px",
  background: "#fff",
};

const dlStyle: React.CSSProperties = {
  margin: 0,
  display: "grid",
};
