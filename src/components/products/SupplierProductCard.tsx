import type { Product } from "./helpers/buildProductsList";
import { SupplierSpine } from "./SupplierSpine";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductCardProps {
  product: Product;
}

export function SupplierProductCard({ product }: SupplierProductCardProps) {
  const supplierName = product.supplier?.name ?? "Unknown Supplier";
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
        minWidth: 1085,
      }}
    >
      <SupplierSpine supplierName={supplierName} />
      <SupplierProductRow product={product} />
    </div>
  );
}
