"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const MONTH_LABELS: Record<string, string> = {
  "1": "Jan",
  "2": "Feb",
  "3": "Mar",
  "4": "Apr",
  "5": "May",
  "6": "Jun",
  "7": "Jul",
  "8": "Aug",
  "9": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dec",
};

export const CURRENT_YEAR = new Date().getFullYear();

/** Descending, newest first — nobody scrolls up from 1975 to find last year. */
function yearRange(from: number, to: number): string[] {
  const out: string[] = [];
  for (let y = to; y >= from; y--) out.push(String(y));
  return out;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/* ─── Anchored menus ──────────────────────────────────────────────────────
   Month / year pickers and suggestion lists used to be absolutely positioned
   inside `.pw-section-body`, which is the sheet's scroll container — so a menu
   opened near the bottom of a long form was cut off by the container it lived
   in. They are portalled to <body> and positioned against the trigger's
   viewport rect instead, flipping above it when there is more room there.
   ------------------------------------------------------------------------- */

/** Gap between trigger and menu, viewport margin, and the tallest menu. */
const MENU_GAP = 6;
const MENU_EDGE = 12;
const MENU_MAX_H = 260;
/** Below this, flipping up beats scrolling a stub of a menu. */
const MENU_MIN_H = 160;

/**
 * Positions a portalled menu against its trigger.
 *
 * Deliberately imperative: the measurement happens in the ref callback, which
 * runs before paint, so the menu is never rendered at a stale position for a
 * frame. Holding the rect in state would mean a render pass per scroll event
 * for a value nothing else reads.
 */
function useAnchoredMenu<T extends HTMLElement>(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
) {
  const menuRef = useRef<T | null>(null);

  const place = useCallback(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - MENU_GAP - MENU_EDGE;
    const above = rect.top - MENU_GAP - MENU_EDGE;
    const flipUp = below < Math.min(MENU_MAX_H, MENU_MIN_H) && above > below;
    const room = Math.max(120, Math.min(MENU_MAX_H, flipUp ? above : below));
    menu.style.left = `${rect.left}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${room}px`;
    if (flipUp) {
      menu.style.top = "auto";
      menu.style.bottom = `${window.innerHeight - rect.top + MENU_GAP}px`;
    } else {
      menu.style.bottom = "auto";
      menu.style.top = `${rect.bottom + MENU_GAP}px`;
    }
  }, [anchorRef]);

  const setMenu = useCallback(
    (node: T | null) => {
      menuRef.current = node;
      if (node) place();
    },
    [place],
  );

  useEffect(() => {
    if (!open) return;
    // Capture: the sheet body scrolls, not the window, and a scroll there does
    // not bubble.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return { setMenu, menuRef };
}

function markFilled(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if ("value" in el && String(el.value).length > 0) el.classList.add("pw-filled");
  else el.classList.remove("pw-filled");
  el.classList.remove("pw-invalid");
}

export function PwRow({
  cols,
  grow,
  children,
}: {
  cols: 1 | 2 | 3;
  grow?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pw-row pw-cols-${cols}${grow ? " pw-grow" : ""}`}>
      {children}
    </div>
  );
}

export function PwField({
  label,
  required,
  verified,
  counter,
  helper,
  error,
  htmlFor,
  icon,
  area,
  inlineCheck,
  children,
}: {
  label?: string;
  required?: boolean;
  verified?: boolean;
  counter?: string;
  helper?: string;
  error?: string | null;
  htmlFor?: string;
  icon?: ReactNode;
  area?: boolean;
  inlineCheck?: boolean;
  children: ReactNode;
}) {
  const className = [
    "pw-field",
    icon ? "pw-field-linked" : "",
    area ? "pw-field-area" : "",
    inlineCheck ? "pw-field-inline-check" : "",
    error ? "pw-has-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      {icon ? <span className="pw-field-icon">{icon}</span> : null}
      {label ? (
        <div className="pw-field-top">
          <label htmlFor={htmlFor}>
            {label}
            {/* The asterisk is decorative; the sr-only word beside it is what
                actually tells a screen reader the field is needed. It marks
                what completes the section — nothing here blocks a save. */}
            {required ? (
              <>
                <span className="pw-req" aria-hidden>
                  *
                </span>
                <span className="pw-sr-only"> (required)</span>
              </>
            ) : null}
          </label>
          {verified ? <span className="pw-verified">Verified</span> : null}
          {counter ? <span className="pw-counter">{counter}</span> : null}
        </div>
      ) : null}
      {children}
      {helper ? <div className="pw-helper">{helper}</div> : null}
      <div className="pw-error-msg">{error ?? "This field is required."}</div>
    </div>
  );
}

export const PwInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function PwInput({ className, onInput, onChange, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={className}
      onInput={(e) => {
        markFilled(e.currentTarget);
        onInput?.(e);
      }}
      onChange={(e) => {
        markFilled(e.currentTarget);
        onChange?.(e);
      }}
    />
  );
});

/**
 * Text input with a white suggestion panel. Suggestions are optional — any
 * typed value is kept (same contract as the old `<datalist>` Role field).
 */
export const PwSuggest = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    suggestions: readonly string[];
    /**
     * Ranks `suggestions` against what has been typed. Given one, it replaces
     * the plain substring filter entirely — which is how the skill catalog
     * gets to answer "k8s" with Kubernetes, a string that shares no substring
     * with the query at all.
     */
    search?: (query: string) => readonly string[];
    /**
     * Fired only when a suggestion is actually chosen, never on typing — so a
     * caller can fill in a companion field (city → state) without doing it on
     * every keystroke of a half-typed word.
     */
    onPick?: (value: string) => void;
    /**
     * How many matches to show. Cities stay capped so the panel stays short;
     * education departments need the full branch list (~50).
     */
    maxSuggestions?: number;
  }
>(function PwSuggest(
  {
    suggestions,
    search,
    onPick,
    maxSuggestions = 12,
    className,
    onChange,
    onFocus,
    onBlur,
    onInput,
    ...props
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() =>
    String(props.value ?? props.defaultValue ?? ""),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimer = useRef<number | null>(null);
  const { setMenu } = useAnchoredMenu<HTMLUListElement>(open, inputRef);

  function setRefs(node: HTMLInputElement | null) {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  const q = text.trim().toLowerCase();
  const allowed = new Set(suggestions.map((s) => s.toLowerCase()));
  const filtered = (
    search
      ? // The matcher ranks the whole catalog; `suggestions` still decides what
        // is offerable, so an already-picked tag stays out of the list.
        search(q).filter((s) => allowed.has(s.toLowerCase()))
      : suggestions.filter((s) => (q ? s.toLowerCase().includes(q) : true))
  ).slice(0, maxSuggestions);

  function pick(value: string) {
    const el = inputRef.current;
    if (!el) return;
    const proto = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    );
    proto?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    setText(value);
    markFilled(el);
    setOpen(false);
    onPick?.(value);
  }

  return (
    <div className="pw-suggest">
      <input
        {...props}
        ref={setRefs}
        className={className}
        autoComplete="off"
        onFocus={(e) => {
          if (blurTimer.current != null) {
            window.clearTimeout(blurTimer.current);
            blurTimer.current = null;
          }
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          blurTimer.current = window.setTimeout(() => setOpen(false), 120);
          onBlur?.(e);
        }}
        onInput={(e) => {
          markFilled(e.currentTarget);
          onInput?.(e);
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          markFilled(e.currentTarget);
          onChange?.(e);
        }}
      />
      {open && filtered.length > 0
        ? createPortal(
            <ul
              ref={setMenu}
              className="pw-suggest-list pw-anchored"
              role="listbox"
              // Keep the wheel inside the panel — otherwise the sheet behind
              // scrolls and the list feels stuck after the first screenful.
              onWheel={(e) => e.stopPropagation()}
            >
              {filtered.map((s) => (
                <li key={s} role="option" aria-selected={s === text}>
                  <button
                    type="button"
                    className="pw-suggest-option"
                    // preventDefault keeps focus on the input, so the blur
                    // timer never closes the list out from under the click.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(s);
                    }}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
});

export const PwTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function PwTextarea({ className, onInput, onChange, ...props }, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={className}
      onInput={(e) => {
        markFilled(e.currentTarget);
        onInput?.(e);
      }}
      onChange={(e) => {
        markFilled(e.currentTarget);
        onChange?.(e);
      }}
    />
  );
});

export const PwSelect = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function PwSelect({ className, onChange, children, ...props }, ref) {
  return (
    <select
      {...props}
      ref={ref}
      className={className}
      onChange={(e) => {
        markFilled(e.currentTarget);
        onChange?.(e);
      }}
    >
      {children}
    </select>
  );
});

/** Custom select that always opens downward (native `<select>` may flip up). */
export function PwMenuSelect({
  id,
  name,
  "aria-label": ariaLabel,
  value,
  onChange,
  options,
  labels,
  placeholder,
  disabled,
  invalid,
}: {
  id?: string;
  name?: string;
  "aria-label": string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  /** Optional display text per option value. Falls back to the value itself. */
  labels?: Record<string, string>;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const { setMenu, menuRef } = useAnchoredMenu<HTMLUListElement>(
    open,
    triggerRef,
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      // The list is portalled to <body>, so it is no longer a descendant of
      // the root — it has to be tested separately or every pick closes first.
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, menuRef]);

  const label = value ? (labels?.[value] ?? value) : placeholder;

  return (
    <div
      ref={rootRef}
      className={`pw-menu-select${open ? " pw-open" : ""}${value ? " pw-filled" : ""}`}
    >
      <button
        type="button"
        id={id}
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        className={`pw-menu-select-trigger${invalid ? " pw-invalid" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? undefined : "pw-menu-select-placeholder"}>
          {label}
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open
        ? createPortal(
            <ul
              ref={setMenu}
              className="pw-menu-select-list pw-anchored"
              role="listbox"
            >
              <li role="option" aria-selected={!value}>
                <button
                  type="button"
                  className="pw-menu-select-option"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange("");
                    setOpen(false);
                  }}
                >
                  {placeholder}
                </button>
              </li>
              {options.map((opt) => (
                <li key={opt} role="option" aria-selected={opt === value}>
                  <button
                    type="button"
                    className={`pw-menu-select-option${opt === value ? " pw-selected" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(opt);
                      setOpen(false);
                    }}
                  >
                    {labels?.[opt] ?? opt}
                  </button>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

export function PwMonthYear({
  monthId,
  yearId,
  monthName,
  yearName,
  month,
  year,
  onMonthChange,
  onYearChange,
  disabled,
  invalid,
  fromYear = 1975,
  toYear = CURRENT_YEAR + 6,
  maxMonth,
  minMonth,
}: {
  monthId?: string;
  yearId?: string;
  monthName?: string;
  yearName?: string;
  month: number | null;
  year: number | null;
  onMonthChange: (v: number | null) => void;
  onYearChange: (v: number | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Inclusive year window. Callers narrow this so impossible dates cannot be picked. */
  fromYear?: number;
  toYear?: number;
  /** Caps the month list — used to stop "this year, next month". */
  maxMonth?: number;
  /** Floors the month list — used to stop "this year, last month". */
  minMonth?: number;
}) {
  const years = yearRange(Math.min(fromYear, toYear), toYear);
  const months = MONTHS.filter(
    (m) =>
      (maxMonth === undefined || Number(m) <= maxMonth) &&
      (minMonth === undefined || Number(m) >= minMonth),
  );
  return (
    <div className="pw-date-pair">
      <PwMenuSelect
        id={monthId}
        name={monthName}
        aria-label="Month"
        disabled={disabled}
        invalid={invalid}
        placeholder="Month"
        value={month === null ? "" : String(month)}
        options={months}
        labels={MONTH_LABELS}
        onChange={(v) => onMonthChange(v === "" ? null : Number(v))}
      />
      <PwMenuSelect
        id={yearId}
        name={yearName}
        aria-label="Year"
        disabled={disabled}
        invalid={invalid}
        placeholder="Year"
        value={year === null ? "" : String(year)}
        options={years}
        onChange={(v) => onYearChange(v === "" ? null : Number(v))}
      />
    </div>
  );
}

export function PwCheckbox({
  id,
  checked,
  onChange,
  children,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="pw-checkbox" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

export function PwCheckGroup({
  options,
  value,
  onChange,
}: {
  options: readonly { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="pw-checkgroup">
      {options.map((o) => {
        const checked = value.includes(o.value);
        return (
          <label key={o.value} className="pw-checkbox">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, o.value]
                    : value.filter((v) => v !== o.value),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function PwTogglePanel({
  id,
  title,
  text,
  checked,
  onChange,
}: {
  id?: string;
  title: string;
  text: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const autoId = useId();
  const switchId = id ?? autoId;
  const on = Boolean(checked);
  return (
    <div
      className={`pw-toggle-panel${on ? " pw-on" : ""}`}
      onClick={() => onChange(!on)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          onChange(!on);
        }
      }}
      role="switch"
      aria-checked={on}
      aria-labelledby={`${switchId}-title`}
      tabIndex={0}
    >
      <div className="pw-toggle-copy">
        <div className="pw-toggle-title" id={`${switchId}-title`}>
          {title}
        </div>
        <div className="pw-toggle-text">{text}</div>
      </div>
      <span className="pw-switch" aria-hidden>
        <span className={on ? "pw-switch-track pw-checked" : "pw-switch-track"} />
      </span>
    </div>
  );
}

export function PwTags({
  id,
  values,
  onChange,
  placeholder,
  helper,
  noAddButton,
  quickAdds,
  suggestions,
  searchSuggestions,
  normalize,
  emptyText,
}: {
  id?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  helper?: string;
  noAddButton?: boolean;
  quickAdds?: readonly string[];
  /** Offered in a dropdown as you type. Free text is still accepted. */
  suggestions?: readonly string[];
  /** Alias-aware ranking over `suggestions`. See PwSuggest. */
  searchSuggestions?: (query: string) => readonly string[];
  /** Folds a typed value onto a canonical spelling before it is added. */
  normalize?: (raw: string) => string;
  emptyText?: string;
}) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = (normalize ? normalize(raw) : raw).trim();
    if (!v) return;
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      onChange([...values, v]);
    }
    setDraft("");
  }

  return (
    <div>
      <div className="pw-tag-input-row">
        {suggestions && suggestions.length > 0 ? (
          <PwSuggest
            id={id}
            value={draft}
            search={searchSuggestions}
            suggestions={suggestions.filter(
              (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
            )}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                // Enter here must add a tag, never submit the section.
                e.preventDefault();
                e.stopPropagation();
                add(draft);
              }
            }}
          />
        ) : (
          <input
            id={id}
            type="text"
            value={draft}
            placeholder={placeholder}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                e.stopPropagation();
                add(draft);
              }
            }}
          />
        )}
        {noAddButton ? null : (
          <button
            type="button"
            className="pw-tag-add"
            aria-label="Add"
            onClick={() => add(draft)}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {helper ? <div className="pw-helper">{helper}</div> : null}
      {quickAdds && quickAdds.length > 0 ? (
        <div className="pw-quick-adds">
          <div className="pw-quick-label">Quick adds</div>
          <div className="pw-quick-row">
            {quickAdds.map((q) => (
              <button
                key={q}
                type="button"
                className="pw-quick-chip"
                onClick={() => add(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={`pw-tag-list${emptyText ? " pw-tag-list-boxed" : ""}`}>
        {values.length === 0 && emptyText ? (
          <div className="pw-tag-empty">{emptyText}</div>
        ) : (
          values.map((t) => (
            <span key={t} className="pw-tag-chip">
              <span>{t}</span>
              <button
                type="button"
                className="pw-tag-remove"
                aria-label={`Remove ${t}`}
                onClick={() => onChange(values.filter((x) => x !== t))}
              >
                <CloseIcon />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export function PwEntryCard({
  index,
  title,
  onRemove,
  children,
}: {
  index: number;
  title: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="pw-entry">
      <div className="pw-entry-head">
        <div className="pw-entry-title">
          {title} {index + 1}
        </div>
        <button
          type="button"
          className="pw-entry-remove"
          title="Delete this entry"
          aria-label={`Remove ${title.toLowerCase()} ${index + 1}`}
          onClick={onRemove}
        >
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          <span>Delete</span>
        </button>
      </div>
      {children}
    </div>
  );
}

export function PwAddMore({
  onClick,
  children = "+ Add More",
}: {
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="pw-add-more" onClick={onClick}>
      {children}
    </button>
  );
}

export function PwNote({
  muted,
  children,
}: {
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={muted ? "pw-note pw-note-muted" : "pw-note"}>{children}</div>
  );
}

/**
 * Inert (D5): holds the File in local state and submits nothing.
 * Wiring (upload + profile autofill) is a later plan.
 */
export function PwFileDrop({
  id,
  accept = ".pdf,.doc,.docx",
  maxSizeMB = 5,
  hint = "PDF or DOCX — up to 5 MB. Drop a file here or browse.",
}: {
  id?: string;
  accept?: string;
  maxSizeMB?: number;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const autoId = useId();
  const inputId = id ?? autoId;

  function acceptFile(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    const okType = accept.split(",").some((ext) =>
      f.name.toLowerCase().endsWith(ext.trim().toLowerCase()),
    );
    if (!okType) {
      setError("Use a PDF or DOCX file.");
      return;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (f.size > maxBytes) {
      setError(
        `That file is ${formatBytes(f.size)}. The limit is ${maxSizeMB} MB.`,
      );
      return;
    }
    setError(null);
    setFile({ name: f.name, size: f.size });
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    acceptFile(e.target.files);
  }

  return (
    <PwField
      label="Resume"
      htmlFor={inputId}
      helper="Saved when resume upload ships"
      error={error}
    >
      <div
        className={[
          "pw-file-drop",
          dragging ? "pw-dragging" : "",
          file ? "pw-has-file" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragging(false);
          acceptFile(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="pw-file-input"
          accept={accept}
          onChange={onInputChange}
        />
        {file ? (
          <div className="pw-file-body">
            <span className="pw-file-icon pw-file-icon-doc">
              <FileIcon />
            </span>
            <span className="pw-file-copy">
              <span className="pw-file-title">{file.name}</span>
              <span className="pw-file-hint">{formatBytes(file.size)} · uploaded</span>
            </span>
            <button
              type="button"
              className="pw-file-browse"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </button>
            <button
              type="button"
              className="pw-file-remove"
              aria-label="Remove resume"
              onClick={() => {
                setFile(null);
                setError(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
          <div className="pw-file-body">
            <span className="pw-file-icon">
              <UploadIcon />
            </span>
            <span className="pw-file-copy">
              <span className="pw-file-title">Upload your resume</span>
              <span className="pw-file-hint">{hint}</span>
            </span>
            <button
              type="button"
              className="pw-file-browse"
              onClick={() => inputRef.current?.click()}
            >
              Browse
            </button>
          </div>
        )}
      </div>
    </PwField>
  );
}
