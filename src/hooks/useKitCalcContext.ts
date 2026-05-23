/**
 * Loads routes + settings + (CalcPageProduct-shaped) component lookup
 * needed by KitPricingBlock to call computeKitCalc.
 *
 * Module-level memoization so multiple kit cards on a page share one fetch.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteInput, Settings } from "@/lib/calcEngine";
import {
  calcPageProductToKitComponent,
  type KitComponentProduct,
} from "@/lib/calcKitEngine";

interface CalcContext {
  routes: RouteInput[];
  settings: Settings;
  componentById: Map<string, KitComponentProduct>;
}

let cache: CalcContext | null = null;
let inflight: Promise<CalcContext> | null = null;
let version = 0;
const listeners = new Set<() => void>();

export function invalidateKitCalcContext() {
  cache = null;
  inflight = null;
  version++;
  listeners.forEach((l) => l());
}

function parseNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    if (v.trim() === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numFromSetting(rows: { key: string; value: string | null }[], key: string, fallback: number): number {
  const r = rows.find((x) => x.key === key);
  if (!r || r.value == null) return fallback;
  const n = parseFloat(r.value);
  return Number.isFinite(n) ? n : fallback;
}

async function load(): Promise<CalcContext> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const [prodsRes, methodsRes, routesRes, tiersRes, originsRes, destsRes, settingsRes] =
      await Promise.all([
        supabase.from("products").select(`
          id, carton_pack, carton_length, carton_width, carton_height, carton_weight,
          subcategory:product_categories!products_subcategory_id_fkey(duty_rate_pct),
          supplier:suppliers(dimension_unit, weight_unit_v2),
          origin:origins(code),
          product_decorations(
            id,
            product_decoration_bands(qty, unit_cost, setup_cost, inland_freight_usd)
          )
        `).eq("status", "live"), // ENGINE-ONLY: kits cannot cost a draft component.
        supabase.from("shipping_methods").select("id, code, name, fuel_surcharge_pct, buffer_pct, chargeable_metric, chargeable_unit"),
        supabase.from("shipping_method_routes").select("id, shipping_method_id, origin_id, destination_id, fixed_cost, lac_fixed_bbd, lac_per_cbm_bbd, include_inland_freight"),
        supabase.from("shipping_method_tiers").select("id, route_id, band_from, band_to, rate").order("band_from"),
        supabase.from("origins").select("id, code"),
        supabase.from("destinations").select("id, code"),
        supabase.from("app_settings").select("key, value"),
      ]);

    const componentById = new Map<string, KitComponentProduct>();
    for (const p of (prodsRes.data ?? []) as any[]) {
      componentById.set(p.id, calcPageProductToKitComponent(p));
    }

    const methods = methodsRes.data ?? [];
    const originRows = originsRes.data ?? [];
    const destRows = destsRes.data ?? [];
    const tierRows = tiersRes.data ?? [];
    const methodById = new Map(methods.map((m: any) => [m.id, m]));
    const originById = new Map(originRows.map((o: any) => [o.id, o]));
    const destById = new Map(destRows.map((d: any) => [d.id, d]));
    const methodSortRank = (code: string) => (code.toUpperCase() === "OCEAN" ? 2 : 1);

    const routes: RouteInput[] = (routesRes.data ?? [])
      .map((r: any): RouteInput | null => {
        const m: any = methodById.get(r.shipping_method_id);
        const o: any = originById.get(r.origin_id);
        const d: any = destById.get(r.destination_id);
        if (!m || !o || !d) return null;
        const tiers = tierRows
          .filter((t: any) => t.route_id === r.id)
          .map((t: any) => ({
            from: parseNum(t.band_from) ?? 0,
            to: t.band_to == null ? null : parseNum(t.band_to),
            rateUsd: parseNum(t.rate),
          }));
        return {
          id: r.id,
          code: `${m.code}-${o.code}-${d.code}`,
          methodCode: m.code,
          chargeableMetric: (m.chargeable_metric ?? "CHARGEABLE_WEIGHT") as RouteInput["chargeableMetric"],
          chargeableUnit: m.chargeable_unit ?? "lbs",
          origin: o.code,
          destination: d.code,
          baseFeeUsd: parseNum(r.fixed_cost),
          fuelPct: (parseNum(m.fuel_surcharge_pct) ?? 0) / 100,
          bufferPct: (parseNum(m.buffer_pct) ?? 0) / 100,
          lacFixedBbd: parseNum(r.lac_fixed_bbd) ?? 0,
          lacPerCbmBbd: parseNum(r.lac_per_cbm_bbd) ?? 0,
          includeInlandFreight: r.include_inland_freight === true,
          tiers,
          sortOrder: methodSortRank(m.code) * 1000,
        };
      })
      .filter((x): x is RouteInput => x !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
      .map((r, i) => ({ ...r, sortOrder: i }));

    const s = settingsRes.data ?? [];
    const settings: Settings = {
      fxBbdPerUsdBase: numFromSetting(s, "fx_rate_usd_bbd", 2.02768),
      fxFeePct: numFromSetting(s, "fx_fee_pct", 2.0) / 100,
      customsMultiplier: numFromSetting(s, "customs_multiplier", 2.0),
      dvf: numFromSetting(s, "dvf", 1.0),
      kgToLbs: numFromSetting(s, "conversions_kg_to_lbs", 2.20462),
      cbmDivisor: numFromSetting(s, "conversions_cbm_divisor", 1_000_000),
      volumetricDivisor: numFromSetting(s, "conversions_volumetric_divisor", 200),
      inToCm: numFromSetting(s, "conversions_in_to_cm", 2.54),
    };

    cache = { routes, settings, componentById };
    inflight = null;
    return cache;
  })();
  return inflight;
}

export function useKitCalcContext(): CalcContext | null {
  const [ctx, setCtx] = useState<CalcContext | null>(cache);
  useEffect(() => {
    let cancelled = false;
    if (!cache) {
      load().then((c) => {
        if (!cancelled) setCtx(c);
      });
    } else {
      setCtx(cache);
    }
    const onInvalidate = () => {
      setCtx(null);
      load().then((c) => {
        if (!cancelled) setCtx(c);
      });
    };
    listeners.add(onInvalidate);
    return () => {
      cancelled = true;
      listeners.delete(onInvalidate);
    };
  }, []);
  return ctx;
}
