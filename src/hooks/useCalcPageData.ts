/**
 * Loads everything the Calculations page needs in one shot:
 * - products with full decoration/band/spec tree (plus subcategory duty)
 * - all shipping routes, methods, tiers, origins, destinations (the route columns)
 * - app_settings values needed by the cost engine
 *
 * Returns engine-ready Route[] and Settings so the page can call
 * computeProductCalc() directly per product.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteInput, Settings } from "@/lib/calcEngine";

export interface CalcPageProduct {
  id: string;
  name: string;
  supplier_item_number: string | null;
  variant_name: string | null;
  primary_item_number: string | null;
  image_url: string | null;
  updated_at: string;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  production_days_min: number | null;
  production_days_max: number | null;
  moq: number | null;
  subcategory: { id: string; name: string; duty_rate_pct: number | string | null } | null;
  supplier: { id: string; code: string | null; name: string; unit_system: "metric" | "imperial" | null; dimension_unit: "cm" | "in" | null; weight_unit_v2: "kg" | "lb" | null } | null;
  origin: { id: string; code: string; name: string } | null;
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

interface SettingsRow {
  key: string;
  value: string | null;
}

const SETTINGS_KEYS = {
  fxBase: "fx_rate_usd_bbd",
  fxFee: "fx_fee_pct",
  customs: "customs_multiplier",
  kgToLbs: "conversions_kg_to_lbs",
  cbm: "conversions_cbm_divisor",
  vol: "conversions_volumetric_divisor",
  inToCm: "conversions_in_to_cm",
} as const;

function numFromSetting(rows: SettingsRow[], key: string, fallback: number): number {
  const row = rows.find((r) => r.key === key);
  if (!row || row.value == null) return fallback;
  const n = parseFloat(row.value);
  return Number.isFinite(n) ? n : fallback;
}

export function useCalcPageData() {
  const [products, setProducts] = useState<CalcPageProduct[] | null>(null);
  const [routes, setRoutes] = useState<RouteInput[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prodsRes, methodsRes, routesRes, tiersRes, originsRes, destsRes, settingsRes] = await Promise.all([
        supabase.from("products").select(`
          id, name, supplier_item_number, variant_name, primary_item_number, image_url, updated_at, moq,
          carton_pack, carton_length, carton_width, carton_height, carton_weight,
          production_days_min, production_days_max,
          subcategory:product_categories!products_subcategory_id_fkey(id, name, duty_rate_pct),
          supplier:suppliers(id, code, name, unit_system, dimension_unit, weight_unit_v2),
          origin:origins(id, code, name),
          product_decorations(
            id, sort_order,
            method_detail:method_details(
              id, detail,
              method:decoration_methods(id, name)
            ),
            product_decoration_bands(id, qty, unit_cost, setup_cost)
          )
        `).order("name", { ascending: true }),
        supabase.from("shipping_methods").select("id, code, name, fuel_surcharge_pct, buffer_pct"),
        supabase.from("shipping_method_routes").select("id, shipping_method_id, origin_id, destination_id, fixed_cost, lac_fixed_bbd, lac_per_cbm_bbd"),
        supabase.from("shipping_method_tiers").select("id, route_id, band_from, band_to, rate").order("band_from"),
        supabase.from("origins").select("id, code, name"),
        supabase.from("destinations").select("id, code"),
        supabase.from("app_settings").select("key, value"),
      ]);

      if (cancelled) return;

      const firstErr =
        prodsRes.error || methodsRes.error || routesRes.error || tiersRes.error ||
        originsRes.error || destsRes.error || settingsRes.error;
      if (firstErr) {
        setError(firstErr.message);
        setProducts([]);
        return;
      }

      setProducts((prodsRes.data ?? []) as unknown as CalcPageProduct[]);

      const methods = methodsRes.data ?? [];
      const originRows = originsRes.data ?? [];
      const destRows = destsRes.data ?? [];
      const tierRows = tiersRes.data ?? [];
      const methodById = new Map(methods.map((m: any) => [m.id, m]));
      const originById = new Map(originRows.map((o: any) => [o.id, o]));
      const destById = new Map(destRows.map((d: any) => [d.id, d]));

      // Stable sort order: Courier methods (DHL etc.) before Ocean, then by route code.
      const methodSortRank = (code: string) => (code.toUpperCase() === "OCEAN" ? 2 : 1);

      const builtRoutes: RouteInput[] = (routesRes.data ?? [])
        .map((r: any) => {
          const m: any = methodById.get(r.shipping_method_id);
          const o: any = originById.get(r.origin_id);
          const d: any = destById.get(r.destination_id);
          if (!m || !o || !d) return null;
          const code = `${m.code}-${o.code}-${d.code}`;
          const tiers = tierRows
            .filter((t: any) => t.route_id === r.id)
            .map((t: any) => ({
              from: Number(t.band_from) || 0,
              to: t.band_to == null ? null : Number(t.band_to),
              rateUsd: Number(t.rate) || 0,
            }));
          // Imperial-system methods use lbs; rest CBM. Heuristic: DHL/courier=lbs, Ocean=CBM.
          // Use method code: any "OCEAN" → CBM, everything else → lbs.
          const rateUnit: "lbs" | "CBM" = m.code.toUpperCase() === "OCEAN" ? "CBM" : "lbs";
          return {
            id: r.id,
            code,
            methodCode: m.code,
            rateUnit,
            origin: o.code,
            destination: d.code,
            baseFeeUsd: Number(r.fixed_cost) || 0,
            fuelPct: (Number(m.fuel_surcharge_pct) || 0) / 100,
            bufferPct: (Number(m.buffer_pct) || 0) / 100,
            lacFixedBbd: Number(r.lac_fixed_bbd) || 0,
            lacPerCbmBbd: Number(r.lac_per_cbm_bbd) || 0,
            tiers,
            sortOrder: methodSortRank(m.code) * 1000,
          } as RouteInput;
        })
        .filter((x): x is RouteInput => x !== null)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
        // Re-stamp sortOrder to a contiguous deterministic sequence.
        .map((r, i) => ({ ...r, sortOrder: i }));

      setRoutes(builtRoutes);

      const s = settingsRes.data ?? [];
      setSettings({
        fxBbdPerUsdBase: numFromSetting(s, SETTINGS_KEYS.fxBase, 2.02768),
        fxFeePct: numFromSetting(s, SETTINGS_KEYS.fxFee, 2.0) / 100, // stored as percent points
        customsMultiplier: numFromSetting(s, SETTINGS_KEYS.customs, 2.0),
        kgToLbs: numFromSetting(s, SETTINGS_KEYS.kgToLbs, 2.20462),
        cbmDivisor: numFromSetting(s, SETTINGS_KEYS.cbm, 1_000_000),
        volumetricDivisor: numFromSetting(s, SETTINGS_KEYS.vol, 200),
        inToCm: numFromSetting(s, SETTINGS_KEYS.inToCm, 2.54),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { products, routes, settings, error, reload };
}
