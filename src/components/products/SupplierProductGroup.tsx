import { Link2 } from "lucide-react";
import type { Product } from "./helpers/buildProductsList";
import { TaxonomySpines } from "./TaxonomySpines";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductGroupProps {
  parentName: string;
  members: Product[];
  onChanged?: () => void;
}

export function SupplierProductGroup({ parentName, members, onChanged }: SupplierProductGroupProps) {
  const first = members[0];
  const count = members.length;

  return (
    <div
      style={{
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        background: "#FFFFFF",
        overflow: "hidden",
        minWidth: 1137,
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "8px 14px",
          background: "#F9FAFB",
          borderBottom: "0.5px solid #F1F2F4",
          fontSize: 11,
          color: "#6B7280",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Link2 size={13} />
        <span>
          <strong style={{ color: "#0E2849", fontWeight: 500, fontSize: 12 }}>
            {parentName}
          </strong>{" "}
          · {count} linked variants
        </span>
        <span
          style={{
            marginLeft: "auto",
            background: "#E5EAF1",
            color: "#0E2849",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            padding: "1px 8px",
            borderRadius: 999,
            fontWeight: 500,
          }}
        >
          Associated
        </span>
      </div>

      {/* Body — single shared 3-spine block */}
      <div style={{ position: "relative" }}>
        <TaxonomySpines
          productId={first.id}
          supplierName={first.supplier?.name ?? null}
          categoryName={first.subcategory?.category?.name ?? null}
          subcategoryName={first.subcategory?.name ?? null}
          clickable={false}
        />
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && (
              <div
                style={{
                  height: "0.5px",
                  background: "#F1F2F4",
                  marginLeft: 78,
                }}
              />
            )}
            <SupplierProductRow product={m} showVariantChip onChanged={onChanged} />
          </div>
        ))}
      </div>
    </div>
  );
}
