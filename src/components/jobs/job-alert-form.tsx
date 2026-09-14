"use client";

import { useState, useTransition } from "react";
import type { JobType, JobWorkMode } from "@prisma/client";
import {
  saveMyJobAlertAction,
  toggleMyJobAlertAction,
} from "@/app/actions/job-alert-actions";
import type { JobAlertRow } from "@/features/job-alerts/types";

type Props = {
  initial: JobAlertRow | null;
};

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

export function JobAlertForm({ initial }: Props) {
  const [state, setState] = useState<FormState>(() => fromInitial(initial));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [toggling, startToggle] = useTransition();

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
        setState(fromInitial(res.data.alert));
      }
    });
  }

  function handleToggle(next: boolean) {
    setMessage(null);
    setError(null);
    startToggle(async () => {
      const res = await toggleMyJobAlertAction({ enabled: next });
      if (!res.ok) {
        if (next) {
          // No row yet — save first to create it.
          setState((s) => ({ ...s, enabled: true }));
          setMessage(
            "Add your criteria and press Save to create your first alert.",
          );
        } else {
          setError(res.message);
        }
        return;
      }
      setState(fromInitial(res.data.alert));
      setMessage(next ? "Alerts turned on." : "Alerts turned off.");
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      style={{ display: "grid", gap: 20 }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          background: "#f6f6f6",
          borderRadius: 8,
        }}
      >
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
          {saving ? "Saving…" : "Save alert"}
        </button>
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
