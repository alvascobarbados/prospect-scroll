/**
 * Three stacked vertical spines on the left of a product card:
 *   SUPPLIER (darkest navy) | CATEGORY (mid navy) | SUBCATEGORY (light navy)
 *
 * Total block width = 78px (three 26px spines). When `clickable` is true
 * (Card 101 only), each spine opens its picker. For Card 102 groups, spines
 * are static — split a variant out to change its taxonomy.
 */
import { SupplierPickerSpine, spineButton, SpineText } from "./SupplierPickerSpine";
import { CategoryPickerSpine } from "./CategoryPickerSpine";

interface TaxonomySpinesProps {
  productId: string;
  supplierName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  clickable: boolean;
  onChanged?: () => void;
}

export function TaxonomySpines({
  productId,
  supplierName,
  categoryName,
  subcategoryName,
  clickable,
  onChanged,
}: TaxonomySpinesProps) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        display: "flex",
        width: 78,
        zIndex: 1,
      }}
    >
      {clickable ? (
        <>
          <SupplierPickerSpine
            productId={productId}
            supplierName={supplierName}
            onChanged={onChanged}
          />
          <CategoryPickerSpine
            productId={productId}
            label={categoryName}
            bg="#2C3E5C"
            ariaLabel="Change category"
            onChanged={onChanged}
          />
          <CategoryPickerSpine
            productId={productId}
            label={subcategoryName}
            bg="#4A5874"
            ariaLabel="Change subcategory"
            onChanged={onChanged}
          />
        </>
      ) : (
        <>
          <StaticSpine bg="#0E2849" text={supplierName ?? "—"} />
          <StaticSpine bg="#2C3E5C" text={categoryName ?? "—"} />
          <StaticSpine bg="#4A5874" text={subcategoryName ?? "—"} />
        </>
      )}
    </div>
  );
}

function StaticSpine({ bg, text }: { bg: string; text: string }) {
  return (
    <div aria-hidden style={{ ...spineButton(bg), cursor: "default" }}>
      <SpineText>{text}</SpineText>
    </div>
  );
}
