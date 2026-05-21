import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type GroupField = {
  value: number | null;
  integer?: boolean;
  min?: number;
  /** If false, empty is invalid. Default false. */
  nullable?: boolean;
  width?: number;
  placeholder?: string;
  /** Aria label for this input. */
  label?: string;
};

type InlineNumberGroupProps = {
  fields: GroupField[];
  /** Rendered between inputs in edit mode; length should be fields.length - 1. */
  separators?: React.ReactNode[];
  /** Trailing label/unit (e.g. "cm", "days") shown in both modes. */
  suffix?: React.ReactNode;
  /** Read-mode display. */
  display: React.ReactNode;
  /** Commit all fields atomically. Receive parsed values in field order. */
  onSave: (values: (number | null)[]) => Promise<void>;
  /** Cross-field validation. Return { fieldIndex, message } or message. */
  validateGroup?: (values: (number | null)[]) => { fieldIndex?: number; message: string } | null;
  style?: React.CSSProperties;
};

function parseField(raw: string, f: GroupField): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (f.nullable) return { value: null, error: null };
    return { value: null, error: "Required" };
  }
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { value: null, error: "Must be a number" };
  if (f.integer && !Number.isInteger(n)) return { value: null, error: "Whole number" };
  if (f.min != null && n < f.min) return { value: null, error: `≥ ${f.min}` };
  return { value: n, error: null };
}

export function InlineNumberGroup({
  fields,
  separators = [],
  suffix,
  display,
  onSave,
  validateGroup,
  style,
}: InlineNumberGroupProps) {
  const [editing, setEditing] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [drafts, setDrafts] = useState<string[]>(() =>
    fields.map((f) => (f.value == null ? "" : String(f.value))),
  );
  const [error, setError] = useState<{ index?: number; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const skipBlurRef = useRef(false);

  // Reset drafts when entering edit mode or when external values change
  const start = (idx: number) => {
    setDrafts(fields.map((f) => (f.value == null ? "" : String(f.value))));
    setError(null);
    setFocusIdx(idx);
    setEditing(true);
  };

  useEffect(() => {
    if (editing) {
      const el = inputRefs.current[focusIdx];
      if (el) {
        el.focus();
        el.select();
      }
    }
  }, [editing, focusIdx]);

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = async () => {
    // Per-field parse
    const parsed: (number | null)[] = [];
    for (let i = 0; i < fields.length; i++) {
      const { value, error: e } = parseField(drafts[i] ?? "", fields[i]);
      if (e) {
        setError({ index: i, message: e });
        inputRefs.current[i]?.focus();
        return;
      }
      parsed.push(value);
    }
    if (validateGroup) {
      const g = validateGroup(parsed);
      if (g) {
        setError({ index: g.fieldIndex, message: g.message });
        if (g.fieldIndex != null) inputRefs.current[g.fieldIndex]?.focus();
        return;
      }
    }
    // No-op if unchanged
    const changed = parsed.some((v, i) => v !== fields[i].value);
    if (!changed) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError({ message: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={() => start(0)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            start(0);
          }
        }}
        className="cursor-text rounded px-0.5 hover:bg-[#F3F4F6] transition-colors"
        style={style}
      >
        {display}
        {suffix != null && <>{suffix}</>}
      </span>
    );
  }

  return (
    <span
      ref={containerRef}
      style={{ display: "inline-flex", flexDirection: "column", ...style }}
      onBlur={(e) => {
        // If focus is moving outside the container, commit
        const next = e.relatedTarget as Node | null;
        if (skipBlurRef.current) {
          skipBlurRef.current = false;
          return;
        }
        if (next && containerRef.current?.contains(next)) return;
        void commit();
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
        {fields.map((f, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "baseline" }}>
            {i > 0 && <span style={{ margin: "0 4px" }}>{separators[i - 1] ?? "×"}</span>}
            <input
              ref={(el) => (inputRefs.current[i] = el)}
              type="text"
              inputMode={f.integer ? "numeric" : "decimal"}
              value={drafts[i] ?? ""}
              disabled={saving}
              placeholder={f.placeholder}
              aria-label={f.label}
              onChange={(ev) => {
                const v = ev.target.value;
                setDrafts((d) => {
                  const next = [...d];
                  next[i] = v;
                  return next;
                });
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  skipBlurRef.current = true;
                  void commit();
                } else if (ev.key === "Escape") {
                  ev.preventDefault();
                  skipBlurRef.current = true;
                  cancel();
                }
                // Tab/Shift-Tab default behavior cycles naturally between inputs
              }}
              className="border border-[#E97817] rounded px-1 outline-none bg-white"
              style={{ width: f.width ?? 40 }}
            />
          </span>
        ))}
        {suffix != null && <span style={{ marginLeft: 4 }}>{suffix}</span>}
      </span>
      {error && (
        <span className="text-[10px]" style={{ color: "#C2410C" }}>
          {error.message}
        </span>
      )}
    </span>
  );
}
