import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CalcProduct {
  id: string;
  name: string;
  supplier_item_number: string | null;
  variant_name: string | null;
  updated_at: string;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  production_days_min: number | null;
  production_days_max: number | null;
  moq: number | null;
  subcategory: { id: string; name: string } | null;
  supplier: { id: string; code: string | null; unit_system: "metric" | "imperial" | null } | null;
  origin: { id: string; name: string } | null;
  product_decorations: Array<{
    id: string;
    sort_order: number;
    method_detail: {
      id: string;
      detail: string;
      method: { id: string; name: string } | null;
    } | null;
    product_decoration_bands: Array<{
      id: string;
      qty: number;
      unit_cost: number | string;
      setup_cost: number | string;
    }>;
  }>;
}

export function useCalculationRows() {
  const [products, setProducts] = useState<CalcProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("products")
        // ENGINE-ONLY: drafts never reach the costing engine.
        .eq("status", "live")
        .select(`
          id, name, supplier_item_number, variant_name, updated_at, moq,
          carton_pack, carton_length, carton_width, carton_height, carton_weight,
          production_days_min, production_days_max,
          subcategory:product_categories!products_subcategory_id_fkey(id, name),
          supplier:suppliers(id, code, unit_system),
          origin:origins(id, name),
          product_decorations(
            id, sort_order,
            method_detail:method_details(
              id, detail,
              method:decoration_methods(id, name)
            ),
            product_decoration_bands(id, qty, unit_cost, setup_cost)
          )
        `)
        .order("name", { ascending: true });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setProducts([]);
        return;
      }
      setProducts((data ?? []) as unknown as CalcProduct[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { products, error, reload };
}
