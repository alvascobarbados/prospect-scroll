/**
 * Inline draft product card. Draft is LOCAL-ONLY until all required identity
 * fields are filled and the user clicks Save. Click Discard (or unmount) and
 * nothing is written to the DB. This is the only path to creating a product
 * (the modal flow has been removed).
 *
 * Required-to-commit identity fields (canSave gate — UNCHANGED):
 *   - supplier (with code + origin_id)
 *   - subcategory (with code)
 *   - name
 *   - supplier_item_number suffix
 *   - production_days_min >= 1
 *
 * After commit, optional engine-critical specs (carton pack/L/W/H/weight)
 * may still be NULL — the live card flags them with the amber "specs
 * incomplete" marker. Visual presentation here matches a saved card:
 * SHEET_GRID_TEMPLATE columns, inline editors (InlinePicker / InlineText /
 * InlineNumber), KV label/value rhythm. The pricing-engine inputs/outputs and
 * the products insert in handleSave are byte-identical to the prior version.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Save, AlertTriangle, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { composePrimaryItemNumber, nextSequenceFor } from "@/lib/productItemNumber";
import { originLetterFromCode } from "@/lib/originLetter";
import { InlineText } from "@/components/inline/InlineText";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlinePicker } from "@/components/inline/InlinePicker";
import { SHEET_GRID_TEMPLATE, SHEET_COL_GAP, SHEET_ROW_PADDING } from "./helpers/sheetGrid";

interface Subcategory {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
}
interface Category {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
}

interface DraftProductCardProps {
  draftId: string;
  onCommitted: () => void;
  onDiscard: () => void;
}

// ─── small style helpers (mirroring SupplierProductRow) ────────────────────
const KV_GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "88px 1fr",
  rowGap: 6,
  columnGap: 12,
  fontSize: 12,
  lineHeight: 1.4,
  alignItems: "baseline",
};

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
function codePillStyle(variant: "default" | "warn" = "default"): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "2px 7px",
    borderRadius: 4,
    fontWeight: 500,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    letterSpacing: "0.04em",
    fontSize: 12,
  };
  if (variant === "warn") return { ...base, background: "#FEF3E2", color: "#C2410C", cursor: "help" };
  return { ...base, background: "#E5EAF1", color: "#0E2849" };
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

// Sort comparator: by category code (asc), nulls last; ties broken by name.
function byCategoryCode(a: { code: string | null; name: string }, b: { code: string | null; name: string }) {
  const ac = a.code ?? "";
  const bc = b.code ?? "";
  if (ac && bc) {
    const cmp = ac.localeCompare(bc);
    if (cmp !== 0) return cmp;
  } else if (ac && !bc) return -1;
  else if (!ac && bc) return 1;
  return a.name.localeCompare(b.name);
}

export function DraftProductCard({ draftId, onCommitted, onDiscard }: DraftProductCardProps) {
  const { suppliers, origins } = useMasterData();
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  // local-only draft state
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [itemSuffix, setItemSuffix] = useState("");
  const [leadMin, setLeadMin] = useState<number | null>(null);
  const [leadMax, setLeadMax] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, name, code, parent_id")
        .order("name");
      if (cancelled) return;
      setAllCategories((data ?? []) as Category[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const supplier = useMemo(() => suppliers.find((s) => s.id === supplierId) ?? null, [suppliers, supplierId]);
  const supplierOrigin = useMemo(
    () => origins.find((o) => o.id === supplier?.origin_id) ?? null,
    [origins, supplier],
  );
  const parentCategories = useMemo(
    () => allCategories.filter((c) => c.parent_id == null).sort(byCategoryCode),
    [allCategories],
  );
  const subcategoriesAll = useMemo<Subcategory[]>(
    () =>
      allCategories
        .filter((c) => c.parent_id != null && c.code && c.code.length === 3)
        .sort(byCategoryCode) as Subcategory[],
    [allCategories],
  );
  const subcategoriesScoped = useMemo(
    () => (categoryId ? subcategoriesAll.filter((s) => s.parent_id === categoryId) : subcategoriesAll),
    [subcategoriesAll, categoryId],
  );

  const subcategory = useMemo(
    () => subcategoriesAll.find((s) => s.id === subcategoryId) ?? null,
    [subcategoriesAll, subcategoryId],
  );
  const category = useMemo(
    () => parentCategories.find((c) => c.id === categoryId) ?? null,
    [parentCategories, categoryId],
  );

  // Keep category in sync with chosen subcategory if user picked subcategory first.
  useEffect(() => {
    if (subcategory && subcategory.parent_id && subcategory.parent_id !== categoryId) {
      setCategoryId(subcategory.parent_id);
    }
  }, [subcategory, categoryId]);

  // canSave — UNCHANGED logic
  const canSave =
    !!supplier?.code &&
    !!supplier?.origin_id &&
    !!subcategory?.code &&
    name.trim().length > 0 &&
    itemSuffix.trim().length > 0 &&
    leadMin != null &&
    Number.isFinite(leadMin) &&
    leadMin >= 1;

  const handleSave = async () => {
    if (!canSave || saving) return;
    if (!supplier || !supplier.code || !supplier.origin_id) return toast.error("Supplier missing code or origin");
    if (!supplierOrigin) return toast.error("Origin not found");
    const originLetter = originLetterFromCode(supplierOrigin.code);
    if (!originLetter) return toast.error(`Origin ${supplierOrigin.code} has no letter mapping`);
    if (!subcategory || !subcategory.code) return toast.error("Subcategory missing code");

    setSaving(true);
    try {
      const { data: existing, error: exErr } = await supabase
        .from("products")
        .select("primary_item_number");
      if (exErr) throw new Error(exErr.message);
      const nums = (existing ?? []).map((r) => r.primary_item_number).filter(Boolean) as string[];
      const seq = nextSequenceFor(subcategory.code, nums);
      const primaryItemNumber = composePrimaryItemNumber(subcategory.code, seq, originLetter);

      const cleanSuffix = itemSuffix.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");
      const supplierItemNumber = `${supplier.code}-${cleanSuffix}`;

      const leadMinNum = leadMin as number;
      const leadMaxNum =
        leadMax != null && Number.isFinite(leadMax) && leadMax >= leadMinNum ? leadMax : null;

      const insert = {
        name: name.trim(),
        supplier_id: supplier.id,
        origin_id: supplier.origin_id,
        subcategory_id: subcategory.id,
        primary_item_number: primaryItemNumber,
        supplier_item_number: supplierItemNumber,
        variant_name: variantName.trim() || null,
        production_days_min: leadMinNum,
        production_days_max: leadMaxNum,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("products").insert(insert as any);
      if (error) throw new Error(error.message);
      toast.success(`Created ${insert.name}`);
      onCommitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSaving(false);
    }
  };

  const supplierOptions = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));
  const code = supplier?.code ?? null;

  // Missing-required hint list
  const missing: string[] = [];
  if (!supplier) missing.push("supplier");
  if (!subcategory) missing.push("subcategory");
  if (name.trim().length === 0) missing.push("name");
  if (itemSuffix.trim().length === 0) missing.push("item suffix");
  if (leadMin == null || leadMin < 1) missing.push("lead time");

  return (
    <div
      data-draft-id={draftId}
      style={{
        background: "#FFFFFF",
        border: "1px dashed #E97817",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
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
        {/* Top-right: draft chip + Save / Discard (replaces saved-card actions) */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#C2410C",
              background: "#FEF3E2",
              padding: "3px 8px",
              borderRadius: 4,
            }}
            title={
              canSave
                ? "Click Save to create this product"
                : `Required: ${missing.join(", ")}`
            }
          >
            Draft{canSave ? "" : " — finish identity to save"}
          </span>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: "0.5px solid #E5E7EB",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 11,
              color: "#6B7280",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            <X size={11} /> Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: canSave ? "#E97817" : "#E5E7EB",
              color: canSave ? "#FFFFFF" : "#9CA3AF",
              border: "none",
              borderRadius: 6,
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              cursor: canSave && !saving ? "pointer" : "not-allowed",
            }}
          >
            <Save size={11} /> {saving ? "Saving…" : "Save product"}
          </button>
        </div>

        {/* ── BLOCK 1: Image placeholder ─────────────────────────── */}
        <div style={{ minWidth: 0, position: "relative" }}>
          <div
            style={{
              width: "100%",
              aspectRatio: "1 / 1",
              background: "#F9FAFB",
              border: "1px dashed #E5E7EB",
              borderRadius: 8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            <ImageOff size={20} />
            <span>Add images after saving</span>
          </div>
          <Divider />
        </div>

        {/* ── BLOCK 2: Identity ──────────────────────────────────── */}
        <div style={{ minWidth: 0, position: "relative" }}>
          {/* Name */}
          <div style={{ minWidth: 0 }}>
            <InlineText
              value={name}
              placeholder="Product name"
              onSave={async (next) => setName(next)}
              validate={(v) => (v.trim().length === 0 ? "Name required" : null)}
              style={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2 }}
              inputStyle={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2, minWidth: 160 }}
            />
          </div>

          {/* Variant */}
          <div style={{ marginTop: 6, marginBottom: 8 }}>
            {variantName ? (
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
                  value={variantName}
                  placeholder="add variant"
                  onSave={async (next) => setVariantName(next.trim())}
                  style={{ fontSize: 12, fontWeight: 600, color: "#0E2849" }}
                  inputStyle={{ fontSize: 12, fontWeight: 600, color: "#0E2849", minWidth: 100 }}
                />
              </span>
            ) : (
              <InlineText
                value=""
                placeholder="add variant"
                onSave={async (next) => setVariantName(next.trim())}
                style={{ fontSize: 12, color: "#9CA3AF" }}
                inputStyle={{ fontSize: 12, color: "#0E2849", minWidth: 100 }}
              />
            )}
          </div>

          <div style={KV_GRID_STYLE}>
            <KvLabel>Supplier</KvLabel>
            <KvValue>
              <InlinePicker
                display={
                  supplier ? (
                    <span>{supplier.name}</span>
                  ) : (
                    <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>select supplier</span>
                  )
                }
                options={supplierOptions.map((s) => ({ id: s.id, label: s.name, hint: s.code ?? undefined }))}
                onSelect={async (opt) => setSupplierId(opt.id)}
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
                  <TooltipContent>Pick a supplier to set the prefix</TooltipContent>
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
                  onSave={async (next) => setItemSuffix(next.trim().toUpperCase())}
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
              <span style={{ color: supplierOrigin ? "#0E2849" : "#9CA3AF", fontStyle: supplierOrigin ? "normal" : "italic" }}>
                {supplierOrigin?.name ?? "—"}
              </span>
            </KvValue>

            <KvLabel>Category</KvLabel>
            <KvValue>
              <InlinePicker
                display={
                  category ? (
                    <span>{category.name}</span>
                  ) : (
                    <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>select category</span>
                  )
                }
                options={parentCategories.map((c) => ({ id: c.id, label: c.name, hint: c.code ?? undefined }))}
                onSelect={async (opt) => {
                  if (opt.id === categoryId) return;
                  setCategoryId(opt.id);
                  // If subcategory belongs to a different parent, clear it
                  if (subcategory && subcategory.parent_id !== opt.id) setSubcategoryId("");
                }}
                placeholder="Search category…"
              />
            </KvValue>

            <KvLabel>Subcategory</KvLabel>
            <KvValue>
              <InlinePicker
                display={
                  subcategory ? (
                    <span>{subcategory.name}</span>
                  ) : (
                    <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>select subcategory</span>
                  )
                }
                options={subcategoriesScoped.map((c) => ({ id: c.id, label: c.name, hint: c.code ?? undefined }))}
                onSelect={async (opt) => setSubcategoryId(opt.id)}
                placeholder="Search subcategory…"
              />
            </KvValue>
          </div>
          <Divider />
        </div>

        {/* ── BLOCK 3: Product Details (empty state) ─────────────── */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
            Add attributes after saving
          </span>
          <Divider />
        </div>

        {/* ── BLOCK 4: Packing & Production ──────────────────────── */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <div
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
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
            title="Carton pack, dimensions and weight can be filled after saving."
          >
            <AlertTriangle size={12} /> specs incomplete
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SpecRow label="Pcs / ctn">
              <span style={{ color: "#9CA3AF", fontStyle: "italic", fontSize: 12 }}>after save</span>
            </SpecRow>
            <SpecRow label="L × W × H">
              <span style={{ color: "#9CA3AF", fontStyle: "italic", fontSize: 12 }}>after save</span>
            </SpecRow>
            <SpecRow label="Weight">
              <span style={{ color: "#9CA3AF", fontStyle: "italic", fontSize: 12 }}>after save</span>
            </SpecRow>
            <SpecRow label="Lead time (d)">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <InlineNumber
                  value={leadMin}
                  integer
                  min={1}
                  nullable
                  width={42}
                  placeholder="min"
                  onSave={async (v) => setLeadMin(v)}
                />
                <span style={{ color: "#6B7280" }}>–</span>
                <InlineNumber
                  value={leadMax}
                  integer
                  min={1}
                  nullable
                  width={42}
                  placeholder="max"
                  onSave={async (v) => setLeadMax(v)}
                />
              </span>
            </SpecRow>
          </div>
          <p style={{ marginTop: 10, fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>
            Carton pack, dimensions, and weight can be filled after saving — the live
            card will flag them as incomplete until set.
          </p>
          <Divider />
        </div>

        {/* ── BLOCK 5: Pricing (empty) ───────────────────────────── */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
            Add decoration methods after saving
          </span>
        </div>
      </div>
    </div>
  );
}
