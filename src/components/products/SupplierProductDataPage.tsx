import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { supabase } from "@/integrations/supabase/client";
import { buildSupplierProductDataList, type Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductDataList } from "./SupplierProductDataList";
import { DraftProductCard } from "./DraftProductCard";
import { DraftKitCard } from "./DraftKitCard";
import {
  SupplierProductFilterBar,
  EMPTY_PRODUCT_FILTER,
  applyProductFilter,
  type ProductFilterState,
} from "./SupplierProductFilterBar";

interface CategoryRow { id: string; name: string; code: string | null; parent_id: string | null }

export interface CategoryMeta { name: string; code: string | null; parentId: string | null }

export interface PickerSupplier { id: string; name: string; code: string | null; unit_system: "metric" | "imperial" | null }
export interface PickerOrigin { id: string; name: string }

export function SupplierProductDataPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [kitDrafts, setKitDrafts] = useState<string[]>([]);
  const [filter, setFilter] = useState<ProductFilterState>(EMPTY_PRODUCT_FILTER);
  const [categoryById, setCategoryById] = useState<Map<string, CategoryMeta>>(new Map());
  const [allCategories, setAllCategories] = useState<CategoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<PickerSupplier[]>([]);
  const [origins, setOrigins] = useState<PickerOrigin[]>([]);
  const [autoFocusVariantForId, setAutoFocusVariantForId] = useState<string | null>(null);

  // Page SCOPE: one supplier at a time. Default to first alphabetical when
  // suppliers load. Internal users can switch freely; future supplier-login
  // can pin this (just remove the selector / disable changes).
  // "" = All Suppliers (omits the .eq filter). Default = first alphabetical supplier.
  const ALL_SUPPLIERS = "__all__";
  const [activeSupplierId, setActiveSupplierId] = useState<string>("");
  const [supplierCounts, setSupplierCounts] = useState<Map<string, { live: number; draft: number }>>(new Map());

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Suppliers + origins for inline pickers and the scope selector.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: sup }, { data: ori }] = await Promise.all([
        supabase.from("suppliers").select("id, name, code, unit_system").order("name"),
        supabase.from("origins").select("id, name").order("name"),
      ]);
      if (cancelled) return;
      const supList = (sup ?? []) as PickerSupplier[];
      setSuppliers(supList);
      setOrigins((ori ?? []) as PickerOrigin[]);
      setActiveSupplierId((cur) => cur || (supList[0]?.id ?? ""));
    })();
    return () => { cancelled = true; };
  }, []);

  // Lightweight count query — supplier_id + status only, no row payloads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("products").select("supplier_id, status");
      if (cancelled) return;
      const map = new Map<string, { live: number; draft: number }>();
      for (const r of (data ?? []) as { supplier_id: string; status: string | null }[]) {
        const k = r.supplier_id;
        if (!k) continue;
        const entry = map.get(k) ?? { live: 0, draft: 0 };
        if ((r.status ?? "live") === "draft") entry.draft += 1;
        else entry.live += 1;
        map.set(k, entry);
      }
      setSupplierCounts(map);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const totalCounts = useMemo(() => {
    let live = 0, draft = 0;
    for (const v of supplierCounts.values()) { live += v.live; draft += v.draft; }
    return { live, draft };
  }, [supplierCounts]);

  const fmtCount = (live: number, draft: number) =>
    draft > 0 ? `${live} · ${draft} draft` : `${live}`;

  const isAllMode = activeSupplierId === ALL_SUPPLIERS;
  const canAdd = !!activeSupplierId && !isAllMode;

  // Products are SCOPED at the query layer to the active supplier.
  // .eq("supplier_id", activeSupplierId) is a real query parameter — not a
  // post-fetch filter — so a future RLS policy attaches without a rewrite.
  useEffect(() => {
    if (!activeSupplierId) {
      setProducts(null);
      return;
    }
    let cancelled = false;
    (async () => {
      let query = supabase
        .from("products")
        .select(`
          id, name, supplier_item_number, primary_item_number, status, parent_product_id, parent_name, variant_name, display_order, variant_label,
          image_url, updated_at, product_kind,
          carton_pack, carton_length, carton_width, carton_height, carton_weight,
          production_days_min, production_days_max,
          subcategory:product_categories!products_subcategory_id_fkey(id, name, code),
          supplier:suppliers(id, name, code, unit_system, weight_unit, volume_unit),
          origin:origins(id, name),
          product_details(
            id, value, sort_order,
            detail_label:detail_labels(id, label)
          ),
          product_decorations(
            id, notes, sort_order, ref_image_url,
            method_detail:method_details(
              id, detail,
              method:decoration_methods(id, name)
            ),
            product_decoration_bands(id, qty, unit_cost, setup_cost, inland_freight_usd)
          ),
          product_includes!product_includes_product_id_fkey(id, quantity, description, sort_order),
          kit_components:product_kit_components!product_kit_components_kit_product_id_fkey(
            id, quantity, decoration_id, sort_order,
            component:products!product_kit_components_component_product_id_fkey(
              id, name, supplier_item_number, variant_name, variant_label, product_kind, carton_pack,
              product_decorations(
                id, sort_order, notes, ref_image_url,
                method_detail:method_details(
                  id, detail,
                  method:decoration_methods(id, name, code)
                ),
                product_decoration_bands(id, qty, unit_cost, setup_cost, inland_freight_usd)
              )
            )
          )
        `);
      // Stage-2 scope: real supplier → .eq; All Suppliers → omit (RLS-ready).
      if (!isAllMode) {
        query = query.eq("supplier_id", activeSupplierId);
      }
      const { data, error } = await query
        .order("display_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });


      if (cancelled) return;
      if (error) {
        setError(error.message);
        setProducts([]);
        return;
      }
      setProducts((data ?? []) as unknown as Product[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, activeSupplierId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, name, code, parent_id");
      if (cancelled) return;
      const rows = (data ?? []) as CategoryRow[];
      const map = new Map<string, CategoryMeta>();
      for (const row of rows) {
        map.set(row.id, { name: row.name, code: row.code, parentId: row.parent_id });
      }
      setCategoryById(map);
      setAllCategories(rows);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  const categoryParentBySubId = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, meta] of categoryById) {
      if (meta.parentId) m.set(id, meta.parentId);
    }
    return m;
  }, [categoryById]);

  const filtered = useMemo(() => {
    if (!products) return null;
    return applyProductFilter(products, filter, categoryParentBySubId);
  }, [products, filter, categoryParentBySubId]);

  const items = filtered ? buildSupplierProductDataList(filtered) : [];

  const startDraft = () => {
    setDrafts((d) => [...d, `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`]);
  };
  const startKitDraft = () => {
    setKitDrafts((d) => [...d, `kit-draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`]);
  };

  const discardDraft = (id: string) => setDrafts((d) => d.filter((x) => x !== id));
  const commitDraft = (id: string) => {
    discardDraft(id);
    reload();
  };
  const discardKitDraft = (id: string) => setKitDrafts((d) => d.filter((x) => x !== id));
  const commitKitDraft = (id: string) => {
    discardKitDraft(id);
    reload();
  };

  // Counts strip: how the active supplier's items spread across categories.
  // Driven by the loaded (already supplier-scoped) products array.
  const countsByCategory = useMemo(() => {
    const map = new Map<
      string,
      { name: string; total: number; draft: number; subs: Map<string, { name: string; total: number; draft: number }> }
    >();
    if (!products) return map;
    for (const p of products) {
      const subId = p.subcategory?.id;
      if (!subId) continue;
      const subMeta = categoryById.get(subId);
      const parentId = subMeta?.parentId ?? subId; // fallback: sub w/o parent
      const parentMeta = categoryById.get(parentId);
      const isDraft = (p.status ?? "live") === "draft";
      let cat = map.get(parentId);
      if (!cat) {
        cat = {
          name: parentMeta?.name ?? subMeta?.name ?? "Uncategorised",
          total: 0,
          draft: 0,
          subs: new Map(),
        };
        map.set(parentId, cat);
      }
      cat.total += 1;
      if (isDraft) cat.draft += 1;
      let sub = cat.subs.get(subId);
      if (!sub) {
        sub = { name: subMeta?.name ?? p.subcategory?.name ?? "—", total: 0, draft: 0 };
        cat.subs.set(subId, sub);
      }
      sub.total += 1;
      if (isDraft) sub.draft += 1;
    }
    return map;
  }, [products, categoryById]);

  const kitsCanBeAdded = (products ?? []).some((p) => (p.product_kind ?? "single") === "single");

  return (
    <DesktopAppShell>
      <div style={{ padding: "32px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button
            onClick={() => navigate("/")}
            aria-label="Back"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "0.5px solid hsl(var(--border))",
              background: "transparent",
              color: "hsl(var(--foreground))",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="font-display" style={{ fontSize: 32, color: "hsl(var(--brand-navy))", margin: 0 }}>
            Supplier Product Data
          </h1>
          <button
            onClick={startDraft}
            disabled={!activeSupplierId}
            style={{
              marginLeft: "auto",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: activeSupplierId ? "hsl(var(--brand-orange))" : "#E5E7EB",
              color: activeSupplierId ? "#fff" : "#9CA3AF",
              fontSize: 13,
              fontWeight: 600,
              cursor: activeSupplierId ? "pointer" : "not-allowed",
            }}
          >
            <Plus size={15} /> Add product
          </button>
          <button
            onClick={startKitDraft}
            disabled={!activeSupplierId || !kitsCanBeAdded}
            title={!kitsCanBeAdded ? "Add at least one product before creating a kit" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: activeSupplierId && kitsCanBeAdded ? "hsl(var(--brand-orange))" : "#E5E7EB",
              color: activeSupplierId && kitsCanBeAdded ? "#fff" : "#9CA3AF",
              fontSize: 13,
              fontWeight: 600,
              cursor: activeSupplierId && kitsCanBeAdded ? "pointer" : "not-allowed",
            }}
          >
            <Plus size={15} /> Add Kit
          </button>
        </div>

        {/* Supplier SCOPE selector — page shows ONE supplier at a time. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            background: "#FFFFFF",
            border: "0.5px solid #E5E7EB",
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <label
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#6B7280",
            }}
          >
            Supplier
          </label>
          <select
            value={activeSupplierId}
            onChange={(e) => {
              setActiveSupplierId(e.target.value);
              setFilter(EMPTY_PRODUCT_FILTER);
            }}
            style={{
              border: "0.5px solid #D1D5DB",
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 13,
              fontWeight: 500,
              color: "hsl(var(--brand-navy))",
              background: "#FFFFFF",
              fontFamily: "inherit",
              minWidth: 220,
            }}
          >
            {suppliers.length === 0 && <option value="">Loading…</option>}
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {products && (
            <span style={{ marginLeft: "auto", fontSize: 12, color: "#6B7280" }}>
              {products.length} {products.length === 1 ? "item" : "items"}
              {(() => {
                const draftCount = products.filter((p) => (p.status ?? "live") === "draft").length;
                return draftCount > 0 ? ` (${draftCount} draft)` : "";
              })()}
            </span>
          )}
        </div>

        {/* Live category / subcategory counts — the audit tool. */}
        {products && products.length > 0 && (
          <CategoryCountsStrip
            countsByCategory={countsByCategory}
            activeSubcategoryId={filter.subcategoryId}
            onPickSubcategory={(catId, subId) =>
              setFilter((f) => ({
                ...f,
                categoryId: f.subcategoryId === subId ? "" : catId,
                subcategoryId: f.subcategoryId === subId ? "" : subId,
              }))
            }
          />
        )}

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load supplier product data: {error}
          </div>
        )}

        {products && (
          <SupplierProductFilterBar value={filter} onChange={setFilter} products={products} />
        )}

        <div style={{ paddingBottom: 16 }}>
          {products === null ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : products.length === 0 && drafts.length === 0 && kitDrafts.length === 0 ? (
            <div
              style={{
                padding: "48px 24px",
                background: "#FFFFFF",
                border: "0.5px dashed #D1D5DB",
                borderRadius: 12,
                textAlign: "center",
                color: "#6B7280",
                fontSize: 13,
              }}
            >
              <div style={{ marginBottom: 12 }}>
                No products yet for this supplier.
              </div>
              <div style={{ display: "inline-flex", gap: 8 }}>
                <button
                  onClick={startDraft}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "hsl(var(--brand-orange))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <Plus size={15} /> Add product
                </button>
                <button
                  onClick={startKitDraft}
                  disabled={!kitsCanBeAdded}
                  title={!kitsCanBeAdded ? "Add at least one product before creating a kit" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "0.5px solid #D1D5DB",
                    background: "#FFFFFF",
                    color: kitsCanBeAdded ? "hsl(var(--brand-navy))" : "#9CA3AF",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: kitsCanBeAdded ? "pointer" : "not-allowed",
                  }}
                >
                  <Plus size={15} /> Add Kit
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {kitDrafts.map((id) => (
                <DraftKitCard
                  key={id}
                  draftId={id}
                  presetSupplierId={activeSupplierId}
                  allProducts={products ?? []}
                  onCommitted={() => commitKitDraft(id)}
                  onDiscard={() => discardKitDraft(id)}
                />
              ))}
              {drafts.map((id) => (
                <DraftProductCard
                  key={id}
                  draftId={id}
                  presetSupplierId={activeSupplierId}
                  onCommitted={() => commitDraft(id)}
                  onDiscard={() => discardDraft(id)}
                />
              ))}
              <SupplierProductDataList
                items={items}
                categoryById={categoryById}
                allCategories={allCategories}
                suppliers={suppliers}
                origins={origins}
                allProducts={products ?? []}
                autoFocusVariantForId={autoFocusVariantForId}
                onChanged={reload}
                onDuplicated={(newId) => setAutoFocusVariantForId(newId)}
              />
            </div>
          )}
        </div>
      </div>
    </DesktopAppShell>
  );
}

function CategoryCountsStrip({
  countsByCategory,
  activeSubcategoryId,
  onPickSubcategory,
}: {
  countsByCategory: Map<
    string,
    { name: string; total: number; draft: number; subs: Map<string, { name: string; total: number; draft: number }> }
  >;
  activeSubcategoryId: string;
  onPickSubcategory: (categoryId: string, subcategoryId: string) => void;
}) {
  const cats = [...countsByCategory.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
  if (cats.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        padding: "10px 16px",
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        marginBottom: 12,
        fontSize: 12,
        color: "#0E2849",
      }}
      aria-label="Catalogue spread by category"
    >
      {cats.map(([catId, cat]) => {
        const subs = [...cat.subs.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));
        return (
          <div key={catId} style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, color: "hsl(var(--brand-navy))" }}>
              {cat.name}
            </span>
            <span style={{ color: "#6B7280" }}>
              {cat.total}
              {cat.draft > 0 ? ` (${cat.draft} draft)` : ""}
            </span>
            {subs.length > 0 && <span style={{ color: "#D1D5DB" }}>·</span>}
            {subs.map(([subId, sub], i) => {
              const isActive = activeSubcategoryId === subId;
              return (
                <button
                  key={subId}
                  type="button"
                  onClick={() => onPickSubcategory(catId, subId)}
                  style={{
                    background: isActive ? "hsl(var(--brand-orange))" : "transparent",
                    color: isActive ? "#fff" : "#0E2849",
                    border: "0.5px solid",
                    borderColor: isActive ? "hsl(var(--brand-orange))" : "#E5E7EB",
                    borderRadius: 999,
                    padding: "2px 9px",
                    fontSize: 11,
                    cursor: "pointer",
                    marginRight: i === subs.length - 1 ? 0 : 0,
                  }}
                  title={isActive ? "Click to clear filter" : `Filter to ${sub.name}`}
                >
                  {sub.name} {sub.total}
                  {sub.draft > 0 ? ` (${sub.draft}d)` : ""}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
