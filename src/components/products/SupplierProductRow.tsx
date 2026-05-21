import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product, ProductDetailRow } from "./helpers/buildProductsList";
import { formatUpdated } from "./helpers/formatUpdated";
import { weightUnit as weightUnitFor, linearUnit as linearUnitFor } from "@/lib/units";
import { DecorationBlock } from "./DecorationBlock";
import { AddAttributePopover } from "./AddAttributePopover";
import { InlineText } from "@/components/inline/InlineText";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlineNumberGroup } from "@/components/inline/InlineNumberGroup";
import { ImageUploadCell } from "./ImageUploadCell";
import { supabase } from "@/integrations/supabase/client";
import { formatLeadTime } from "./helpers/formatLeadTime";

interface SupplierProductRowProps {
  product: Product;
  /** Show the variant chip beside the name (used inside Card 102). */
  showVariantChip?: boolean;
  onChanged?: () => void;
}

const GRID_COLS = "160px 320px 120px 280px 280px";
const VISIBLE_DECO_SLOTS = 2;

async function updateProduct(id: string, patch: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products").update(patch as any).eq("id", id));
  if (error) throw new Error(error.message);
}

export function SupplierProductRow({ product, showVariantChip = false, onChanged }: SupplierProductRowProps) {
  const [expanded, setExpanded] = useState(false);
  const allDecos = [...product.product_decorations].sort((a, b) => a.sort_order - b.sort_order);
  const primary: (Product["product_decorations"][number] | null)[] = [
    allDecos[0] ?? null,
    allDecos[1] ?? null,
  ];
  const overflow = allDecos.slice(VISIBLE_DECO_SLOTS);
  const hasOverflow = overflow.length > 0;
  const nextDecoSortOrder = (allDecos.at(-1)?.sort_order ?? 0) + 1;

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
      <ImageUploadCell
        productId={product.id}
        imageUrl={product.image_url}
        productName={product.name}
        size={160}
        onChanged={onChanged}
      />

      {/* Identity */}
      <IdentityCell product={product} showVariantChip={showVariantChip} onChanged={onChanged} />

      {/* Specs */}
      <SpecsCell
        product={product}
        weightUnit={wUnit}
        volumeUnit={lUnit}
        onChanged={onChanged}
      />

      {/* Decoration slots — primary 2 */}
      {primary.map((slot, i) => (
        <div key={slot?.id ?? `empty-${i}`}>
          <DecorationBlock
            decoration={slot}
            productId={product.id}
            nextSortOrder={nextDecoSortOrder + i}
            onChanged={onChanged}
          />
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
                <DecorationBlock
                  key={d.id}
                  decoration={d}
                  productId={product.id}
                  onChanged={onChanged}
                />
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
  const variantChip = product.variant_name ?? product.variant_label ?? "";

  return (
    <div style={{ minWidth: 0 }}>
      {/* Row 1: name + updated */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <InlineText
            value={product.name}
            onSave={async (next) => {
              await updateProduct(product.id, { name: next.trim() });
              onChanged?.();
            }}
            validate={(v) => (v.trim().length === 0 ? "Name required" : null)}
            style={{ fontSize: 16, fontWeight: 500, color: "#0E2849", lineHeight: 1.2 }}
            inputStyle={{ fontSize: 16, fontWeight: 500, color: "#0E2849", lineHeight: 1.2, minWidth: 120 }}
          />
        </div>
        <span
          style={{
            fontSize: 12,
            fontStyle: "italic",
            color: "#9CA3AF",
            whiteSpace: "nowrap",
          }}
        >
          {formatUpdated(product.updated_at)}
        </span>
      </div>

      {/* Row 2: variant + parent edit */}
      <div style={{ marginTop: 4, marginBottom: 5, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {showVariantChip && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              background: "#F3F4F6",
              color: "#4B5563",
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 4,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            <InlineText
              value={variantChip}
              placeholder="variant"
              onSave={async (next) => {
                const v = next.trim();
                await updateProduct(product.id, { variant_name: v.length ? v : null });
                onChanged?.();
              }}
              style={{ color: "#4B5563", fontSize: 11, fontWeight: 500, letterSpacing: "0.05em" }}
              inputStyle={{ fontSize: 11, fontWeight: 500, minWidth: 60, textTransform: "uppercase" }}
            />
          </span>
        )}
        <span style={{ fontSize: 11, color: "#9CA3AF", display: "inline-flex", alignItems: "center", gap: 4 }}>
          parent:
          <InlineText
            value={product.parent_name ?? ""}
            placeholder="+ link"
            onSave={async (next) => {
              const v = next.trim();
              await updateProduct(product.id, { parent_name: v.length ? v : null });
              onChanged?.();
            }}
            style={{ color: "#6B7280", fontSize: 11 }}
            inputStyle={{ fontSize: 11, minWidth: 100 }}
          />
        </span>
      </div>

      {/* Code pill + item suffix */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          fontSize: 12,
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
            <TooltipContent>Supplier code not set — edit supplier to fix</TooltipContent>
          </Tooltip>
        )}
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "#0E2849",
            fontSize: 12,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {code ? "-" : ""}
          <InlineText
            value={itemSuffix}
            placeholder="suffix"
            onSave={async (next) => {
              const v = next.trim().toUpperCase();
              const assembled = code ? (v.length ? `${code}-${v}` : code) : v.length ? v : null;
              await updateProduct(product.id, { supplier_item_number: assembled });
              onChanged?.();
            }}
            validate={(v) => {
              const t = v.trim();
              if (t.length === 0) return null;
              return /^[A-Za-z0-9-]+$/.test(t) ? null : "Use letters, numbers, hyphens";
            }}
            style={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#0E2849" }}
            inputStyle={{ fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", minWidth: 60 }}
          />
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
            gap: "4px 16px",
            fontSize: 12,
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
      <span style={{ color: "#0E2849" }}>
        <InlineText
          value={row.value}
          onSave={async (next) => {
            const v = next.trim();
            if (!v) throw new Error("Value required");
            const { error } = await supabase
              .from("product_details")
              .update({ value: v })
              .eq("id", row.id);
            if (error) throw new Error(error.message);
            onChanged?.();
          }}
          validate={(v) => (v.trim().length === 0 ? "Required" : null)}
          style={{ color: "#0E2849", fontSize: 12 }}
          inputStyle={{ fontSize: 12, minWidth: 80 }}
        />
      </span>
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
  const base: React.CSSProperties = {
    padding: "2px 7px",
    borderRadius: 4,
    fontWeight: 500,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    letterSpacing: "0.04em",
    fontSize: 12,
  };
  if (variant === "warn") {
    return { ...base, background: "#FEF3E2", color: "#C2410C", cursor: "help" };
  }
  return { ...base, background: "#E5EAF1", color: "#0E2849" };
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
  onChanged,
}: {
  product: Product;
  weightUnit: string;
  volumeUnit: string;
  onChanged?: () => void;
}) {
  const save = async (patch: Record<string, unknown>) => {
    await updateProduct(product.id, patch);
    onChanged?.();
  };

  return (
    <div
      style={{
        borderLeft: "0.5px solid #F1F2F4",
        paddingLeft: 10,
        paddingTop: 2,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontSize: 13,
        color: "#0E2849",
        lineHeight: 1.2,
      }}
    >
      {/* Carton pack */}
      <span>
        <InlineNumber
          value={product.carton_pack}
          integer
          min={1}
          nullable
          width={48}
          onSave={(v) => save({ carton_pack: v })}
        />
        <span style={{ color: "#6B7280", marginLeft: 2, fontSize: 12 }}>unit / ctn</span>
      </span>

      {/* L × W × H */}
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
        <InlineNumber
          value={product.carton_length}
          integer
          min={1}
          nullable
          width={40}
          onSave={(v) => save({ carton_length: v })}
        />
        <span>×</span>
        <InlineNumber
          value={product.carton_width}
          integer
          min={1}
          nullable
          width={40}
          onSave={(v) => save({ carton_width: v })}
        />
        <span>×</span>
        <InlineNumber
          value={product.carton_height}
          integer
          min={1}
          nullable
          width={40}
          onSave={(v) => save({ carton_height: v })}
        />
        <span style={{ color: "#6B7280", marginLeft: 2, fontSize: 12 }}>{volumeUnit}</span>
      </span>

      {/* Weight */}
      <span>
        <InlineNumber
          value={product.carton_weight}
          min={0}
          nullable
          width={56}
          onSave={(v) => save({ carton_weight: v })}
        />
        <span style={{ color: "#6B7280", marginLeft: 2, fontSize: 12 }}>{weightUnit}</span>
      </span>

      {/* Lead time min – max */}
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2 }}>
        <InlineNumber
          value={product.production_days_min}
          integer
          min={1}
          width={40}
          onSave={(v) => {
            if (v == null) return Promise.resolve();
            return save({ production_days_min: v });
          }}
        />
        <span>–</span>
        <InlineNumber
          value={product.production_days_max}
          integer
          min={product.production_days_min ?? 1}
          nullable
          width={40}
          onSave={(v) => save({ production_days_max: v })}
        />
        <span style={{ color: "#6B7280", marginLeft: 2, fontSize: 12 }}>days</span>
      </span>
    </div>
  );
}
