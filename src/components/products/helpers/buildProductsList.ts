/**
 * Shared product types + grouping logic for the Products page.
 *
 * Groups child products under their parent and enforces consecutive rendering
 * by wrapping the parent + children in a single ListItem of type 'group'.
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
  weight_unit: string | null;
  volume_unit: string | null;
}

export interface Product {
  id: string;
  name: string;
  supplier_item_number: string | null;
  parent_product_id: string | null;
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
  | { type: "group"; parent: Product; members: Product[] };

const sortKey = (a: Product, b: Product): number => {
  const ao = a.display_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.display_order ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return a.name.localeCompare(b.name);
};

export function buildProductsList(products: Product[]): ListItem[] {
  const items: ListItem[] = [];
  const seen = new Set<string>();

  const childrenByParent = new Map<string, Product[]>();
  for (const p of products) {
    if (p.parent_product_id) {
      const existing = childrenByParent.get(p.parent_product_id) ?? [];
      existing.push(p);
      childrenByParent.set(p.parent_product_id, existing);
    }
  }

  for (const product of products) {
    if (seen.has(product.id)) continue;
    const children = childrenByParent.get(product.id) ?? [];

    if (children.length > 0) {
      const members = [product, ...children].sort(sortKey);
      items.push({ type: "group", parent: product, members });
      members.forEach((m) => seen.add(m.id));
    } else if (!product.parent_product_id) {
      items.push({ type: "card", product });
      seen.add(product.id);
    }
  }

  return items;
}
