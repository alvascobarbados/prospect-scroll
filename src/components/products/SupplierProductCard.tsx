import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductRow } from "./SupplierProductRow";
import type { CategoryRowLite, SupplierLite, OriginLite } from "./SupplierProductDataList";

interface SupplierProductCardProps {
  product: Product;
  categoryName?: string | null;
  allCategories?: CategoryRowLite[];
  suppliers?: SupplierLite[];
  origins?: OriginLite[];
  allProducts?: Product[];
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

export function SupplierProductCard({ product, categoryName, allCategories, suppliers, origins, allProducts, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductCardProps) {
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
        allCategories={allCategories}
        suppliers={suppliers}
        origins={origins}
        allProducts={allProducts}
        autoFocusVariantForId={autoFocusVariantForId}
        onChanged={onChanged}
        onDuplicated={onDuplicated}
      />
    </div>
  );
}
