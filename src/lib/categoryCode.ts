/**
 * Single source of truth for product-category code rules.
 *
 * Stored shape:
 *   - Top-level category: exactly 2 chars, [A-Z0-9], or NULL.
 *   - Subcategory:        exactly 3 chars, [A-Z0-9], first 2 chars must equal
 *                         parent category's 2-char code. Or NULL.
 *
 * Mirrors the structure of src/lib/supplierCode.ts.
 */

export interface CategoryCodeRef {
  id: string;
  name: string;
  code: string | null;
}

/** Strip non-alphanumeric, uppercase, cap to 2 (category) or 3 (subcategory). */
export const sanitizeCategoryCodeInput = (raw: string, isSubcategory: boolean): string =>
  raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, isSubcategory ? 3 : 2);

/** Whether a single keystroke character is allowed in the field. */
export const isCategoryCodeChar = (ch: string): boolean => /^[A-Za-z0-9]$/.test(ch);

export type CategoryCodeValidation =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

export const validateCategoryCode = (
  raw: string,
  opts: {
    isSubcategory: boolean;
    parentCode?: string | null;
    existing: CategoryCodeRef[];
    excludeId?: string;
  },
): CategoryCodeValidation => {
  const cleaned = sanitizeCategoryCodeInput(raw, opts.isSubcategory);
  if (!cleaned) return { ok: true, value: null };

  const expectedLen = opts.isSubcategory ? 3 : 2;
  if (cleaned.length !== expectedLen) {
    return { ok: false, error: `Code must be exactly ${expectedLen} characters` };
  }

  if (opts.isSubcategory) {
    const parent = (opts.parentCode ?? "").toUpperCase();
    if (!parent) {
      return { ok: false, error: "Set the parent category's code first" };
    }
    if (cleaned.slice(0, 2) !== parent) {
      return { ok: false, error: `Subcategory code must start with parent code ${parent}` };
    }
  }

  const dup = opts.existing.find(
    (c) => c.id !== opts.excludeId && (c.code ?? "").toUpperCase() === cleaned,
  );
  if (dup) return { ok: false, error: `Code already in use by ${dup.name}` };

  return { ok: true, value: cleaned };
};
