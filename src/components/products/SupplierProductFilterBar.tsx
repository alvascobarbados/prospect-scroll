import { useMemo } from "react";
import { X } from "lucide-react";
import { useMasterData } from "@/hooks/useMasterData";
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
  marginRight: 6,
};

const selectStyle: React.CSSProperties = {
  border: "0.5px solid #D1D5DB",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
  color: "#0E2849",
  background: "#FFFFFF",
  fontFamily: "inherit",
  minWidth: 130,
};

export function SupplierProductFilterBar({ value, onChange, products }: FilterBarProps) {
  const { origins } = useMasterData();

  const originIdsInUse = useMemo(
    () => new Set(products.map((p) => p.origin?.id).filter(Boolean) as string[]),
    [products],
  );
  const visibleOrigins = origins.filter((o) => originIdsInUse.has(o.id));

  if (visibleOrigins.length === 0 && !value.originId) return null;

  const hasOrigin = !!value.originId;

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        padding: "6px 10px",
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 8,
      }}
    >
      <label style={labelStyle}>Origin</label>
      <select
        value={value.originId}
        onChange={(e) => onChange({ ...value, originId: e.target.value })}
        style={selectStyle}
      >
        <option value="">All</option>
        {visibleOrigins.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      {hasOrigin && (
        <button
          type="button"
          onClick={() => onChange({ ...value, originId: "" })}
          aria-label="Clear origin filter"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
            background: "transparent",
            border: "0.5px solid #E5E7EB",
            borderRadius: 6,
            padding: "4px 6px",
            fontSize: 11,
            color: "#6B7280",
            cursor: "pointer",
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

/** Apply category/subcategory/origin filter (category & subcategory now driven by chip strip). */
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
