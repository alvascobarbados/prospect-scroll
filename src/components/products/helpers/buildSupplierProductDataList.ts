/**
 * Shared product types + grouping logic for the Products page.
 *
 * GROUPING RULE — pure name-based grouping:
 *   Two products are grouped IFF they share the same (normalized) primary name
 *   AND the same supplier. Grouping is a DISPLAY convenience computed at render
 *   time; there is no stored link. Editing a product's name automatically
 *   joins / leaves a group with no other action required.
 *
 * `parent_product_id` is intentionally ignored as a grouping driver.
 */
export interface ProductBand {
  id: string;
  qty: number;
  unit_cost: number | string;
  setup_cost: number | string;
  inland_freight_usd?: number | string | null;
}

export interface ProductDecoration {
  id: string;
  sort_order: number;
  notes: string | null;
  ref_image_url: string | null;
  method_detail: {
    id: string;
    detail: string;
    method: { id: string; name: string } | null;
  } | null;
  product_decoration_bands: ProductBand[];
}

export interface ProductDetailRow {
  id: string;
  value: string;
  sort_order: number;
  detail_label: { id: string; label: string } | null;
}

export interface ProductIncludeRow {
  id: string;
  quantity: number;
  description: string;
  sort_order: number;
}

export interface ProductSupplier {
  id: string;
  name: string;
  code: string | null;
  unit_system: "metric" | "imperial" | null;
  weight_unit: string | null;
  volume_unit: string | null;
}

export interface KitComponentRowProduct {
  id: string;
  name: string;
  supplier_item_number: string | null;
  product_kind?: "single" | "kit";
  carton_pack: number | null;
  product_decorations: ProductDecoration[];
}

export interface KitComponentRow {
  id: string;
  quantity: number;
  decoration_id: string | null;
  sort_order: number;
  component: KitComponentRowProduct | null;
}

export interface Product {
  id: string;
  name: string;
  supplier_item_number: string | null;
  parent_product_id: string | null;
  parent_name: string | null;
  variant_name: string | null;
  display_order: number | null;
  variant_label: string | null;
  image_url: string | null;
  updated_at: string;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  production_days_min: number | null;
  production_days_max: number | null;
  subcategory: { id: string; name: string; code: string | null } | null;
  supplier: ProductSupplier | null;
  origin: { id: string; name: string } | null;
  product_details: ProductDetailRow[];
  product_decorations: ProductDecoration[];
  product_includes?: ProductIncludeRow[];
  product_kind?: "single" | "kit";
  kit_components?: KitComponentRow[];
}


export type ListItem =
  | { type: "card"; product: Product }
  | { type: "group"; parentName: string; supplierId: string | null; members: Product[] };

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function byVariantThenItem(a: Product, b: Product): number {
  const av = (a.variant_name ?? a.variant_label ?? "").toLowerCase();
  const bv = (b.variant_name ?? b.variant_label ?? "").toLowerCase();
  if (av !== bv) return av.localeCompare(bv);
  return (a.supplier_item_number ?? "").localeCompare(b.supplier_item_number ?? "");
}

function byProductName(a: Product, b: Product): number {
  return a.name.localeCompare(b.name);
}

/**
 * Group purely by (normalized name + supplier_id). Any (name, supplier) bucket
 * with ≥2 members renders as a group; single-member buckets render as a
 * standalone card.
 */
export function buildSupplierProductDataList(products: Product[]): ListItem[] {
  const buckets = new Map<string, Product[]>();
  for (const p of products) {
    const key = `${p.supplier?.id ?? "none"}::${normName(p.name)}`;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  const items: ListItem[] = [];

  // Emit groups (≥2 members) in stable name order.
  const groupEntries = Array.from(buckets.entries())
    .filter(([, members]) => members.length >= 2)
    .sort(([, ma], [, mb]) => ma[0].name.localeCompare(mb[0].name));

  const consumed = new Set<string>();
  for (const [, members] of groupEntries) {
    const sorted = [...members].sort(byVariantThenItem);
    items.push({
      type: "group",
      parentName: sorted[0].name,
      supplierId: sorted[0].supplier?.id ?? null,
      members: sorted,
    });
    sorted.forEach((m) => consumed.add(m.id));
  }

  // Standalones — single-member buckets.
  const standalones = products.filter((p) => !consumed.has(p.id)).sort(byProductName);
  for (const p of standalones) {
    items.push({ type: "card", product: p });
  }

  return items;
}
