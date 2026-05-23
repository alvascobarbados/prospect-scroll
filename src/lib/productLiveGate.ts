/**
 * Live gate — single source of truth for whether a product may be marked
 * status='live'. Used by:
 *   - Make Live action (must be true to enable)
 *   - Migration backfill (already executed in SQL with the same predicate)
 *   - Anywhere we want to surface "what's still missing"
 *
 * Required fields per Stage 1 spec:
 *   supplier, subcategory (parent category is implied via subcategory.parent_id),
 *   name, production_days_min, AND all five carton fields.
 *
 * NOT required: primary_item_number (auto-generated), supplier_item_number.
 */

export interface LiveGateProduct {
  name?: string | null;
  production_days_min?: number | null;
  carton_pack?: number | null;
  carton_length?: number | string | null;
  carton_width?: number | string | null;
  carton_height?: number | string | null;
  carton_weight?: number | string | null;
  supplier?: { id: string } | null;
  subcategory?: { id: string } | null;
}

export interface MissingField {
  key: string;
  label: string;
}

export function liveGateMissing(p: LiveGateProduct): MissingField[] {
  const missing: MissingField[] = [];
  if (!p.supplier?.id) missing.push({ key: "supplier", label: "Supplier" });
  if (!p.subcategory?.id) missing.push({ key: "subcategory", label: "Category / Subcategory" });
  if (!p.name || p.name.trim().length === 0) missing.push({ key: "name", label: "Product name" });
  if (p.production_days_min == null || !Number.isFinite(p.production_days_min) || (p.production_days_min as number) < 0) {
    missing.push({ key: "production_days_min", label: "Lead time (min days)" });
  }
  if (p.carton_pack == null) missing.push({ key: "carton_pack", label: "Carton pack" });
  if (p.carton_length == null || p.carton_length === "") missing.push({ key: "carton_length", label: "Carton length" });
  if (p.carton_width == null || p.carton_width === "") missing.push({ key: "carton_width", label: "Carton width" });
  if (p.carton_height == null || p.carton_height === "") missing.push({ key: "carton_height", label: "Carton height" });
  if (p.carton_weight == null || p.carton_weight === "") missing.push({ key: "carton_weight", label: "Carton weight" });
  return missing;
}

export function isLiveEligible(p: LiveGateProduct): boolean {
  return liveGateMissing(p).length === 0;
}
