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
  product_kind: "single" | "kit";

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
      inland_freight_usd: number | string | null;
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
  dvf: "dvf",
  kgToLbs: "conversions_kg_to_lbs",
  cbm: "conversions_cbm_divisor",
  vol: "conversions_volumetric_divisor",
  inToCm: "conversions_in_to_cm",
} as const;

/** Strict numeric parser for required DB fields. null/""/non-finite → null
 *  (NEVER 0). The engine treats null as "data error" so callers can never
 *  silently bill $0 from a missing rate or fee. */
function parseRequiredNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (value.trim() === "") return null;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parser for fields where 0 is a legitimate value (e.g. LAC components).
 *  Distinguishes 0 from null/unparseable — both 0 and null are returned
 *  faithfully; the caller decides whether null should warn or pass through. */
function parseNullableNumber(value: unknown): number | null {
  return parseRequiredNumber(value);
}

function numFromSetting(rows: SettingsRow[], key: string, fallback: number): number {
  const row = rows.find((r) => r.key === key);
  if (!row) {
    // eslint-disable-next-line no-console
    console.warn(`[calc settings] missing app_settings key "${key}" — falling back to ${fallback}`);
    return fallback;
  }
  if (row.value == null) {
    // eslint-disable-next-line no-console
    console.warn(`[calc settings] app_settings key "${key}" is NULL — falling back to ${fallback}`);
    return fallback;
  }
  const n = parseFloat(row.value);
  if (!Number.isFinite(n)) {
    // eslint-disable-next-line no-console
    console.warn(`[calc settings] app_settings key "${key}" non-numeric (${row.value}) — falling back to ${fallback}`);
    return fallback;
  }
  return n;
}

export interface KitComponentRow {
  id: string;
  kit_product_id: string;
  component_product_id: string;
  quantity: number;
  decoration_id: string | null;
  sort_order: number;
}

export function useCalcPageData() {
  const [products, setProducts] = useState<CalcPageProduct[] | null>(null);
  const [routes, setRoutes] = useState<RouteInput[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [kitComponents, setKitComponents] = useState<KitComponentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = () => setReloadKey((k) => k + 1);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prodsRes, methodsRes, routesRes, tiersRes, originsRes, destsRes, settingsRes, kitsRes] = await Promise.all([
        supabase.from("products").select(`
          id, name, supplier_item_number, variant_name, primary_item_number, image_url, updated_at, moq, product_kind,
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
            product_decoration_bands(id, qty, unit_cost, setup_cost, inland_freight_usd)
          )
        `).order("name", { ascending: true }),
        supabase.from("shipping_methods").select("id, code, name, fuel_surcharge_pct, buffer_pct, chargeable_metric, chargeable_unit"),
        supabase.from("shipping_method_routes").select("id, shipping_method_id, origin_id, destination_id, fixed_cost, lac_fixed_bbd, lac_per_cbm_bbd, include_inland_freight"),
        supabase.from("shipping_method_tiers").select("id, route_id, band_from, band_to, rate").order("band_from"),
        supabase.from("origins").select("id, code, name"),
        supabase.from("destinations").select("id, code"),
        supabase.from("app_settings").select("key, value"),
        supabase.from("product_kit_components").select("id, kit_product_id, component_product_id, quantity, decoration_id, sort_order").order("sort_order"),
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
      setKitComponents(((kitsRes.data ?? []) as unknown as KitComponentRow[]));


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
              from: parseRequiredNumber(t.band_from) ?? 0,
              to: t.band_to == null ? null : parseRequiredNumber(t.band_to),
              // Required: a NULL/unparseable rate must NOT collapse to 0.
              // The engine treats null as "invalid data" and refuses to bill.
              rateUsd: parseRequiredNumber(t.rate),
            }));
          // Chargeable basis comes from shipping_methods.chargeable_metric +
          // chargeable_unit — NEVER from the method code string.
          const chargeableMetric =
            (m.chargeable_metric as "ACTUAL_WEIGHT" | "VOLUMETRIC_WEIGHT" | "CHARGEABLE_WEIGHT" | "VOLUME") ?? "CHARGEABLE_WEIGHT";
          const chargeableUnit = (m.chargeable_unit as string) ?? "lbs";
          const baseFee = parseRequiredNumber(r.fixed_cost);
          const lacFixed = parseNullableNumber(r.lac_fixed_bbd);
          const lacPerCbm = parseNullableNumber(r.lac_per_cbm_bbd);
          if (lacFixed == null) {
            // eslint-disable-next-line no-console
            console.warn(`[calc routes] route ${code} has NULL lac_fixed_bbd — treating as 0; fix in DB.`);
          }
          if (lacPerCbm == null) {
            // eslint-disable-next-line no-console
            console.warn(`[calc routes] route ${code} has NULL lac_per_cbm_bbd — treating as 0; fix in DB.`);
          }
          return {
            id: r.id,
            code,
            methodCode: m.code,
            chargeableMetric,
            chargeableUnit,
            origin: o.code,
            destination: d.code,
            // baseFeeUsd can be null → engine flags route as "invalid data".
            baseFeeUsd: baseFee,
            fuelPct: (parseRequiredNumber(m.fuel_surcharge_pct) ?? 0) / 100,
            bufferPct: (parseRequiredNumber(m.buffer_pct) ?? 0) / 100,
            lacFixedBbd: lacFixed ?? 0,
            lacPerCbmBbd: lacPerCbm ?? 0,
            includeInlandFreight: r.include_inland_freight === true,
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
        dvf: numFromSetting(s, SETTINGS_KEYS.dvf, 1.0),
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
