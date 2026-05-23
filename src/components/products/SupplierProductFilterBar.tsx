import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useMasterData } from "@/hooks/useMasterData";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "./helpers/buildSupplierProductDataList";

export interface ProductFilterState {
  supplierId: string;
  categoryId: string;
  subcategoryId: string;
  originId: string;
}

export const EMPTY_PRODUCT_FILTER: ProductFilterState = {
  supplierId: "",
  categoryId: "",
  subcategoryId: "",
  originId: "",
};

interface CategoryRow {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
}

interface FilterBarProps {
  value: ProductFilterState;
  onChange: (next: ProductFilterState) => void;
  products: Product[];
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "#6B7280",
  marginBottom: 3,
};

const selectStyle: React.CSSProperties = {
  border: "0.5px solid #D1D5DB",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  color: "#0E2849",
  background: "#FFFFFF",
  fontFamily: "inherit",
  minWidth: 150,
};

export function SupplierProductFilterBar({ value, onChange, products }: FilterBarProps) {
  const { suppliers, origins } = useMasterData();
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, name, code, parent_id")
        .order("name");
      if (cancelled) return;
      setCategories((data ?? []) as CategoryRow[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const parentCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subcategories = useMemo(() => {
    const subs = categories.filter((c) => c.parent_id);
    return value.categoryId ? subs.filter((s) => s.parent_id === value.categoryId) : subs;
  }, [categories, value.categoryId]);

  // Only show suppliers / origins that actually have products in the list (nice to scan)
  const supplierIdsInUse = useMemo(() => new Set(products.map((p) => p.supplier?.id).filter(Boolean) as string[]), [products]);
  const originIdsInUse = useMemo(() => new Set(products.map((p) => p.origin?.id).filter(Boolean) as string[]), [products]);

  const visibleSuppliers = suppliers.filter((s) => supplierIdsInUse.has(s.id));
  const visibleOrigins = origins.filter((o) => originIdsInUse.has(o.id));

  const hasAny = !!(value.supplierId || value.categoryId || value.subcategoryId || value.originId);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        alignItems: "flex-end",
        flexWrap: "wrap",
        padding: "12px 16px",
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        marginBottom: 16,
      }}
    >

      <div style={{ display: "flex", flexDirection: "column" }}>
        <label style={labelStyle}>Category</label>
        <select
          value={value.categoryId}
          onChange={(e) => onChange({ ...value, categoryId: e.target.value, subcategoryId: "" })}
          style={selectStyle}
        >
          <option value="">All categories</option>
          {parentCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <label style={labelStyle}>Subcategory</label>
        <select
          value={value.subcategoryId}
          onChange={(e) => onChange({ ...value, subcategoryId: e.target.value })}
          style={selectStyle}
        >
          <option value="">All subcategories</option>
          {subcategories.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <label style={labelStyle}>Origin</label>
        <select
          value={value.originId}
          onChange={(e) => onChange({ ...value, originId: e.target.value })}
          style={selectStyle}
        >
          <option value="">All origins</option>
          {visibleOrigins.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </div>

      {hasAny && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_PRODUCT_FILTER)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "0.5px solid #E5E7EB",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            color: "#6B7280",
            cursor: "pointer",
            height: 30,
          }}
        >
          <X size={12} /> Clear
        </button>
      )}
    </div>
  );
}

/** Get the product's category id (parent of its subcategory), best-effort from cached categories. */
export function applyProductFilter(
  products: Product[],
  filter: ProductFilterState,
  categoryParentBySubId: Map<string, string>,
): Product[] {
  return products.filter((p) => {
    if (filter.supplierId && p.supplier?.id !== filter.supplierId) return false;
    if (filter.subcategoryId && p.subcategory?.id !== filter.subcategoryId) return false;
    if (filter.categoryId) {
      const subId = p.subcategory?.id;
      if (!subId) return false;
      const parentId = categoryParentBySubId.get(subId);
      if (parentId !== filter.categoryId) return false;
    }
    if (filter.originId && p.origin?.id !== filter.originId) return false;
    return true;
  });
}
