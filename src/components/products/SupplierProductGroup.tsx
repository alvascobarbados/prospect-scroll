import { Link2 } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductRow } from "./SupplierProductRow";
import { InlineText } from "@/components/inline/InlineText";
import { supabase } from "@/integrations/supabase/client";
import type { CategoryRowLite, SupplierLite, OriginLite } from "./SupplierProductDataList";

interface SupplierProductGroupProps {
  parentName: string;
  members: Product[];
  resolveCategory?: (subId: string | null | undefined) => string | null;
  allCategories?: CategoryRowLite[];
  suppliers?: SupplierLite[];
  origins?: OriginLite[];
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

export function SupplierProductGroup({ parentName, members, resolveCategory, allCategories, suppliers, origins, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductGroupProps) {
  const count = members.length;

  const renameAll = async (next: string) => {
    const v = next.trim();
    if (!v) throw new Error("Name required");
    if (v === parentName) return;
    const ids = members.map((m) => m.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("products").update({ name: v } as any).in("id", ids));
    if (error) {
      toast.error(`Failed to rename: ${error.message}`);
      throw new Error(error.message);
    }
    toast.success(`Renamed ${ids.length} variants`);
    onChanged?.();
  };

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
        <InlineText
          value={parentName}
          onSave={renameAll}
          validate={(v) => (v.trim().length === 0 ? "Name required" : null)}
          style={{ color: "#0E2849", fontWeight: 600, fontSize: 13 }}
          inputStyle={{ color: "#0E2849", fontWeight: 600, fontSize: 13, minWidth: 200 }}
        />
        <span>· {count} variants</span>
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
          title="Grouped by shared name + supplier. Edit a card's name to remove it from the group."
        >
          Grouped
        </span>
      </div>

      <div>
        {members.map((m, i) => (
          <div key={m.id}>
            {i > 0 && <div style={{ height: "0.5px", background: "#F1F2F4" }} />}
            <SupplierProductRow
              product={m}
              categoryName={resolveCategory ? resolveCategory(m.subcategory?.id) : null}
              allCategories={allCategories}
              suppliers={suppliers}
              origins={origins}
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
