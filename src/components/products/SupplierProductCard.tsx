import type { Product } from "./helpers/buildProductsList";
import { TaxonomySpines } from "./TaxonomySpines";
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
        minWidth: 1137,
      }}
    >
      <TaxonomySpines
        productId={product.id}
        supplierName={product.supplier?.name ?? null}
        categoryName={product.subcategory?.category?.name ?? null}
        subcategoryName={product.subcategory?.name ?? null}
        clickable
        onChanged={onChanged}
      />
      <SupplierProductRow product={product} onChanged={onChanged} />
    </div>
  );
}
