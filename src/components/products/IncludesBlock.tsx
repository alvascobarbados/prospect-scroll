import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlineText } from "@/components/inline/InlineText";
import type { ProductIncludeRow } from "./helpers/buildSupplierProductDataList";

interface IncludesBlockProps {
  productId: string;
  rows: ProductIncludeRow[];
  onChanged?: () => void;
}

/**
 * "INCLUDES" — opt-in per-product list of {qty × description} line items.
 * Hidden when empty until user clicks "+ Add included item".
 * Stored in product_includes (separate from product_details / attributes).
 */
export function IncludesBlock({ productId, rows, onChanged }: IncludesBlockProps) {
  const [revealed, setRevealed] = useState(false);
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const visible = sorted.length > 0 || revealed;

  const addRow = async () => {
    const nextSort = (sorted.at(-1)?.sort_order ?? 0) + 1;
    const { error } = await supabase
      .from("product_includes")
      .insert({ product_id: productId, quantity: 1, description: "", sort_order: nextSort });
    if (error) {
      toast.error(`Failed to add: ${error.message}`);
      return;
    }
    setRevealed(true);
    onChanged?.();
  };

  if (!visible) {
    return (
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: "#9CA3AF",
            fontSize: 12,
            fontStyle: "italic",
            cursor: "pointer",
          }}
        >
          + Add included item
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#6B7280",
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        Includes
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sorted.map((row) => (
          <IncludeRowItem key={row.id} row={row} onChanged={onChanged} />
        ))}
      </div>
      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={addRow}
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            color: "#9CA3AF",
            fontSize: 12,
            fontStyle: "italic",
            cursor: "pointer",
          }}
        >
          + Add included item
        </button>
      </div>
    </div>
  );
}

function IncludeRowItem({ row, onChanged }: { row: ProductIncludeRow; onChanged?: () => void }) {
  const [hover, setHover] = useState(false);

  const remove = async () => {
    const { error } = await supabase.from("product_includes").delete().eq("id", row.id);
    if (error) {
      toast.error(`Failed to remove: ${error.message}`);
      return;
    }
    onChanged?.();
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 6,
        fontSize: 12,
        color: "#0E2849",
        lineHeight: 1.4,
      }}
    >
      <InlineNumber
        value={row.quantity}
        integer
        min={1}
        width={36}
        onSave={async (v) => {
          const { error } = await supabase
            .from("product_includes")
            .update({ quantity: v ?? 1 })
            .eq("id", row.id);
          if (error) throw new Error(error.message);
          onChanged?.();
        }}
      />
      <span style={{ color: "#6B7280" }}>×</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <InlineText
          value={row.description}
          placeholder="item description"
          autoEdit={!row.description}
          onSave={async (next) => {
            const v = next.trim();
            const { error } = await supabase
              .from("product_includes")
              .update({ description: v })
              .eq("id", row.id);
            if (error) throw new Error(error.message);
            onChanged?.();
          }}
          style={{ fontSize: 12, color: "#0E2849" }}
          inputStyle={{ fontSize: 12, minWidth: 140 }}
        />
      </span>
      <button
        type="button"
        onClick={remove}
        aria-label="Remove included item"
        style={{
          opacity: hover ? 1 : 0,
          transition: "opacity 120ms",
          background: "transparent",
          border: "none",
          padding: 0,
          color: "#9CA3AF",
          cursor: "pointer",
          width: 14,
          height: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <X size={11} />
      </button>
    </div>
  );
}
