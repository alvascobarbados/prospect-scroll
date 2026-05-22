import { Link2 } from "lucide-react";
import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductRow } from "./SupplierProductRow";

interface SupplierProductGroupProps {
  parentName: string;
  members: Product[];
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

export function SupplierProductGroup({ parentName, members, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductGroupProps) {
  const count = members.length;

  return (
    <div
      style={{
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        background: "#FFFFFF",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 18px",
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
          <strong style={{ color: "#0E2849", fontWeight: 600, fontSize: 13 }}>{parentName}</strong>{" "}
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

      <div>
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && <div style={{ height: "0.5px", background: "#F1F2F4" }} />}
            <SupplierProductRow
              product={m}
              showVariantInline
              autoFocusVariantForId={autoFocusVariantForId}
              onChanged={onChanged}
              onDuplicated={onDuplicated}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
