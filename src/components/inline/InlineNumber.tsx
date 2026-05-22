import { useInlineEdit } from "@/lib/useInlineEdit";

type InlineNumberProps = {
  /** Current numeric value (or null). */
  value: number | null;
  onSave: (next: number | null) => Promise<void>;
  /** Allow null (empty) values. Default false. */
  nullable?: boolean;
  /** Restrict to integers. Default false. */
  integer?: boolean;
  /** Inclusive min. */
  min?: number;
  /** Inclusive max. */
  max?: number;
  /** Optional formatter for read mode. */
  format?: (v: number | null) => string;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  /** Width hint for the input. */
  width?: number;
};

function defaultFormat(v: number | null): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : String(v);
}

export function InlineNumber({
  value,
  onSave,
  nullable = false,
  integer = false,
  min,
  max,
  format = defaultFormat,
  placeholder,
  style,
  inputStyle,
  width = 64,
}: InlineNumberProps) {
  const initialDraft = value == null ? "" : String(value);

  const { isEditing, value: draft, setValue, error, saving, startEdit, cancelEdit, commitEdit } =
    useInlineEdit<string>({
      initialValue: initialDraft,
      validate: (raw) => {
        const trimmed = raw.trim();
        if (trimmed === "") {
          if (nullable) return null;
          return "Required";
        }
        const num = Number(trimmed);
        if (!Number.isFinite(num)) return "Must be a number";
        if (integer && !Number.isInteger(num)) return "Must be a whole number";
        if (min != null && num < min) return `Must be ≥ ${min}`;
        if (max != null && num > max) return `Must be ≤ ${max}`;
        return null;
      },
      onSave: async (raw) => {
        const trimmed = raw.trim();
        const out: number | null = trimmed === "" ? null : Number(trimmed);
        await onSave(out);
      },
    });

  if (!isEditing) {
    const shown = format(value);
    const isEmpty = value == null;
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEdit();
          }
        }}
        className="cursor-text rounded px-0.5 hover:bg-[#F3F4F6] hover:underline decoration-dashed decoration-[#9CA3AF] underline-offset-2 transition-colors"
        style={style}
      >
        {isEmpty ? (
          <span className="italic" style={{ color: "#9CA3AF" }}>
            {placeholder ?? shown}
          </span>
        ) : (
          shown
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <input
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commitEdit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commitEdit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelEdit();
          }
        }}
        className="border border-[#E97817] rounded px-1 outline-none bg-white"
        style={{ width, ...inputStyle }}
      />
      {error && (
        <span className="text-[10px]" style={{ color: "#C2410C" }}>
          {error}
        </span>
      )}
    </span>
  );
}
