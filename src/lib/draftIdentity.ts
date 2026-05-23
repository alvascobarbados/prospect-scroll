/**
 * Shared draft-card identity helpers used by BOTH DraftProductCard and
 * DraftKitCard. Centralizes the previously-duplicated logic so behavior
 * cannot drift. Output is byte-identical to the prior inline copies:
 *
 *   - cleanItemSuffix: trim → toUpperCase → strip non [A-Z0-9-]
 *   - supplierItemNumber: `${supplier.code}-${cleanSuffix}`
 *   - primaryItemNumber: composePrimaryItemNumber(subcategoryCode,
 *       nextSequenceFor(subcategoryCode, existing), originLetter)
 *   - isDraftIdentityBaseValid: the 5 shared canSave conditions (supplier
 *     code+origin, subcategory code, non-empty name, non-empty suffix).
 *     Each draft card composes this with its own extra gate
 *     (product → leadMin>=1, kit → hasComponents).
 */
import { composePrimaryItemNumber, nextSequenceFor } from "./productItemNumber";

const SUFFIX_STRIP_RE = /[^A-Z0-9-]/g;

export function cleanItemSuffix(raw: string): string {
  return raw.trim().toUpperCase().replace(SUFFIX_STRIP_RE, "");
}

export interface DraftIdentityBaseInput {
  supplier: { code?: string | null; origin_id?: string | null } | null;
  subcategory: { code?: string | null } | null;
  name: string;
  itemSuffix: string;
}

export function isDraftIdentityBaseValid(i: DraftIdentityBaseInput): boolean {
  return (
    !!i.supplier?.code &&
    !!i.supplier?.origin_id &&
    !!i.subcategory?.code &&
    i.name.trim().length > 0 &&
    i.itemSuffix.trim().length > 0
  );
}

export interface ComposedDraftIdentity {
  primaryItemNumber: string;
  supplierItemNumber: string;
}

export function composeDraftIdentity(opts: {
  supplierCode: string;
  subcategoryCode: string;
  originLetter: string;
  itemSuffix: string;
  existingPrimaryItemNumbers: string[];
}): ComposedDraftIdentity {
  const seq = nextSequenceFor(opts.subcategoryCode, opts.existingPrimaryItemNumbers);
  const primaryItemNumber = composePrimaryItemNumber(opts.subcategoryCode, seq, opts.originLetter);
  const supplierItemNumber = `${opts.supplierCode}-${cleanItemSuffix(opts.itemSuffix)}`;
  return { primaryItemNumber, supplierItemNumber };
}
