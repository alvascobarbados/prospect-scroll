import type { ListItem } from "./helpers/buildSupplierProductDataList";
import { SupplierProductCard } from "./SupplierProductCard";
import { SupplierProductGroup } from "./SupplierProductGroup";
import { SHEET_GRID_TEMPLATE, SHEET_COL_GAP, SHEET_ROW_PADDING } from "./helpers/sheetGrid";

export interface CategoryRowLite { id: string; name: string; code: string | null; parent_id: string | null }
export interface SupplierLite { id: string; name: string; code: string | null; unit_system: "metric" | "imperial" | null }
export interface OriginLite { id: string; name: string }

interface SupplierProductDataListProps {
  items: ListItem[];
  categoryById?: Map<string, { name: string; code: string | null; parentId: string | null }>;
  allCategories?: CategoryRowLite[];
  suppliers?: SupplierLite[];
  origins?: OriginLite[];
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

const HEADER_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6B7280",
  lineHeight: 1.2,
};

function SheetHeader() {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        background: "#FFFFFF",
        borderBottom: "1px solid #E5E7EB",
        padding: `10px 18px`,
        display: "grid",
        gridTemplateColumns: SHEET_GRID_TEMPLATE,
        columnGap: SHEET_COL_GAP,
        alignItems: "end",
      }}
    >
      <div style={HEADER_LABEL_STYLE}>Image</div>
      <div style={HEADER_LABEL_STYLE}>Product</div>
      <div style={HEADER_LABEL_STYLE}>Product Details</div>
      <div style={HEADER_LABEL_STYLE}>Packing &amp; Production</div>
      <div style={HEADER_LABEL_STYLE}>Pricing</div>
      <div aria-hidden />
    </div>
  );
}

export function SupplierProductDataList({
  items,
  categoryById,
  allCategories = [],
  suppliers = [],
  origins = [],
  autoFocusVariantForId,
  onChanged,
  onDuplicated,
}: SupplierProductDataListProps) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>
        No products yet.
      </div>
    );
  }
  const resolveCategory = (subId: string | null | undefined): string | null => {
    if (!subId || !categoryById) return null;
    const sub = categoryById.get(subId);
    if (!sub?.parentId) return null;
    return categoryById.get(sub.parentId)?.name ?? null;
  };
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <SheetHeader />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {items.map((item) =>
          item.type === "card" ? (
            <SupplierProductCard
              key={item.product.id}
              product={item.product}
              categoryName={resolveCategory(item.product.subcategory?.id)}
              allCategories={allCategories}
              suppliers={suppliers}
              origins={origins}
              autoFocusVariantForId={autoFocusVariantForId}
              onChanged={onChanged}
              onDuplicated={onDuplicated}
            />
          ) : (
            <SupplierProductGroup
              key={`group:${item.supplierId ?? "none"}:${item.parentName}`}
              parentName={item.parentName}
              members={item.members}
              resolveCategory={resolveCategory}
              allCategories={allCategories}
              suppliers={suppliers}
              origins={origins}
              autoFocusVariantForId={autoFocusVariantForId}
              onChanged={onChanged}
              onDuplicated={onDuplicated}
            />
          ),
        )}
      </div>
    </div>
  );
}

export { SHEET_GRID_TEMPLATE, SHEET_COL_GAP, SHEET_ROW_PADDING };
