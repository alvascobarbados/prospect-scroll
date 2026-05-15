/**
 * Single source of truth for supplier-code rules.
 *
 * Stored shape: exactly 3 chars, [A-Z0-9], or NULL when not yet assigned.
 * Used by the inline-edit cell on /suppliers and by the InlineAdd BottomSheet.
 */
import type { SupplierRecord } from "@/hooks/useMasterData";

/** Strip everything except A-Z and 0-9, uppercase, cap at 3 chars. */
export const sanitizeSupplierCodeInput = (raw: string): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);

/** Whether a single keystroke character is allowed in the field. */
export const isSupplierCodeChar = (ch: string): boolean => /^[A-Za-z0-9]$/.test(ch);

export type SupplierCodeValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Validate a draft code against the supplier set.
 *
 * - Empty string → `{ ok:true, value:null }` (clearing back to no code is allowed).
 * - Length must be exactly 3 (after sanitization).
 * - Code must not collide with another supplier (case-insensitive),
 *   excluding `excludeId` when editing in place.
 */
export const validateSupplierCode = (
  raw: string,
  suppliers: Pick<SupplierRecord, "id" | "name" | "code">[],
  excludeId?: string,
): SupplierCodeValidation => {
  const cleaned = sanitizeSupplierCodeInput(raw);
  if (!cleaned) return { ok: true, value: null };
  if (cleaned.length !== 3) {
    return { ok: false, error: "Code must be exactly 3 characters" };
  }
  const dup = suppliers.find(
    (s) => s.id !== excludeId && (s.code ?? "").toUpperCase() === cleaned,
  );
  if (dup) return { ok: false, error: `Code already in use by ${dup.name}` };
  return { ok: true, value: cleaned };
};
