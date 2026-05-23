/**
 * Inline DRAFT KIT card. A kit is created here as a NEW product (never via
 * conversion). All state is LOCAL until Save; on Save we insert the kit's
 * `products` row (product_kind='kit'), then its product_kit_components and
 * product_kit_tiers rows. Discard writes nothing.
 *
 * Selecting components creates only product_kit_components reference rows —
 * no component product is ever modified by this flow.
 *
 * Identity logic (canSave, composePrimaryItemNumber, nextSequenceFor,
 * originLetter) mirrors DraftProductCard.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Save, ImageOff, Plus, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useMasterData } from "@/hooks/useMasterData";
import { composeDraftIdentity, isDraftIdentityBaseValid } from "@/lib/draftIdentity";
import { originLetterFromCode } from "@/lib/originLetter";
import { InlineText } from "@/components/inline/InlineText";
import { InlineNumber } from "@/components/inline/InlineNumber";
import { InlinePicker } from "@/components/inline/InlinePicker";
import { SHEET_GRID_TEMPLATE, SHEET_COL_GAP, SHEET_ROW_PADDING } from "./helpers/sheetGrid";
import type { Product, ProductDecoration } from "./helpers/buildSupplierProductDataList";

interface Category {
  id: string;
  name: string;
  code: string | null;
  parent_id: string | null;
}

interface DraftKitCardProps {
  draftId: string;
  allProducts: Product[];
  onCommitted: () => void;
  onDiscard: () => void;
}

interface DraftComponent {
  tempId: string;
  componentId: string | null;
  quantity: number;
  decorationId: string | null;
}

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

const HEADER_STYLE: React.CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#6B7280",
  marginBottom: 8,
  fontWeight: 600,
  lineHeight: 1.2,
};

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

function isPrintMethod(d: ProductDecoration): boolean {
  const name = (d.method_detail?.method?.name ?? "").toLowerCase();
  return name !== "no decoration" && name !== "";
}

function eligibleAsComponent(p: Product): boolean {
  if ((p.product_kind ?? "single") !== "single") return false;
  const printCount = (p.product_decorations ?? []).filter(isPrintMethod).length;
  return printCount <= 1;
}

function decorationLabel(d: ProductDecoration | null | undefined): string {
  if (!d) return "—";
  const m = d.method_detail?.method?.name?.trim() ?? "";
  const det = d.method_detail?.detail?.trim() ?? "";
  if (!m && !det) return "Decoration";
  if (!m) return det;
  if (!det) return m;
  return m.toLowerCase() === det.toLowerCase() ? det : `${m} — ${det}`;
}

export function DraftKitCard({ draftId, allProducts, onCommitted, onDiscard }: DraftKitCardProps) {
  const { suppliers, origins } = useMasterData();
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);

  // identity (mirrors DraftProductCard)
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [name, setName] = useState("");
  const [variantName, setVariantName] = useState("");
  const [itemSuffix, setItemSuffix] = useState("");

  // kit-specific local state
  const [components, setComponents] = useState<DraftComponent[]>([]);
  const [tiers, setTiers] = useState<number[]>([50, 100, 250, 500]);

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
  const subcategoriesAll = useMemo(
    () => allCategories.filter((c) => c.parent_id != null && c.code && c.code.length === 3).sort(byCategoryCode),
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

  useEffect(() => {
    if (subcategory && subcategory.parent_id && subcategory.parent_id !== categoryId) {
      setCategoryId(subcategory.parent_id);
    }
  }, [subcategory, categoryId]);

  const eligibleProducts = useMemo(
    () => allProducts.filter(eligibleAsComponent),
    [allProducts],
  );
  const eligibleById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of eligibleProducts) m.set(p.id, p);
    return m;
  }, [eligibleProducts]);

  const hasComponents = components.some((c) => c.componentId);

  // canSave — UNCHANGED logic. Identity-base (5 shared checks) lives in
  // isDraftIdentityBaseValid; kit-only extra gate is hasComponents.
  const canSave =
    isDraftIdentityBaseValid({ supplier, subcategory, name, itemSuffix }) &&
    hasComponents;

  const updateComponent = (tempId: string, patch: Partial<DraftComponent>) => {
    setComponents((cs) => cs.map((c) => (c.tempId === tempId ? { ...c, ...patch } : c)));
  };
  const removeComponent = (tempId: string) => {
    setComponents((cs) => cs.filter((c) => c.tempId !== tempId));
  };
  const addComponent = (componentId: string) => {
    setComponents((cs) => [
      ...cs,
      {
        tempId: `dc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        componentId,
        quantity: 1,
        decorationId: null,
      },
    ]);
  };

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
      const { primaryItemNumber, supplierItemNumber } = composeDraftIdentity({
        supplierCode: supplier.code,
        subcategoryCode: subcategory.code,
        originLetter,
        itemSuffix,
        existingPrimaryItemNumbers: nums,
      });

      const insert = {
        name: name.trim(),
        supplier_id: supplier.id,
        origin_id: supplier.origin_id,
        subcategory_id: subcategory.id,
        primary_item_number: primaryItemNumber,
        supplier_item_number: supplierItemNumber,
        variant_name: variantName.trim() || null,
        product_kind: "kit" as const,
        // Production days are required NOT NULL on products; default to 0 for kits
        // (effective lead time is a function of components for now).
        production_days_min: 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insErr } = await (supabase
        .from("products")
        .insert(insert as any)
        .select("id")
        .single() as any);
      if (insErr) throw new Error(insErr.message);
      const kitId = inserted.id as string;

      const compRows = components
        .filter((c) => c.componentId)
        .map((c, idx) => ({
          kit_product_id: kitId,
          component_product_id: c.componentId!,
          quantity: c.quantity,
          decoration_id: c.decorationId,
          sort_order: idx + 1,
        }));
      if (compRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: cErr } = await (supabase.from("product_kit_components").insert(compRows as any) as any);
        if (cErr) throw new Error(cErr.message);
      }

      const tierRows = tiers
        .filter((q) => Number.isFinite(q) && q > 0)
        .map((q, idx) => ({ kit_product_id: kitId, quantity: q, sort_order: idx + 1 }));
      if (tierRows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: tErr } = await (supabase.from("product_kit_tiers").insert(tierRows as any) as any);
        if (tErr) throw new Error(tErr.message);
      }

      toast.success(`Created kit ${insert.name}`);
      onCommitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create kit");
    } finally {
      setSaving(false);
    }
  };

  const supplierOptions = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));
  const code = supplier?.code ?? null;

  const missing: string[] = [];
  if (!supplier) missing.push("supplier");
  if (!subcategory) missing.push("subcategory");
  if (name.trim().length === 0) missing.push("name");
  if (itemSuffix.trim().length === 0) missing.push("item suffix");
  if (!hasComponents) missing.push("components");

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
        {/* Top-right actions */}
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
            title={canSave ? "Click Save to create this kit" : `Required: ${missing.join(", ")}`}
          >
            Kit Draft{canSave ? "" : ` — finish ${missing.join(", ")}`}
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
            <Save size={11} /> {saving ? "Saving…" : "Save kit"}
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
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <InlineText
              value={name}
              placeholder="Kit name"
              onSave={async (next) => setName(next)}
              validate={(v) => (v.trim().length === 0 ? "Name required" : null)}
              style={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2 }}
              inputStyle={{ fontSize: 17, fontWeight: 600, color: "#0E2849", lineHeight: 1.2, minWidth: 160 }}
            />
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
            >
              Kit
            </span>
          </div>

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

        {/* ── BLOCK 3: empty (kits show no per-attribute details in draft) */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontStyle: "italic" }}>
            Add attributes after saving
          </span>
          <Divider />
        </div>

        {/* ── BLOCK 4: Components (the kit-defining gesture) ─────── */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <div style={HEADER_STYLE}>Components</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {components.map((c) => {
              const comp = c.componentId ? eligibleById.get(c.componentId) ?? null : null;
              const decoOptions = (comp?.product_decorations ?? [])
                .slice()
                .sort((a, b) => {
                  const aNo = !isPrintMethod(a);
                  const bNo = !isPrintMethod(b);
                  if (aNo && !bNo) return -1;
                  if (!aNo && bNo) return 1;
                  return a.sort_order - b.sort_order;
                });
              const currentDeco = comp?.product_decorations.find((d) => d.id === c.decorationId) ?? null;

              return (
                <div key={c.tempId} style={{ display: "grid", gridTemplateColumns: "1fr 56px 14px", columnGap: 8, rowGap: 4, alignItems: "baseline", fontSize: 12, color: "#0E2849" }}>
                  <div style={{ minWidth: 0 }}>
                    <InlinePicker
                      display={
                        comp ? (
                          <span>
                            <span style={{ fontWeight: 500 }}>{comp.name}</span>
                            {comp.supplier_item_number && (
                              <span style={{ color: "#6B7280", marginLeft: 6, fontSize: 11 }}>
                                {comp.supplier_item_number}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>select component</span>
                        )
                      }
                      options={eligibleProducts.map((p) => ({
                        id: p.id,
                        label: p.name,
                        hint: p.supplier_item_number ?? undefined,
                      }))}
                      onSelect={async (opt) => updateComponent(c.tempId, { componentId: opt.id, decorationId: null })}
                      placeholder="Search component…"
                    />
                  </div>
                  <InlineNumber
                    value={c.quantity}
                    integer
                    min={1}
                    width={48}
                    onSave={async (v) => updateComponent(c.tempId, { quantity: v ?? 1 })}
                  />
                  <button
                    type="button"
                    onClick={() => removeComponent(c.tempId)}
                    aria-label="Remove component"
                    style={{
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
                  <div style={{ gridColumn: "1 / span 3" }}>
                    <DraftDecorationPicker
                      options={decoOptions}
                      currentLabel={decorationLabel(currentDeco)}
                      isNoDeco={currentDeco ? !isPrintMethod(currentDeco) : true}
                      onPick={(d) => updateComponent(c.tempId, { decorationId: d.id })}
                    />
                  </div>
                </div>
              );
            })}
            <AddDraftComponentRow
              eligibles={eligibleProducts}
              onAdd={addComponent}
            />
          </div>
          <Divider />
        </div>

        {/* ── BLOCK 5: Kit Quantity Tiers (local) ────────────────── */}
        <div style={{ minWidth: 0, position: "relative", paddingTop: 14 }}>
          <div style={HEADER_STYLE}>Kit Quantity Tiers</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tiers.map((q, idx) => (
              <div
                key={idx}
                style={{ display: "grid", gridTemplateColumns: "70px 14px", columnGap: 8, alignItems: "baseline", fontSize: 12, color: "#0E2849" }}
              >
                <InlineNumber
                  value={q}
                  integer
                  min={1}
                  width={64}
                  onSave={async (v) => {
                    if (v == null) return;
                    setTiers((ts) => ts.map((x, i) => (i === idx ? v : x)));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setTiers((ts) => ts.filter((_, i) => i !== idx))}
                  aria-label="Remove tier"
                  style={{
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
              onClick={() => {
                const max = tiers.reduce((m, x) => Math.max(m, x), 0);
                const next = max > 0 ? max * 2 : 50;
                setTiers((ts) => [...ts, next]);
              }}
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
          <p style={{ marginTop: 10, fontSize: 11, color: "#9CA3AF", lineHeight: 1.4 }}>
            Kit price per tier rolls up from components after saving.
          </p>
        </div>
      </div>
    </div>
  );
}

function DraftDecorationPicker({
  options,
  currentLabel,
  isNoDeco,
  onPick,
}: {
  options: ProductDecoration[];
  currentLabel: string;
  isNoDeco: boolean;
  onPick: (d: ProductDecoration) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group cursor-pointer rounded px-0.5 hover:bg-[#F3F4F6] transition-colors text-left inline-flex items-center gap-1"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            fontSize: 11,
            color: isNoDeco ? "#6B7280" : "#0E2849",
            fontStyle: isNoDeco ? "italic" : "normal",
          }}
        >
          <span>{currentLabel}</span>
          <ChevronDown size={11} strokeWidth={2} className="opacity-30 group-hover:opacity-100 transition-opacity shrink-0" style={{ color: "#9CA3AF" }} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command shouldFilter>
          <CommandInput placeholder="Search decoration…" />
          <CommandList>
            <CommandEmpty>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>No decorations on this component.</span>
            </CommandEmpty>
            {options.map((d) => {
              const m = d.method_detail?.method?.name?.trim() ?? "";
              const det = d.method_detail?.detail?.trim() ?? "";
              const lbl = !m ? det : !det ? m : m.toLowerCase() === det.toLowerCase() ? det : `${m} — ${det}`;
              const noDeco = !isPrintMethod(d);
              return (
                <CommandGroup key={d.id} heading={noDeco ? "No Decoration" : m || "Decoration"}>
                  <CommandItem
                    value={`${m} ${det}`}
                    onSelect={() => {
                      setOpen(false);
                      onPick(d);
                    }}
                    style={noDeco ? { fontStyle: "italic", color: "#6B7280" } : undefined}
                  >
                    {det || lbl}
                  </CommandItem>
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AddDraftComponentRow({
  eligibles,
  onAdd,
}: {
  eligibles: Product[];
  onAdd: (componentId: string) => void;
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <InlinePicker
        display={
          <span style={{ color: "#9CA3AF", fontSize: 12, fontStyle: "italic" }}>
            + Add component
          </span>
        }
        options={eligibles.map((p) => ({
          id: p.id,
          label: p.name,
          hint: p.supplier_item_number ?? undefined,
        }))}
        onSelect={async (opt) => onAdd(opt.id)}
        placeholder="Search component…"
      />
    </div>
  );
}
