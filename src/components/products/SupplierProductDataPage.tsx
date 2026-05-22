import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { supabase } from "@/integrations/supabase/client";
import { buildSupplierProductDataList, type Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductDataList } from "./SupplierProductDataList";
import { DraftProductCard } from "./DraftProductCard";
import {
  SupplierProductFilterBar,
  EMPTY_PRODUCT_FILTER,
  applyProductFilter,
  type ProductFilterState,
} from "./SupplierProductFilterBar";

interface CategoryRow { id: string; parent_id: string | null }

export function SupplierProductDataPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [filter, setFilter] = useState<ProductFilterState>(EMPTY_PRODUCT_FILTER);
  const [categoryParentBySubId, setCategoryParentBySubId] = useState<Map<string, string>>(new Map());
  const [autoFocusVariantForId, setAutoFocusVariantForId] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, supplier_item_number, parent_product_id, parent_name, variant_name, display_order, variant_label,
          image_url, updated_at,
          carton_pack, carton_length, carton_width, carton_height, carton_weight,
          production_days_min, production_days_max,
          subcategory:product_categories!products_subcategory_id_fkey(
            id, name, code,
            parent:product_categories!product_categories_parent_id_fkey(id, name, code)
          ),
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
          )
        `)
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
  }, [reloadKey]);

  // Cache category parent_id per subcategory_id for filter resolution.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("product_categories")
        .select("id, parent_id");
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const row of (data ?? []) as CategoryRow[]) {
        if (row.parent_id) map.set(row.id, row.parent_id);
      }
      setCategoryParentBySubId(map);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!products) return null;
    return applyProductFilter(products, filter, categoryParentBySubId);
  }, [products, filter, categoryParentBySubId]);

  const items = filtered ? buildSupplierProductDataList(filtered) : [];

  const startDraft = () => {
    setDrafts((d) => [...d, `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`]);
  };

  const discardDraft = (id: string) => setDrafts((d) => d.filter((x) => x !== id));
  const commitDraft = (id: string) => {
    discardDraft(id);
    reload();
  };

  return (
    <DesktopAppShell>
      <div style={{ padding: "32px 32px 64px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
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
            style={{
              marginLeft: "auto",
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
        </div>

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
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {drafts.map((id) => (
                <DraftProductCard
                  key={id}
                  draftId={id}
                  onCommitted={() => commitDraft(id)}
                  onDiscard={() => discardDraft(id)}
                />
              ))}
              <SupplierProductDataList
                items={items}
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
