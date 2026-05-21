/**
 * Three stacked vertical spines on the left of a product card:
 *   SUPPLIER (darkest navy)  |  CATEGORY (mid navy)  |  SUBCATEGORY (light navy)
 *
 * Each spine is 26px wide → total block 78px. When `clickable` is true (Card
 * 101 only), each spine opens its respective picker. For Card 102 groups,
 * spines are static — the user must split a variant out to change taxonomy.
 */
import { useState } from "react";
import { SupplierPickerPopover } from "./SupplierPickerPopover";
import { CategoryPickerPopover } from "./CategoryPickerPopover";

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
  const [open, setOpen] = useState<"sup" | "cat" | "sub" | null>(null);

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
      <Spine
        bg="#0E2849"
        text={supplierName ?? "—"}
        clickable={clickable}
        onClick={() => setOpen("sup")}
        ariaLabel="Change supplier"
      />
      <Spine
        bg="#2C3E5C"
        text={categoryName ?? "—"}
        clickable={clickable}
        onClick={() => setOpen("cat")}
        ariaLabel="Change category"
      />
      <Spine
        bg="#4A5874"
        text={subcategoryName ?? "—"}
        clickable={clickable}
        onClick={() => setOpen("sub")}
        ariaLabel="Change subcategory"
      />

      {clickable && (
        <>
          <SupplierPickerPopover
            open={open === "sup"}
            onOpenChange={(o) => setOpen(o ? "sup" : null)}
            productId={productId}
            onChanged={onChanged}
          />
          <CategoryPickerPopover
            open={open === "cat" || open === "sub"}
            onOpenChange={(o) => setOpen(o ? "cat" : null)}
            productId={productId}
            onChanged={onChanged}
          />
        </>
      )}
    </div>
  );
}

function Spine({
  bg,
  text,
  clickable,
  onClick,
  ariaLabel,
}: {
  bg: string;
  text: string;
  clickable: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  const content = (
    <span
      style={{
        writingMode: "vertical-rl",
        transform: "rotate(180deg)",
        fontSize: 11,
        color: "#FFFFFF",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );

  if (!clickable) {
    return (
      <div
        aria-hidden
        style={{
          width: 26,
          background: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 26,
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        padding: 0,
        cursor: "pointer",
      }}
    >
      {content}
    </button>
  );
}
