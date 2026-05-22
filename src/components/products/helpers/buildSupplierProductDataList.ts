/**
 * Shared product types + grouping logic for the Products page.
 *
 * Variants of the same parent are grouped via `parent_product_id`. Any product
 * referenced as a parent_product_id by another (or itself referencing a parent)
 * forms a group, sorted by display_order then variant. Standalones render as
 * single cards.
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
  subcategory: { id: string; name: string; code: string | null } | null;
  supplier: ProductSupplier | null;
  origin: { id: string; name: string } | null;
  product_details: ProductDetailRow[];
  product_decorations: ProductDecoration[];
}

export type ListItem =
  | { type: "card"; product: Product }
  | { type: "group"; parentName: string; members: Product[] };

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

/**
 * Group products by parent_product_id. The "root" of a group is whichever
 * product all variants reference (or, if the root is missing, the smallest
 * common parent_product_id seen).
 */
export function buildSupplierProductDataList(products: Product[]): ListItem[] {
  const byId = new Map<string, Product>(products.map((p) => [p.id, p]));

  // Build groups keyed by the resolved root id.
  const groups = new Map<string, Product[]>();

  const rootOf = (p: Product): string => {
    // If this product has a parent, that's the root key. Otherwise it's a
    // potential root itself — only treat as a group root if anyone else points
    // to it.
    if (p.parent_product_id && byId.has(p.parent_product_id)) return p.parent_product_id;
    return p.id;
  };

  // First pass: count children per potential root.
  const childCount = new Map<string, number>();
  for (const p of products) {
    if (p.parent_product_id && byId.has(p.parent_product_id)) {
      childCount.set(p.parent_product_id, (childCount.get(p.parent_product_id) ?? 0) + 1);
    }
  }

  for (const p of products) {
    const root = rootOf(p);
    // Only group when the root has at least one child OR this product has a parent.
    const isPartOfGroup =
      (childCount.get(root) ?? 0) > 0 || (p.parent_product_id && byId.has(p.parent_product_id));
    if (isPartOfGroup) {
      const arr = groups.get(root) ?? [];
      arr.push(p);
      groups.set(root, arr);
    }
  }

  const consumed = new Set<string>();
  const items: ListItem[] = [];

  // Emit groups (sorted by parent product name for stable list order).
  const orderedGroupRoots = Array.from(groups.entries())
    .filter(([, members]) => members.length >= 2)
    .sort(([rootA, ma], [rootB, mb]) => {
      const aName = byId.get(rootA)?.name ?? ma[0]?.name ?? "";
      const bName = byId.get(rootB)?.name ?? mb[0]?.name ?? "";
      return aName.localeCompare(bName);
    });

  for (const [rootId, members] of orderedGroupRoots) {
    const sorted = [...members].sort(byDisplayOrderThenVariantThenName);
    const parentName = byId.get(rootId)?.name ?? sorted[0].parent_name ?? sorted[0].name;
    items.push({ type: "group", parentName, members: sorted });
    sorted.forEach((m) => consumed.add(m.id));
  }

  // Standalones — anything not in a multi-member group.
  const standalones = products.filter((p) => !consumed.has(p.id)).sort(byProductName);
  for (const p of standalones) {
    items.push({ type: "card", product: p });
  }

  return items;
}
