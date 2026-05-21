import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierSpine } from "./SupplierSpine";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductCardProps {
  product: Product;
  onChanged?: () => void;
}

export function SupplierProductCard({ product, onChanged }: SupplierProductCardProps) {
  const supplierName = product.supplier?.name ?? "Unknown Supplier";
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        minWidth: 1240,
      }}
    >
      <SupplierSpine supplierName={supplierName} />
      <SupplierProductRow product={product} onChanged={onChanged} />
    </div>
  );
}
