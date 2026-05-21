import type { ListItem } from "./helpers/buildProductsList";
import { SupplierProductCard } from "./SupplierProductCard";
import { SupplierProductGroup } from "./SupplierProductGroup";

interface ProductsListProps {
  items: ListItem[];
}

export function ProductsList({ items }: ProductsListProps) {
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
          <SupplierProductCard key={item.product.id} product={item.product} />
        ) : (
          <SupplierProductGroup
            key={item.parent.id}
            parent={item.parent}
            members={item.members}
          />
        ),
      )}
    </div>
  );
}
