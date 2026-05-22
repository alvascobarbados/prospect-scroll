import { useEffect } from "react";
import { useInlineEdit } from "@/lib/useInlineEdit";

type InlineTextProps = {
  value: string;
  onSave: (next: string) => Promise<void>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  inputStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  validate?: (value: string) => string | null;
  multiline?: boolean;
  /** When true, immediately enter edit mode on mount (used after duplicate-as-variant). */
  autoEdit?: boolean;
};

export function InlineText({
  value,
  onSave,
  placeholder,
  className,
  inputClassName,
  inputStyle,
  style,
  validate,
  multiline,
  autoEdit,
}: InlineTextProps) {
  const { isEditing, value: edit, setValue, error, saving, startEdit, cancelEdit, commitEdit } =
    useInlineEdit<string>({ initialValue: value, onSave, validate });

  useEffect(() => {
    if (autoEdit && !isEditing) startEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  if (!isEditing) {
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
        className={`cursor-text rounded px-0.5 hover:bg-[#F3F4F6] transition-colors ${className ?? ""}`}
        style={style}
      >
        {value || (
          <span className="italic" style={{ color: "#9CA3AF" }}>
            {placeholder ?? "—"}
          </span>
        )}
      </span>
    );
  }

  const commonProps = {
    autoFocus: true,
    value: edit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue(e.target.value),
    onBlur: () => {
      void commitEdit();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !multiline) {
        e.preventDefault();
        void commitEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    disabled: saving,
    className: `border border-[#E97817] rounded px-1 outline-none bg-white ${inputClassName ?? ""}`,
    style: inputStyle,
  };

  return (
    <span className="inline-flex flex-col">
      {multiline ? (
        <textarea {...(commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input
          type="text"
          {...(commonProps as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
      {error && (
        <span className="text-[10px]" style={{ color: "#C2410C" }}>
          {error}
        </span>
      )}
    </span>
  );
}
