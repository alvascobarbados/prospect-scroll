import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InlineNumber } from "@/components/inline/InlineNumber";

interface Tier {
  id: string;
  quantity: number;
  sort_order: number;
}

interface Props {
  kitProductId: string;
  /** Notify parent so it can re-render KitPricingBlock against new tiers. */
  onTiersChanged?: (tiers: number[]) => void;
}

const HEADER_STYLE: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6B7280",
  marginBottom: 8,
  fontWeight: 600,
  lineHeight: 1.2,
};

export function KitQuantityTiers({ kitProductId, onTiersChanged }: Props) {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const reload = async () => {
    const { data, error } = await supabase
      .from("product_kit_tiers")
      .select("id, quantity, sort_order")
      .eq("kit_product_id", kitProductId)
      .order("sort_order")
      .order("quantity");
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []).map((r: any) => ({
      id: r.id as string,
      quantity: Number(r.quantity),
      sort_order: Number(r.sort_order),
    }));
    setTiers(rows);
    onTiersChanged?.(rows.map((r) => r.quantity));
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitProductId]);

  const addTier = async () => {
    const max = tiers.reduce((m, t) => Math.max(m, t.quantity), 0);
    const next = max > 0 ? max * 2 : 50;
    const sort = (tiers.at(-1)?.sort_order ?? 0) + 1;
    const { error } = await supabase
      .from("product_kit_tiers")
      .insert({ kit_product_id: kitProductId, quantity: next, sort_order: sort });
    if (error) {
      toast.error(error.message);
      return;
    }
    await reload();
  };

  const removeTier = async (id: string) => {
    const { error } = await supabase.from("product_kit_tiers").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await reload();
  };

  const updateTier = async (id: string, quantity: number) => {
    const { error } = await supabase
      .from("product_kit_tiers")
      .update({ quantity })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await reload();
  };

  return (
    <div>
      <div style={HEADER_STYLE}>Kit Quantity Tiers</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {tiers.map((t) => (
          <div
            key={t.id}
            onMouseEnter={() => setHover(t.id)}
            onMouseLeave={() => setHover((h) => (h === t.id ? null : h))}
            style={{
              display: "grid",
              gridTemplateColumns: "70px 14px",
              columnGap: 8,
              alignItems: "baseline",
              fontSize: 12,
              color: "#0E2849",
            }}
          >
            <InlineNumber
              value={t.quantity}
              integer
              min={1}
              width={64}
              onSave={async (v) => {
                if (v == null) return;
                await updateTier(t.id, v);
              }}
            />
            <button
              type="button"
              onClick={() => removeTier(t.id)}
              aria-label="Remove tier"
              style={{
                opacity: hover === t.id ? 1 : 0,
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
        ))}
        <button
          type="button"
          onClick={addTier}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: "none",
            padding: "2px 0",
            color: "#9CA3AF",
            cursor: "pointer",
            fontSize: 12,
            fontStyle: "italic",
            alignSelf: "flex-start",
          }}
        >
          <Plus size={11} /> Add tier
        </button>
      </div>
    </div>
  );
}
