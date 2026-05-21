import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DesktopAppShell } from "@/components/leads/DesktopAppShell";
import { supabase } from "@/integrations/supabase/client";
import { buildProductsList, type Product } from "./helpers/buildProductsList";
import { ProductsList } from "./ProductsList";

export function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id, name, supplier_item_number, parent_product_id, display_order, variant_label,
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
  }, []);

  const items = products ? buildProductsList(products) : [];

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
            Products
          </h1>
        </div>

        {error && (
          <div style={{ color: "hsl(var(--destructive))", marginBottom: 16, fontSize: 13 }}>
            Failed to load products: {error}
          </div>
        )}

        <div style={{ overflowX: "auto", paddingBottom: 16 }}>
          {products === null ? (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>Loading…</div>
          ) : (
            <ProductsList items={items} />
          )}
        </div>
      </div>
    </DesktopAppShell>
  );
}
