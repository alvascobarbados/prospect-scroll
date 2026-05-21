import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { supabase } from "@/integrations/supabase/client";
import { buildSupplierProductDataList, type Product } from "./helpers/buildSupplierProductDataList";
import { SupplierProductDataList } from "./SupplierProductDataList";
import { AddProductDialog } from "./AddProductDialog";

export function SupplierProductDataPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

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
            product_decoration_bands(id, qty, unit_cost, setup_cost)
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

  const items = products ? buildSupplierProductDataList(products) : [];

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
        </div>

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load supplier product data: {error}
          </div>
        )}

        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          {products === null ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : (
            <SupplierProductDataList items={items} onChanged={reload} />
          )}
        </div>
      </div>
    </DesktopAppShell>
  );
}
