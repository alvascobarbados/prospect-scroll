import { Package, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product, ProductDetailRow } from "./helpers/buildProductsList";
import { formatLeadTime } from "./helpers/formatLeadTime";
import { formatUpdated } from "./helpers/formatUpdated";
import { weightUnit as weightUnitFor, linearUnit as linearUnitFor } from "@/lib/units";
import { DecorationBlock } from "./DecorationBlock";
import { AddAttributePopover } from "./AddAttributePopover";
import { InlineText } from "@/components/inline/InlineText";
import { supabase } from "@/integrations/supabase/client";

interface SupplierProductRowProps {
  product: Product;
  /** Show the variant chip beside the name (used inside Card 102). */
  showVariantChip?: boolean;
  onChanged?: () => void;
}

const GRID_COLS = "160px 320px 120px 280px 280px";
const VISIBLE_DECO_SLOTS = 2;

export function SupplierProductRow({ product, showVariantChip = false, onChanged }: SupplierProductRowProps) {
  const [expanded, setExpanded] = useState(false);
  const allDecos = [...product.product_decorations].sort((a, b) => a.sort_order - b.sort_order);
  const primary: (Product["product_decorations"][number] | null)[] = [
    allDecos[0] ?? null,
    allDecos[1] ?? null,
  ];
  const overflow = allDecos.slice(VISIBLE_DECO_SLOTS);
  const hasOverflow = overflow.length > 0;

  const system = product.supplier?.unit_system ?? "metric";
  const wUnit = weightUnitFor(system);
  const lUnit = linearUnitFor(system);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: GRID_COLS,
        gap: 10,
        padding: "10px 12px 10px 38px",
        position: "relative",
        minWidth: 1240,
      }}
    >
      {/* Image */}
      <div
        style={{
          background: "#F3F4F6",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 160,
          minHeight: 160,
          aspectRatio: "1 / 1",
          alignSelf: "start",
          overflow: "hidden",
        }}
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
          />
        ) : (
          <Package size={36} color="#9CA3AF" strokeWidth={1.5} />
        )}
      </div>

      {/* Identity */}
      <IdentityCell product={product} showVariantChip={showVariantChip} onChanged={onChanged} />

      {/* Specs */}
      <SpecsCell
        product={product}
        weightUnit={wUnit}
        volumeUnit={lUnit}
      />

      {/* Decoration slots — primary 2 */}
      {primary.map((slot, i) => (
        <div key={slot?.id ?? `empty-${i}`}>
          <DecorationBlock decoration={slot} />
          {i === 1 && hasOverflow && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{
                marginTop: 6,
                background: "transparent",
                border: "none",
                padding: 0,
                color: "#E97817",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {expanded
                ? "− hide extra decorations"
                : `+ ${overflow.length} more decoration${overflow.length === 1 ? "" : "s"}`}
            </button>
          )}
          {i === 1 && expanded && hasOverflow && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              {overflow.map((d) => (
                <DecorationBlock key={d.id} decoration={d} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Identity ─────────────────────────────────────────────────────────────

function IdentityCell({
  product,
  showVariantChip,
  onChanged,
}: {
  product: Product;
  showVariantChip: boolean;
  onChanged?: () => void;
}) {
  const code = product.supplier?.code ?? null;
  const itemSuffix = stripCodePrefix(product.supplier_item_number, code);
  const variantChip = product.variant_name ?? product.variant_label;

  return (
    <div style={{ minWidth: 0 }}>
      {/* Header row: name + updated */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 5,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <InlineText
            value={product.name}
            onSave={async (next) => {
              const { error } = await supabase
                .from("products")
                .update({ name: next.trim() })
                .eq("id", product.id);
              if (error) throw new Error(error.message);
              onChanged?.();
            }}
            validate={(v) => (v.trim().length === 0 ? "Name required" : null)}
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#0E2849",
              lineHeight: 1.2,
            }}
            inputStyle={{
              fontSize: 14,
              fontWeight: 500,
              color: "#0E2849",
              lineHeight: 1.2,
              minWidth: 120,
            }}
          />

          {showVariantChip && variantChip && (
            <span
              style={{
                display: "inline-block",
                background: "#F3F4F6",
                color: "#4B5563",
                fontSize: 10,
                fontWeight: 500,
                padding: "1px 7px",
                borderRadius: 4,
                marginLeft: 6,
                verticalAlign: 1,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {variantChip}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: "#9CA3AF",
            whiteSpace: "nowrap",
          }}
        >
          {formatUpdated(product.updated_at)}
        </span>
      </div>

      {/* Code pill + item suffix */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {code ? (
          <span style={codePillStyle()}>{code}</span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span style={codePillStyle("warn")}>?</span>
            </TooltipTrigger>
            <TooltipContent>
              Supplier code not set — edit supplier to fix
            </TooltipContent>
          </Tooltip>
        )}
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "#0E2849",
            fontSize: 11,
          }}
        >
          {itemSuffix ? `-${itemSuffix}` : code ? "" : " unset"}
        </span>
      </div>

      {/* Details grid */}
      <DetailsGrid product={product} onChanged={onChanged} />
    </div>
  );
}

function DetailsGrid({ product, onChanged }: { product: Product; onChanged?: () => void }) {
  const rows = [...product.product_details].sort((a, b) => a.sort_order - b.sort_order);
  const existingLabelIds = new Set(
    rows.map((r) => r.detail_label?.id).filter((x): x is string => !!x),
  );

  return (
    <div style={{ marginTop: 7 }}>
      {rows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            gap: "2px 10px",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {rows.map((d) => (
            <DetailRowItem key={d.id} row={d} onChanged={onChanged} />
          ))}
        </div>
      )}
      <div style={{ marginTop: rows.length > 0 ? 4 : 0 }}>
        <AddAttributePopover
          productId={product.id}
          existingLabelIds={existingLabelIds}
          nextSortOrder={(rows.at(-1)?.sort_order ?? 0) + 1}
          onAdded={onChanged}
        />
      </div>
    </div>
  );
}

function DetailRowItem({ row, onChanged }: { row: ProductDetailRow; onChanged?: () => void }) {
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(`Remove "${row.detail_label?.label ?? "attribute"}" from this product?`)) return;
    setBusy(true);
    const { error } = await supabase.from("product_details").delete().eq("id", row.id);
    setBusy(false);
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
      style={{ display: "contents" }}
    >
      <span style={{ color: "#6B7280" }}>{row.detail_label?.label ?? "—"}</span>
      <span style={{ color: "#0E2849" }}>{row.value}</span>
      <button
        type="button"
        onClick={remove}
        aria-label="Remove attribute"
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

function codePillStyle(variant: "default" | "warn" = "default"): React.CSSProperties {
  if (variant === "warn") {
    return {
      background: "#FEF3E2",
      color: "#C2410C",
      padding: "2px 7px",
      borderRadius: 4,
      fontWeight: 500,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      letterSpacing: "0.04em",
      fontSize: 11,
      cursor: "help",
    };
  }
  return {
    background: "#E5EAF1",
    color: "#0E2849",
    padding: "2px 7px",
    borderRadius: 4,
    fontWeight: 500,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    letterSpacing: "0.04em",
    fontSize: 11,
  };
}

/** If the stored item number begins with "{code}-", return the rest. */
function stripCodePrefix(item: string | null, code: string | null): string {
  if (!item) return "";
  if (!code) return item;
  const prefix = `${code}-`;
  return item.startsWith(prefix) ? item.slice(prefix.length) : item;
}

// ─── Specs ────────────────────────────────────────────────────────────────

function SpecsCell({
  product,
  weightUnit,
  volumeUnit,
}: {
  product: Product;
  weightUnit: string;
  volumeUnit: string;
}) {
  const dims =
    product.carton_length != null &&
    product.carton_width != null &&
    product.carton_height != null
      ? `${trimNum(product.carton_length)}\u00d7${trimNum(product.carton_width)}\u00d7${trimNum(
          product.carton_height,
        )}`
      : null;

  return (
    <div
      style={{
        borderLeft: "0.5px solid #F1F2F4",
        paddingLeft: 10,
        paddingTop: 2,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 12,
        color: "#0E2849",
        lineHeight: 1.2,
      }}
    >
      <SpecLine value={product.carton_pack} unit="unit / ctn" />
      <SpecLine value={dims} unit={volumeUnit} />
      <SpecLine value={product.carton_weight} unit={weightUnit} />
      <span>{formatLeadTime(product.production_days_min, product.production_days_max)}</span>
    </div>
  );
}

function SpecLine({ value, unit }: { value: number | string | null; unit: string }) {
  if (value == null || value === "") return <span style={{ color: "#9CA3AF" }}>—</span>;
  return (
    <span>
      {typeof value === "number" ? trimNum(value) : value}
      <span style={{ color: "#6B7280", marginLeft: 2, fontSize: 11 }}>{unit}</span>
    </span>
  );
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(2)));
}
