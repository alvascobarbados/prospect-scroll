import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductCardProps {
  product: Product;
  categoryName?: string | null;
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

export function SupplierProductCard({ product, categoryName, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductCardProps) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <SupplierProductRow
        product={product}
        categoryName={categoryName}
        autoFocusVariantForId={autoFocusVariantForId}
        onChanged={onChanged}
        onDuplicated={onDuplicated}
      />
    </div>
  );
}
