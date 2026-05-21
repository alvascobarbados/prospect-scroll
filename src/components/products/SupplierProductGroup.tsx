import { Link2 } from "lucide-react";
import type { Product } from "./helpers/buildProductsList";
import { SupplierSpine } from "./SupplierSpine";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductGroupProps {
  parent: Product;
  members: Product[];
}

export function SupplierProductGroup({ parent, members }: SupplierProductGroupProps) {
  const supplierName = parent.supplier?.name ?? "Unknown Supplier";
  const count = members.length;

  return (
    <div
      style={{
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        background: "#FFFFFF",
        overflow: "hidden",
        minWidth: 1085,
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
            {parent.name}
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

      {/* Body — single shared spine */}
      <div style={{ position: "relative" }}>
        <SupplierSpine supplierName={supplierName} />
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && (
              <div
                style={{
                  height: "0.5px",
                  background: "#F1F2F4",
                  marginLeft: 26,
                }}
              />
            )}
            <SupplierProductRow product={m} showVariantChip />
          </div>
        ))}
      </div>
    </div>
  );
}
