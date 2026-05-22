import { useEffect, useState } from "react";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "./helpers/formatPrice";
import type { ProductDecoration, ProductBand } from "./helpers/buildSupplierProductDataList";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { MethodDetailPicker, methodDetailLabel } from "./MethodDetailPicker";

interface DecorationBlockProps {
  decoration: ProductDecoration | null; // null → empty placeholder slot
  productId: string;
  /** Next sort order when creating a new decoration in an empty slot. */
  nextSortOrder?: number;
  onChanged?: () => void;
}

const DEFAULT_TIERS = [100, 250, 500, 1000];

export function DecorationBlock({
  decoration,
  productId,
  nextSortOrder = 0,
  onChanged,
}: DecorationBlockProps) {
  const [hover, setHover] = useState(false);

  // ── Empty slot: click to add ──────────────────────────────────────────
  if (!decoration) {
    return (
      <div
        style={{
          paddingLeft: 10,
          paddingTop: 2,
          borderLeft: "0.5px dashed #E5E7EB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 0,
        }}
      >
        <MethodDetailPicker
          trigger={
            <button
              type="button"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 12,
                color: "#9CA3AF",
                fontStyle: "italic",
                cursor: "pointer",
              }}
            >
              + Add decoration
            </button>
          }
          onPicked={async (md) => {
            const { data: deco, error } = await supabase
              .from("product_decorations")
              .insert({
                product_id: productId,
                method_detail_id: md.id,
                sort_order: nextSortOrder,
              })
              .select("id")
              .single();
            if (error || !deco) {
              toast.error(`Failed to add decoration: ${error?.message ?? "unknown"}`);
              return;
            }
            const tierRows = DEFAULT_TIERS.map((qty) => ({
              product_decoration_id: deco.id,
              qty,
              unit_cost: 0,
              setup_cost: 0,
            }));
            const { error: bErr } = await supabase
              .from("product_decoration_bands")
              .insert(tierRows);
            if (bErr) toast.error(`Failed to seed tiers: ${bErr.message}`);
            onChanged?.();
          }}
        />
      </div>
    );
  }

  const bands = [...decoration.product_decoration_bands].sort((a, b) => a.qty - b.qty);
  const nextBandQty = (bands.at(-1)?.qty ?? 0) + 1;
  const hasGroundData = bands.some(
    (b) => b.inland_freight_usd != null && b.inland_freight_usd !== "",
  );
  // Local UI state: visible if user clicked Add, OR if any band already has a value.
  const [expanded, setExpanded] = useState<boolean>(hasGroundData);
  // Auto-expand whenever upstream data introduces a value (e.g. after a save).
  useEffect(() => {
    if (hasGroundData) setExpanded(true);
  }, [hasGroundData]);
  const groundOn = expanded || hasGroundData;

  const removeDecoration = async () => {
    if (!window.confirm("Remove this decoration and all its pricing tiers?")) return;
    const { error } = await supabase
      .from("product_decorations")
      .delete()
      .eq("id", decoration.id);
    if (error) {
      toast.error(`Failed to remove: ${error.message}`);
      return;
    }
    onChanged?.();
  };

  const addTier = async () => {
    const { error } = await supabase.from("product_decoration_bands").insert({
      product_decoration_id: decoration.id,
      qty: nextBandQty,
      unit_cost: 0,
      setup_cost: 0,
    });
    if (error) {
      toast.error(`Failed to add tier: ${error.message}`);
      return;
    }
    onChanged?.();
  };

  const toggleGround = async () => {
    if (groundOn) {
      // Collapse: clear any saved values AND hide the column.
      setExpanded(false);
      if (hasGroundData) {
        const ids = bands.map((b) => b.id);
        const { error } = await supabase
          .from("product_decoration_bands")
          .update({ inland_freight_usd: null } as any)
          .in("id", ids);
        if (error) { toast.error(`Failed: ${error.message}`); return; }
        onChanged?.();
      }
    } else {
      // Expand immediately — no DB write needed; editing a field will persist.
      setExpanded(true);
    }
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        paddingLeft: 10,
        paddingTop: 2,
        borderLeft: "0.5px solid #F1F2F4",
        minWidth: 0,
        position: "relative",
      }}
    >
      {hover && (
        <button
          type="button"
          onClick={removeDecoration}
          aria-label="Remove decoration"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: "transparent",
            border: "none",
            padding: 2,
            color: "#9CA3AF",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={13} />
        </button>
      )}

      {/* Method name (picker) */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "#0E2849",
          lineHeight: 1.3,
          minHeight: 32,
          marginBottom: 5,
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <MethodDetailPicker
          trigger={
            <button
              type="button"
              className="cursor-pointer rounded px-0.5 hover:bg-[#F3F4F6] transition-colors text-left"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                fontSize: 14,
                fontWeight: 500,
                color: "#0E2849",
                lineHeight: 1.3,
              }}
            >
              {methodDetailLabel(decoration.method_detail)}
            </button>
          }
          onPicked={async (md) => {
            const { error } = await supabase
              .from("product_decorations")
              .update({ method_detail_id: md.id })
              .eq("id", decoration.id);
            if (error) {
              toast.error(`Failed: ${error.message}`);
              return;
            }
            onChanged?.();
          }}
        />
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle("left")}>Qty</th>
            <th style={headerCellStyle("right")}>Unit $</th>
            <th style={headerCellStyle("right")}>Setup $</th>
            {groundOn && <th style={headerCellStyle("right")}>Ground $</th>}
            <th style={{ ...headerCellStyle("right"), width: 18 }} aria-hidden />
          </tr>
        </thead>
        <tbody>
          {bands.map((b) => (
            <BandRow key={b.id} band={b} showGround={groundOn} onChanged={onChanged} />
          ))}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: 14, marginTop: 6, alignItems: "center" }}>
        <button
          type="button"
          onClick={addTier}
          style={{ background: "transparent", border: "none", padding: 0, color: "#E97817", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Plus size={12} /> Add tier
        </button>
        <button
          type="button"
          onClick={toggleGround}
          style={{ background: "transparent", border: "none", padding: 0, color: "#E97817", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {groundOn ? "− Remove ground freight" : "+ Add ground freight"}
        </button>
      </div>
    </div>
  );
}

function BandRow({ band, showGround, onChanged }: { band: ProductBand; showGround?: boolean; onChanged?: () => void }) {
  const [hover, setHover] = useState(false);

  const qty = typeof band.qty === "string" ? Number(band.qty) : band.qty;
  const unit = typeof band.unit_cost === "string" ? Number(band.unit_cost) : band.unit_cost;
  const setup = typeof band.setup_cost === "string" ? Number(band.setup_cost) : band.setup_cost;
  const rawItc = band.inland_freight_usd;
  const itc = rawItc == null || rawItc === "" ? null : typeof rawItc === "string" ? Number(rawItc) : rawItc;

  const save = async (patch: Partial<{ qty: number; unit_cost: number; setup_cost: number; inland_freight_usd: number | null }>) => {
    const { error } = await supabase
      .from("product_decoration_bands")
      .update(patch as any)
      .eq("id", band.id);
    if (error) throw new Error(error.message);
    onChanged?.();
  };

  const remove = async () => {
    if (!window.confirm("Remove this pricing tier?")) return;
    const { error } = await supabase
      .from("product_decoration_bands")
      .delete()
      .eq("id", band.id);
    if (error) {
      toast.error(`Failed: ${error.message}`);
      return;
    }
    onChanged?.();
  };

  return (
    <tr onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <td style={{ ...bodyCellStyle("left"), fontWeight: 500 }}>
        <InlineNumber
          value={qty}
          integer
          min={1}
          width={56}
          onSave={async (v) => {
            if (v == null) return;
            await save({ qty: v });
          }}
        />
      </td>
      <td style={bodyCellStyle("right")}>
        <InlineNumber
          value={unit}
          min={0}
          width={64}
          format={(v) => (v == null || v === 0 ? "—" : formatPrice(v))}
          onSave={async (v) => save({ unit_cost: v ?? 0 })}
        />
      </td>
      <td style={bodyCellStyle("right")}>
        <InlineNumber
          value={setup}
          min={0}
          width={64}
          format={(v) => (v == null || v === 0 ? "—" : formatPrice(v))}
          onSave={async (v) => save({ setup_cost: v ?? 0 })}
        />
      </td>
      {showGround && (
        <td style={bodyCellStyle("right")}>
          <InlineNumber
            value={itc}
            min={0}
            nullable
            width={64}
            format={(v) => (v == null ? "—" : formatPrice(v))}
            onSave={async (v) => save({ inland_freight_usd: v ?? null })}
          />
        </td>
      )}
      <td style={{ ...bodyCellStyle("right"), width: 18, padding: "6px 0" }}>
        <button
          type="button"
          onClick={remove}
          aria-label="Remove tier"
          style={{
            opacity: hover ? 1 : 0,
            transition: "opacity 120ms",
            background: "transparent",
            border: "none",
            padding: 0,
            color: "#9CA3AF",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={11} />
        </button>
      </td>
    </tr>
  );
}

function headerCellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 500,
    color: "#6B7280",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    padding: "4px 8px 6px",
    textAlign: align,
    borderBottom: "0.5px solid #E5E7EB",
  };
}

function bodyCellStyle(align: "left" | "right"): React.CSSProperties {
  return {
    padding: "6px 8px",
    textAlign: align,
    color: "#0E2849",
  };
}
