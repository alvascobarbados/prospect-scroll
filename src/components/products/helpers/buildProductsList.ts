/**
 * Shared product types + grouping logic for the Products page.
 *
 * Grouping is driven by `parent_name`: any 2+ products that share the same
 * normalized parent_name (trimmed, lowercased) render as a single Card 102
 * group. Products with no parent_name — or whose parent_name is unique —
 * render as standalone Card 101s.
 */
export interface ProductBand {
  id: string;
  qty: number;
  unit_cost: number | string;
  setup_cost: number | string;
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

export interface ProductSupplier {
  id: string;
  name: string;
  code: string | null;
  unit_system: "metric" | "imperial" | null;
  weight_unit: string | null;
  volume_unit: string | null;
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
  subcategory: {
    id: string;
    name: string;
    code: string | null;
    category: { id: string; name: string; code: string | null } | null;
  } | null;
  supplier: ProductSupplier | null;
  origin: { id: string; name: string } | null;
  product_details: ProductDetailRow[];
  product_decorations: ProductDecoration[];
}

export type ListItem =
  | { type: "card"; product: Product }
  | { type: "group"; parentName: string; members: Product[] };

function normalizeKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed.toLowerCase();
}

function byDisplayOrderThenVariantThenName(a: Product, b: Product): number {
  const ao = a.display_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const av = a.variant_name ?? a.variant_label ?? "";
  const bv = b.variant_name ?? b.variant_label ?? "";
  if (av !== bv) return av.localeCompare(bv);
  return a.name.localeCompare(b.name);
}

function byProductName(a: Product, b: Product): number {
  return a.name.localeCompare(b.name);
}

export function buildProductsList(products: Product[]): ListItem[] {
  const groups = new Map<string, Product[]>();
  const standalone: Product[] = [];

  for (const p of products) {
    const key = normalizeKey(p.parent_name);
    if (key) {
      const arr = groups.get(key) ?? [];
      arr.push(p);
      groups.set(key, arr);
    } else {
      standalone.push(p);
    }
  }

  const items: ListItem[] = [];
  const consumed = new Set<string>();

  for (const members of groups.values()) {
    if (members.length >= 2) {
      const sorted = [...members].sort(byDisplayOrderThenVariantThenName);
      const displayName = (sorted[0].parent_name ?? "").trim();
      items.push({ type: "group", parentName: displayName, members: sorted });
      sorted.forEach((m) => consumed.add(m.id));
    }
  }

  const remaining = [
    ...standalone,
    ...Array.from(groups.values()).flat().filter((p) => !consumed.has(p.id)),
  ].sort(byProductName);

  for (const p of remaining) {
    items.push({ type: "card", product: p });
  }

  return items;
}
