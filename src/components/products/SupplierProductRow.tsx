import { X, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product, ProductDetailRow } from "./helpers/buildSupplierProductDataList";

import { weightUnitLabel as weightUnitFor, linearUnit as linearUnitFor } from "@/lib/units";
import { DecorationBlock } from "./DecorationBlock";
import { AddAttributePopover } from "./AddAttributePopover";
import { InlineText } from "@/components/inline/InlineText";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlineNumberGroup } from "@/components/inline/InlineNumberGroup";
import { InlinePicker } from "@/components/inline/InlinePicker";
import { ProductImageGallery } from "./ProductImageGallery";
import { IncludesBlock } from "./IncludesBlock";
import { useDetailLabels, ensureDetailLabel, type DetailLabel } from "./helpers/useDetailLabels";
import { supabase } from "@/integrations/supabase/client";
import { formatLeadTime } from "./helpers/formatLeadTime";
import { ConfirmDialog } from "@/components/leads/ConfirmDialog";
import { ProductCardMenu } from "./ProductCardMenu";
import { duplicateProductAsVariant } from "./helpers/duplicateProductAsVariant";
import { SHEET_GRID_TEMPLATE, SHEET_COL_GAP, SHEET_ROW_PADDING } from "./helpers/sheetGrid";
import type { CategoryRowLite, SupplierLite, OriginLite } from "./SupplierProductDataList";
import { KitComponentsBlock } from "./KitComponentsBlock";
import { KitPricingBlock } from "./KitPricingBlock";
import { KitQuantityTiers } from "./KitQuantityTiers";
import { liveGateMissing } from "@/lib/productLiveGate";


const DEFAULT_ATTRIBUTE_NAMES = ["Material", "Size"];




const KV_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr",
  rowGap: 6,
  columnGap: 12,
  fontSize: 12,
  lineHeight: 1.4,
  alignItems: "baseline",
};


interface SupplierProductRowProps {
  product: Product;
  /** Resolved parent-category name (from in-memory category map). */
  categoryName?: string | null;
  /** All categories (parents + subcategories) — used to populate inline pickers. */
  allCategories?: CategoryRowLite[];
  /** All suppliers — used by the supplier inline picker. */
  suppliers?: SupplierLite[];
  /** All origins — used by the origin inline picker. */
  origins?: OriginLite[];
  /** All loaded products on the sheet (used to filter kit component eligibility). */
  allProducts?: Product[];
  /** Inside a variant group, show the variant label more prominently. */
  showVariantInline?: boolean;
  /** When this matches product.id, the variant-label inline editor opens automatically. */
  autoFocusVariantForId?: string | null;
  onChanged?: () => void;
  onDuplicated?: (newId: string) => void;
}



async function updateProduct(id: string, patch: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products").update(patch as any).eq("id", id));
  if (error) throw new Error(error.message);
}

export function SupplierProductRow({ product, categoryName, allCategories = [], suppliers = [], origins = [], allProducts = [], showVariantInline = false, autoFocusVariantForId, onChanged, onDuplicated }: SupplierProductRowProps) {
  const [hovered, setHovered] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const allDecos = [...product.product_decorations].sort((a, b) => a.sort_order - b.sort_order);
  const nextDecoSortOrder = (allDecos.at(-1)?.sort_order ?? 0) + 1;

  const isKit = (product.product_kind ?? "single") === "kit";
  const kitComponents = product.kit_components ?? [];

  const system = product.supplier?.unit_system ?? "metric";
  const wUnit = weightUnitFor(system);
  const lUnit = linearUnitFor(system);

  const isDraft = (product.status ?? "live") === "draft";
  const liveMissing = liveGateMissing(product);
  const liveEligible = liveMissing.length === 0;

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

  // Convert paths removed: kits are created via "+ Kit" and removed via delete.

  const cellStyle = (isLast: boolean): React.CSSProperties => ({
    minWidth: 0,
    position: "relative",
  });
  const Divider = () => (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        right: -SHEET_COL_GAP / 2,
        width: 1,
        background: "#E5E7EB",
        pointerEvents: "none",
      }}
    />
  );

  const handleSetStatus = async (next: "draft" | "live") => {
    try {
      await updateProduct(product.id, { status: next });
      toast.success(next === "live" ? `Made live: ${product.name}` : `Reverted to draft: ${product.name}`);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        background: isDraft ? "#FFFBF1" : "transparent",
        borderLeft: isDraft ? "3px solid #E97B2C" : "3px solid transparent",
      }}
    >
      {isDraft && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 14px 0 14px",
            fontSize: 12,
          }}
        >
          <span
            aria-label="Draft product — not yet costable"
            title="Draft — this product is not used by the costing engine until you make it live."
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#E97B2C",
              color: "#FFFFFF",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "3px 8px",
              borderRadius: 4,
              textTransform: "uppercase",
            }}
          >
            <AlertTriangle size={11} /> DRAFT
          </span>
          <button
            type="button"
            disabled={!liveEligible}
            onClick={() => liveEligible && handleSetStatus("live")}
            title={
              liveEligible
                ? "Mark this product as live so it can be costed and assigned."
                : `Cannot make live yet. Missing: ${liveMissing.map((m) => m.label).join(", ")}`
            }
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: "none",
              background: liveEligible ? "#1B2A4E" : "#E5E7EB",
              color: liveEligible ? "#FFFFFF" : "#9CA3AF",
              fontSize: 12,
              fontWeight: 600,
              cursor: liveEligible ? "pointer" : "not-allowed",
            }}
          >
            Make Live
          </button>
          {!liveEligible && (
            <span style={{ color: "#92400E", fontSize: 11 }}>
              Still missing: {liveMissing.map((m) => m.label).join(", ")}
            </span>
          )}
        </div>
      )}
      {!isDraft && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 14,
            zIndex: 2,
          }}
        >
          <button
            type="button"
            onClick={() => handleSetStatus("draft")}
            title="Revert this product to draft. It will stop being costed."
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              border: "0.5px solid #E5E7EB",
              background: "transparent",
              color: "#6B7280",
              fontSize: 10,
              fontWeight: 500,
              cursor: "pointer",
              opacity: hovered ? 1 : 0,
              transition: "opacity 120ms",
            }}
          >
            Revert to draft
          </button>
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: SHEET_GRID_TEMPLATE,
          columnGap: SHEET_COL_GAP,
          alignItems: "start",
          padding: SHEET_ROW_PADDING,
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

      {/* ── BLOCK 1: Images ────────────────────────────────────────── */}
      <div style={cellStyle(false)}>
        <ProductImageGallery
          productId={product.id}
          productName={product.name}
          legacyImageUrl={product.image_url}
          updatedAt={product.updated_at}
          onChanged={onChanged}
        />
        <Divider />
      </div>

      {/* ── BLOCK 2: Identity ──────────────────────────────────────── */}
      <div style={cellStyle(false)}>
        <IdentityCell
          product={product}
          categoryName={categoryName ?? null}
          allCategories={allCategories}
          suppliers={suppliers}
          origins={origins}
          showVariantInline={showVariantInline}
          autoEditVariant={autoFocusVariantForId === product.id}
          onChanged={onChanged}
        />
        <Divider />
      </div>

      {/* ── BLOCK 3: Product Details (Attributes + Includes) ──────── */}
      <div style={{ ...cellStyle(false), paddingTop: 14 }}>
        <DetailsGrid product={product} onChanged={onChanged} />
        <Divider />
      </div>

      {/* ── BLOCK 4: Packing OR Components (kit) ──────────────────── */}
      <div style={{ ...cellStyle(false), paddingTop: 14 }}>
        {isKit ? (
          <KitComponentsBlock
            kitProductId={product.id}
            components={kitComponents}
            allProducts={allProducts}
            onChanged={onChanged}
          />
        ) : (
          <>
            <SpecsCell
              product={product}
              weightUnit={wUnit}
              volumeUnit={lUnit}
              onChanged={onChanged}
            />
          </>
        )}
        <Divider />
      </div>

      {/* ── BLOCK 5: Pricing OR Kit Pricing ───────────────────────── */}
      <div style={{ ...cellStyle(true), paddingTop: 14 }}>
        {isKit ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <KitQuantityTiers kitProductId={product.id} />
            <KitPricingBlock kitProductId={product.id} components={kitComponents} />
          </div>

        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {allDecos.map((d, i) => (
              <DecorationBlock
                key={d.id}
                decoration={d}
                productId={product.id}
                nextSortOrder={nextDecoSortOrder + i}
                onChanged={onChanged}
              />
            ))}
            <DecorationBlock
              decoration={null}
              productId={product.id}
              nextSortOrder={nextDecoSortOrder + allDecos.length}
              onChanged={onChanged}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}



// ─── Identity ─────────────────────────────────────────────────────────────

function IdentityCell({
  product,
  categoryName,
  allCategories = [],
  suppliers = [],
  origins = [],
  showVariantInline: _showVariantInline,
  autoEditVariant,
  onChanged,
}: {
  product: Product;
  categoryName: string | null;
  allCategories?: CategoryRowLite[];
  suppliers?: SupplierLite[];
  origins?: OriginLite[];
  showVariantInline: boolean;
  autoEditVariant?: boolean;
  onChanged?: () => void;
}) {
  const code = product.supplier?.code ?? null;
  const itemSuffix = stripCodePrefix(product.supplier_item_number, code);
  const variantText = product.variant_name ?? product.variant_label ?? "";

  // Resolve current category id from the product's subcategory's parent.
  const currentSubcat = product.subcategory ?? null;
  const currentCategoryId = (() => {
    if (!currentSubcat) return null;
    const sub = allCategories.find((c) => c.id === currentSubcat.id);
    return sub?.parent_id ?? null;
  })();

  // Sort comparator: by category code (asc), nulls last; ties broken by name.
  const byCategoryCode = (a: CategoryRowLite, b: CategoryRowLite) => {
    const ac = a.code ?? "";
    const bc = b.code ?? "";
    if (ac && bc) {
      const cmp = ac.localeCompare(bc);
      if (cmp !== 0) return cmp;
    } else if (ac && !bc) return -1;
    else if (!ac && bc) return 1;
    return a.name.localeCompare(b.name);
  };

  const parentCategories = allCategories
    .filter((c) => c.parent_id == null)
    .sort(byCategoryCode);

  const subcategoryOptionsAll = allCategories
    .filter((c) => c.parent_id != null)
    .sort(byCategoryCode);

  // Suppliers — sorted by name.
  const supplierOptions = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div style={{ minWidth: 0 }}>
      {/* Name */}
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
        {(product.product_kind ?? "single") === "kit" && (
          <span
            style={{
              background: "hsl(var(--brand-orange))",
              color: "#FFFFFF",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "2px 8px",
              borderRadius: 999,
              fontWeight: 600,
            }}
            title="This product is a kit — its cost is the sum of its components."
          >
            Kit
          </span>
        )}
      </div>

      {/* Variant chip / placeholder */}
      {(variantText || autoEditVariant) ? (
        <div style={{ marginTop: 6, marginBottom: 8 }}>
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
      ) : (
        <div style={{ marginTop: 4, marginBottom: 8 }}>
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
      )}

      {/* Supplier / Item Number / Origin / Category / Subcategory */}
      <div style={KV_GRID_STYLE}>

        <KvLabel>Supplier</KvLabel>
        <KvValue>
          <InlinePicker
            display={<span>{product.supplier?.name ?? "—"}</span>}
            options={supplierOptions.map((s) => ({ id: s.id, label: s.name, hint: s.code ?? undefined }))}
            onSelect={async (opt) => {
              const next = supplierOptions.find((s) => s.id === opt.id);
              if (!next || next.id === product.supplier?.id) return;
              // Re-prefix item number using the new supplier's code (display label only;
              // numeric packing values are preserved as-is).
              const suffix = stripCodePrefix(product.supplier_item_number, code);
              const newCode = next.code ?? null;
              const assembled = newCode
                ? (suffix ? `${newCode}-${suffix}` : newCode)
                : (suffix ? suffix : null);
              await updateProduct(product.id, {
                supplier_id: next.id,
                supplier_item_number: assembled,
              });
              toast.success("Supplier updated — item number re-prefixed");
              onChanged?.();
            }}
            placeholder="Search supplier…"
          />
        </KvValue>

        <KvLabel>Supplier Item Number</KvLabel>
        <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12, lineHeight: 1.4 }}>
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
        </span>

        <KvLabel>Origin</KvLabel>
        <KvValue>
          <span style={{ color: "#0E2849" }}>{product.origin?.name ?? "—"}</span>
        </KvValue>

        <CategorySubcategoryPickers
          productId={product.id}
          currentCategoryId={currentCategoryId}
          currentSubcategoryId={product.subcategory?.id ?? null}
          currentSubcategoryName={product.subcategory?.name ?? null}
          categoryName={categoryName ?? null}
          parentCategories={parentCategories}
          subcategoryOptionsAll={subcategoryOptionsAll}
          onChanged={onChanged}
        />
      </div>
    </div>
  );
}

function CategorySubcategoryPickers({
  productId,
  currentCategoryId,
  currentSubcategoryId,
  currentSubcategoryName,
  categoryName,
  parentCategories,
  subcategoryOptionsAll,
  onChanged,
}: {
  productId: string;
  currentCategoryId: string | null;
  currentSubcategoryId: string | null;
  currentSubcategoryName: string | null;
  categoryName: string | null;
  parentCategories: CategoryRowLite[];
  subcategoryOptionsAll: CategoryRowLite[];
  onChanged?: () => void;
}) {
  // Transient: a chosen Category that doesn't match the persisted subcategory's parent.
  // Cleared when the user picks a subcategory (which is the only persisted write).
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

  // Effective category for display + scoping = pending (if set) else currentCategoryId.
  const effectiveCategoryId = pendingCategoryId ?? currentCategoryId;
  const effectiveCategoryName =
    (pendingCategoryId
      ? parentCategories.find((c) => c.id === pendingCategoryId)?.name
      : categoryName) ?? null;

  const needsSubcategorySelection =
    pendingCategoryId !== null && pendingCategoryId !== currentCategoryId;

  const subcategoryOptionsScoped = effectiveCategoryId
    ? subcategoryOptionsAll.filter((c) => c.parent_id === effectiveCategoryId)
    : subcategoryOptionsAll;

  return (
    <>
      <KvLabel>Category</KvLabel>
      <KvValue>
        <InlinePicker
          display={<span>{effectiveCategoryName ?? "—"}</span>}
          options={parentCategories.map((c) => ({ id: c.id, label: c.name, hint: c.code ?? undefined }))}
          onSelect={async (opt) => {
            if (opt.id === effectiveCategoryId) return;
            setPendingCategoryId(opt.id);
            toast.message("Category chosen — pick a subcategory to save");
          }}
          placeholder="Search category…"
        />
      </KvValue>

      <KvLabel>Subcategory</KvLabel>
      <KvValue>
        <InlinePicker
          display={
            needsSubcategorySelection ? (
              <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>select subcategory</span>
            ) : (
              <span>{currentSubcategoryName ?? "—"}</span>
            )
          }
          options={subcategoryOptionsScoped.map((c) => ({ id: c.id, label: c.name, hint: c.code ?? undefined }))}
          onSelect={async (opt) => {
            if (opt.id === currentSubcategoryId && !needsSubcategorySelection) return;
            await updateProduct(productId, { subcategory_id: opt.id });
            setPendingCategoryId(null);
            onChanged?.();
          }}
          placeholder="Search subcategory…"
        />
      </KvValue>
    </>
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
  const allLabels = useDetailLabels();
  const rows = [...product.product_details].sort((a, b) => a.sort_order - b.sort_order);
  const existingLabelIds = new Set(
    rows.map((r) => r.detail_label?.id).filter((x): x is string => !!x),
  );
  const existingLabelNamesLower = new Set(
    rows
      .map((r) => r.detail_label?.label?.trim().toLowerCase())
      .filter((x): x is string => !!x),
  );

  // Default rows (Material / Size) shown as virtual placeholders when missing.
  const virtualDefaults = DEFAULT_ATTRIBUTE_NAMES.filter(
    (name) => !existingLabelNamesLower.has(name.toLowerCase()),
  );

  const nextSort = (rows.at(-1)?.sort_order ?? 0) + 1;
  const includes = product.product_includes ?? [];

  return (
    <div>
      {(rows.length > 0 || virtualDefaults.length > 0) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "88px 1fr 16px",
            rowGap: 6,
            columnGap: 12,
            fontSize: 12,
            lineHeight: 1.4,
            alignItems: "baseline",
          }}
        >
          {rows.map((d) => (
            <RealAttributeRow
              key={d.id}
              row={d}
              allLabels={allLabels}
              existingLabelIds={existingLabelIds}
              onChanged={onChanged}
            />
          ))}
          {virtualDefaults.map((name, i) => (
            <VirtualAttributeRow
              key={`virtual-${name}`}
              labelName={name}
              productId={product.id}
              sortOrder={nextSort + i}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: rows.length > 0 || virtualDefaults.length > 0 ? 4 : 0 }}>
        <AddAttributePopover
          productId={product.id}
          existingLabelIds={existingLabelIds}
          nextSortOrder={nextSort + virtualDefaults.length}
          onAdded={onChanged}
        />
      </div>
      <IncludesBlock productId={product.id} rows={includes} onChanged={onChanged} />
    </div>
  );
}

function AttributeLabelPicker({
  currentId,
  currentLabel,
  allLabels,
  existingLabelIds,
  onPick,
}: {
  currentId: string | null;
  currentLabel: string;
  allLabels: DetailLabel[];
  existingLabelIds: Set<string>;
  onPick: (label: DetailLabel) => Promise<void>;
}) {
  const options = allLabels
    .filter((l) => l.id === currentId || !existingLabelIds.has(l.id))
    .map((l) => ({ id: l.id, label: l.label }));

  return (
    <InlinePicker
      display={<span style={{ color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{currentLabel || "—"}</span>}
      options={options}
      onSelect={async (opt) => {
        const label = allLabels.find((l) => l.id === opt.id);
        if (label) await onPick(label);
      }}
      onCreate={async (typed) => {
        const label = await ensureDetailLabel(typed);
        await onPick(label);
      }}
      placeholder="Search or create…"
    />
  );
}

function RealAttributeRow({
  row,
  allLabels,
  existingLabelIds,
  onChanged,
}: {
  row: ProductDetailRow;
  allLabels: DetailLabel[];
  existingLabelIds: Set<string>;
  onChanged?: () => void;
}) {
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
      <AttributeLabelPicker
        currentId={row.detail_label?.id ?? null}
        currentLabel={row.detail_label?.label ?? "—"}
        allLabels={allLabels}
        existingLabelIds={existingLabelIds}
        onPick={async (label) => {
          const { error } = await supabase
            .from("product_details")
            .update({ detail_label_id: label.id })
            .eq("id", row.id);
          if (error) {
            toast.error(`Failed to rename: ${error.message}`);
            return;
          }
          onChanged?.();
        }}
      />
      <span style={{ color: "#0E2849" }}>
        <InlineText
          value={row.value}
          placeholder="—"
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

function VirtualAttributeRow({
  labelName,
  productId,
  sortOrder,
  onChanged,
}: {
  labelName: string;
  productId: string;
  sortOrder: number;
  onChanged?: () => void;
}) {
  return (
    <div style={{ display: "contents" }}>
      <span style={{ color: "#6B7280", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>{labelName}</span>
      <span style={{ color: "#0E2849" }}>
        <InlineText
          value=""
          placeholder="—"
          onSave={async (next) => {
            const v = next.trim();
            if (!v) return;
            const label = await ensureDetailLabel(labelName);
            const { error } = await supabase.from("product_details").insert({
              product_id: productId,
              detail_label_id: label.id,
              value: v,
              sort_order: sortOrder,
            });
            if (error) throw new Error(error.message);
            onChanged?.();
          }}
          style={{ color: "#0E2849", fontSize: 12 }}
          inputStyle={{ fontSize: 12, minWidth: 80 }}
        />
      </span>
      <span />
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
        gap: 6,
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
    <div style={{ display: "grid", gridTemplateColumns: "88px 1fr", columnGap: 12, alignItems: "baseline" }}>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6B7280", lineHeight: 1.4 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: "#0E2849", lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}
