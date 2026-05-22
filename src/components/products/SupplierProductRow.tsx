import { X, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product, ProductDetailRow } from "./helpers/buildSupplierProductDataList";
import { formatUpdated } from "./helpers/formatUpdated";
import { weightUnitLabel as weightUnitFor, linearUnit as linearUnitFor } from "@/lib/units";
import { DecorationBlock } from "./DecorationBlock";
import { AddAttributePopover } from "./AddAttributePopover";
import { InlineText } from "@/components/inline/InlineText";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlineNumberGroup } from "@/components/inline/InlineNumberGroup";
import { ProductImageGallery } from "./ProductImageGallery";
import { supabase } from "@/integrations/supabase/client";
import { formatLeadTime } from "./helpers/formatLeadTime";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ProductCardMenu } from "./ProductCardMenu";
import { duplicateProductAsVariant } from "./helpers/duplicateProductAsVariant";

interface SupplierProductRowProps {
  product: Product;
  /** Inside a variant group, show the variant label more prominently. */
  showVariantInline?: boolean;
  /** When this matches product.id, the variant-label inline editor opens automatically. */
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}

const VISIBLE_DECO_SLOTS = 2;

async function updateProduct(id: string, patch: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products").update(patch as any).eq("id", id));
  if (error) throw new Error(error.message);
}

export function SupplierProductRow({ product, showVariantInline = false, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const specsIncomplete =
    product.carton_pack == null ||
    product.carton_length == null ||
    product.carton_width == null ||
    product.carton_height == null ||
    product.carton_weight == null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("products").delete().eq("id", product.id) as any);
      if (error) throw new Error(error.message);
      toast.success(`Deleted ${product.name}`);
      setConfirmDelete(false);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(440px, 1.5fr) minmax(220px, 1fr) minmax(420px, 2fr)",
        gap: 28,
        padding: "20px 22px",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          zIndex: 2,
        }}
      >
        <div style={{ opacity: hovered ? 1 : 0.45, transition: "opacity 120ms" }}>
          <ProductCardMenu
            onDuplicateAsVariant={async () => {
              try {
                const newId = await duplicateProductAsVariant(product.id);
                toast.success("Variant created");
                onDuplicated?.(newId);
                onChanged?.();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to duplicate");
              }
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          aria-label={`Delete ${product.name}`}
          title="Delete product"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "rgba(239, 68, 68, 0.1)",
            color: "#ef4444",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: hovered ? 1 : 0,
            transition: "opacity 120ms",
          }}
        >
          <X size={13} />
        </button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete product?"
        description={`Delete ${product.name}? This removes all its decorations, pricing, and details. This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        onConfirm={handleDelete}
        onCancel={() => !deleting && setConfirmDelete(false)}
      />

      {/* ── BLOCK 1: Identity ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 14, minWidth: 0 }}>
        <ProductImageGallery
          productId={product.id}
          productName={product.name}
          legacyImageUrl={product.image_url}
          onChanged={onChanged}
        />
        <IdentityCell product={product} showVariantInline={showVariantInline} autoEditVariant={autoFocusVariantForId === product.id} onChanged={onChanged} />
      </div>

      {/* ── BLOCK 2: Specs ─────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {specsIncomplete && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#FEF3E2",
              color: "#C2410C",
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 4,
              marginBottom: 8,
            }}
            title="Engine-critical specs missing — this product will not be costed until carton pack, dimensions, and weight are filled."
          >
            <AlertTriangle size={12} /> specs incomplete
          </div>
        )}
        <SpecsCell
          product={product}
          weightUnit={wUnit}
          volumeUnit={lUnit}
          onChanged={onChanged}
        />
      </div>

      {/* ── BLOCK 3: Pricing ───────────────────────────────────────── */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {primary.map((slot, i) => (
            <DecorationBlock
              key={slot?.id ?? `empty-${i}`}
              decoration={slot}
              productId={product.id}
              nextSortOrder={nextDecoSortOrder + i}
              onChanged={onChanged}
            />
          ))}
        </div>
        {hasOverflow && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              alignSelf: "flex-start",
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
        {expanded && hasOverflow && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
    </div>
  );
}

// ─── Identity ─────────────────────────────────────────────────────────────

function IdentityCell({
  product,
  showVariantInline,
  autoEditVariant,
  onChanged,
}: {
  product: Product;
  showVariantInline: boolean;
  autoEditVariant?: boolean;
  onChanged?: () => void;
}) {
  const code = product.supplier?.code ?? null;
  const itemSuffix = stripCodePrefix(product.supplier_item_number, code);
  const variantText = product.variant_name ?? product.variant_label ?? "";

  return (
    <div style={{ minWidth: 0, flex: 1 }}>
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
            style={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2 }}
            inputStyle={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2, minWidth: 120 }}
          />
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

      {/* Row 2: variant label as chip (only when present or being edited) */}
      {(variantText || autoEditVariant) ? (
        <div style={{ marginTop: 4, marginBottom: 6 }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 4,
              background: "#E5EAF1",
              color: "#0E2849",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.02em",
              lineHeight: 1.4,
            }}
          >
            <InlineText
              value={variantText}
              placeholder="add variant"
              autoEdit={autoEditVariant}
              onSave={async (next) => {
                const v = next.trim();
                await updateProduct(product.id, { variant_name: v.length ? v : null });
                onChanged?.();
              }}
              style={{ fontSize: 12, fontWeight: 600, color: "#0E2849" }}
              inputStyle={{ fontSize: 12, fontWeight: 600, color: "#0E2849", minWidth: 100 }}
            />
          </span>
        </div>
      ) : showVariantInline ? (
        <div style={{ marginTop: 2, marginBottom: 6 }}>
          <InlineText
            value=""
            placeholder="add variant"
            onSave={async (next) => {
              const v = next.trim();
              await updateProduct(product.id, { variant_name: v.length ? v : null });
              onChanged?.();
            }}
            style={{ fontSize: 12, color: "#9CA3AF" }}
            inputStyle={{ fontSize: 12, color: "#0E2849", minWidth: 100 }}
          />
        </div>
      ) : null}

      {/* Code pill + item suffix */}
      <div style={{ display: "inline-flex", alignItems: "center", fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>
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

      {/* Supplier / Category / Subcategory / Origin */}
      <div
        style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "3px 12px",
          fontSize: 12,
          lineHeight: 1.4,
        }}
      >
        <KvLabel>Supplier</KvLabel>
        <KvValue>{product.supplier?.name ?? "—"}</KvValue>
        <KvLabel>Subcategory</KvLabel>
        <KvValue>{product.subcategory?.name ?? "—"}</KvValue>
        <KvLabel>Origin</KvLabel>
        <KvValue>{product.origin?.name ?? "—"}</KvValue>
      </div>

      {/* Details grid */}
      <DetailsGrid product={product} onChanged={onChanged} />
    </div>
  );
}

function KvLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}
function KvValue({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#0E2849", fontSize: 12 }}>{children}</span>;
}

function DetailsGrid({ product, onChanged }: { product: Product; onChanged?: () => void }) {
  const rows = [...product.product_details].sort((a, b) => a.sort_order - b.sort_order);
  const existingLabelIds = new Set(
    rows.map((r) => r.detail_label?.id).filter((x): x is string => !!x),
  );

  return (
    <div style={{ marginTop: 10 }}>
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
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontSize: 13,
        color: "#0E2849",
        lineHeight: 1.3,
      }}
    >
      <SpecRow label="Pcs / ctn">
        <InlineNumber
          value={product.carton_pack}
          integer
          min={1}
          nullable
          width={48}
          onSave={(v) => save({ carton_pack: v })}
        />
      </SpecRow>
      <SpecRow label={`L × W × H (${volumeUnit})`}>
        <InlineNumberGroup
          style={{ fontSize: 13, color: "#0E2849" }}
          fields={[
            { value: product.carton_length, integer: true, min: 1, nullable: true, width: 40, label: "Length" },
            { value: product.carton_width, integer: true, min: 1, nullable: true, width: 40, label: "Width" },
            { value: product.carton_height, integer: true, min: 1, nullable: true, width: 40, label: "Height" },
          ]}
          separators={["×", "×"]}
          display={
            <span>
              {product.carton_length ?? "—"} × {product.carton_width ?? "—"} × {product.carton_height ?? "—"}{" "}
            </span>
          }
          onSave={async ([l, w, h]) => {
            await save({ carton_length: l, carton_width: w, carton_height: h });
          }}
        />
      </SpecRow>
      <SpecRow label={`Weight (${weightUnit})`}>
        <InlineNumber
          value={product.carton_weight}
          min={0}
          nullable
          width={56}
          onSave={(v) => save({ carton_weight: v })}
        />
      </SpecRow>
      <SpecRow label="Lead time (days)">
        <InlineNumberGroup
          style={{ fontSize: 13, color: "#0E2849" }}
          fields={[
            { value: product.production_days_min, integer: true, min: 1, nullable: false, width: 40, label: "Min days" },
            { value: product.production_days_max, integer: true, min: 1, nullable: true, width: 40, label: "Max days" },
          ]}
          separators={["–"]}
          display={
            <span>
              {formatLeadTime(product.production_days_min, product.production_days_max).replace(/\s*days$/, "")}{" "}
            </span>
          }
          validateGroup={([min, max]) => {
            if (min == null) return { fieldIndex: 0, message: "Required" };
            if (max != null && max < min) return { fieldIndex: 1, message: `≥ ${min}` };
            return null;
          }}
          onSave={async ([min, max]) => {
            const normalizedMax = max != null && min != null && max === min ? null : max;
            await save({ production_days_min: min, production_days_max: normalizedMax });
          }}
        />
      </SpecRow>
    </div>
  );
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 10, alignItems: "baseline" }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6B7280" }}>
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}
