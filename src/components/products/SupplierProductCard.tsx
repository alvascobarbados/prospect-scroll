import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductCardProps {
  product: Product;
  onChanged?: () => void;
}

export function SupplierProductCard({ product, onChanged }: SupplierProductCardProps) {
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
      <SupplierProductRow product={product} onChanged={onChanged} />
    </div>
  );
}
