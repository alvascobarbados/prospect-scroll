import type { ListItem } from "./helpers/buildSupplierProductDataList";
import { SupplierProductCard } from "./SupplierProductCard";
import { SupplierProductGroup } from "./SupplierProductGroup";

interface SupplierProductDataListProps {
  items: ListItem[];
  onChanged?: () => void;
}

export function SupplierProductDataList({ items, onChanged }: SupplierProductDataListProps) {
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
          <SupplierProductCard key={item.product.id} product={item.product} onChanged={onChanged} />
        ) : (
          <SupplierProductGroup
            key={`group:${item.parentName}`}
            parentName={item.parentName}
            members={item.members}
            onChanged={onChanged}
          />
        ),
      )}
    </div>
  );
}
