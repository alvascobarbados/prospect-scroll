import type { ListItem } from "./helpers/buildSupplierProductDataList";
import { SupplierProductCard } from "./SupplierProductCard";
import { SupplierProductGroup } from "./SupplierProductGroup";

interface SupplierProductDataListProps {
  items: ListItem[];
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

export function SupplierProductDataList({ items, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductDataListProps) {
  if (items.length === 0) {
    return (
      <div style={{ padding: "48px 0", color: "#9CA3AF", fontSize: 13 }}>
        No products yet.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((item) =>
        item.type === "card" ? (
          <SupplierProductCard
            key={item.product.id}
            product={item.product}
            autoFocusVariantForId={autoFocusVariantForId}
            onChanged={onChanged}
            onDuplicated={onDuplicated}
          />
        ) : (
          <SupplierProductGroup
            key={`group:${item.supplierId ?? "none"}:${item.parentName}`}
            parentName={item.parentName}
            members={item.members}
            autoFocusVariantForId={autoFocusVariantForId}
            onChanged={onChanged}
            onDuplicated={onDuplicated}
          />
        ),
      )}
    </div>
  );
}
