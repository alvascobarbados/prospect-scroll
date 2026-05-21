import { useState, useRef, useEffect } from "react";

export type UseInlineEditOptions<T> = {
  initialValue: T;
  onSave: (value: T) => Promise<void>;
  validate?: (value: T) => string | null;
};

export function useInlineEdit<T>({ initialValue, onSave, validate }: UseInlineEditOptions<T>) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState<T>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const originalValue = useRef<T>(initialValue);

  useEffect(() => {
    originalValue.current = initialValue;
    setValue(initialValue);
  }, [initialValue]);

  const startEdit = () => {
    originalValue.current = value;
    setIsEditing(true);
    setError(null);
  };

  const cancelEdit = () => {
    setValue(originalValue.current);
    setIsEditing(false);
    setError(null);
  };

  const commitEdit = async () => {
    if (value === originalValue.current) {
      setIsEditing(false);
      return;
    }
    const validationError = validate?.(value) ?? null;
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      await onSave(value);
      setIsEditing(false);
      setError(null);
    } catch (err) {
      setValue(originalValue.current);
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return {
    isEditing,
    value,
    setValue,
    error,
    saving,
    startEdit,
    cancelEdit,
    commitEdit,
  };
}
