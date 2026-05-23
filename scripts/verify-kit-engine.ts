/**
 * Live verification script for the kit-engine wrapper.
 *  1. Regression-checks SFG-AGU LDP @ qty 250 on OCEAN-CHINA-BB and DHL-CHINA-BB
 *     (must equal 2,634.74 and 7,046.22).
 *  2. Costs a synthetic kit = 1× SFG-AGU + 1× SFG-3-V2 (no decoration) at qty 50,
 *     reports component costs and kit sum.
 *  3. Forces SFG-3-V2 carton_weight = NULL → confirms incomplete propagation.
 *
 * Run with:
 *   tsx scripts/verify-kit-engine.ts
 */
import { createClient } from "@supabase/supabase-js";
import {
  computeProductCalc,
  type ProductInput,
  type RouteInput,
  type Settings,
} from "../src/lib/calcEngine";
import {
  calcPageProductToKitComponent,
  computeKitCalc,
  type KitComponentLine,
} from "../src/lib/calcKitEngine";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function pn(v: any): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadAll() {
  const [prodsR, methodsR, routesR, tiersR, originsR, destsR, settingsR] = await Promise.all([
    supabase.from("products").select(`
      id, name, supplier_item_number, product_kind,
      carton_pack, carton_length, carton_width, carton_height, carton_weight,
      subcategory:product_categories!products_subcategory_id_fkey(id, name, duty_rate_pct),
      supplier:suppliers(id, code, dimension_unit, weight_unit_v2),
      origin:origins(id, code, name),
      product_decorations(
        id, sort_order,
        product_decoration_bands(id, qty, unit_cost, setup_cost, inland_freight_usd)
      )
    `),
    supabase.from("shipping_methods").select("id, code, fuel_surcharge_pct, buffer_pct, chargeable_metric, chargeable_unit"),
    supabase.from("shipping_method_routes").select("id, shipping_method_id, origin_id, destination_id, fixed_cost, lac_fixed_bbd, lac_per_cbm_bbd, include_inland_freight"),
    supabase.from("shipping_method_tiers").select("id, route_id, band_from, band_to, rate"),
    supabase.from("origins").select("id, code"),
    supabase.from("destinations").select("id, code"),
    supabase.from("app_settings").select("key, value"),
  ]);
  if (prodsR.error || methodsR.error || routesR.error || tiersR.error || originsR.error || destsR.error || settingsR.error) {
    throw new Error("load failed");
  }
  const methodById = new Map(methodsR.data!.map((m: any) => [m.id, m]));
  const oById = new Map(originsR.data!.map((o: any) => [o.id, o]));
  const dById = new Map(destsR.data!.map((d: any) => [d.id, d]));

  const routes: RouteInput[] = routesR.data!.map((r: any, i: number) => {
    const m: any = methodById.get(r.shipping_method_id);
    const o: any = oById.get(r.origin_id);
    const d: any = dById.get(r.destination_id);
    if (!m || !o || !d) return null as any;
    const tiers = tiersR.data!.filter((t: any) => t.route_id === r.id).map((t: any) => ({
      from: pn(t.band_from) ?? 0,
      to: t.band_to == null ? null : pn(t.band_to),
      rateUsd: pn(t.rate),
    }));
    return {
      id: r.id,
      code: `${m.code}-${o.code}-${d.code}`,
      methodCode: m.code,
      chargeableMetric: m.chargeable_metric ?? "CHARGEABLE_WEIGHT",
      chargeableUnit: m.chargeable_unit ?? "lbs",
      origin: o.code,
      destination: d.code,
      baseFeeUsd: pn(r.fixed_cost),
      fuelPct: (pn(m.fuel_surcharge_pct) ?? 0) / 100,
      bufferPct: (pn(m.buffer_pct) ?? 0) / 100,
      lacFixedBbd: pn(r.lac_fixed_bbd) ?? 0,
      lacPerCbmBbd: pn(r.lac_per_cbm_bbd) ?? 0,
      includeInlandFreight: r.include_inland_freight === true,
      tiers,
      sortOrder: i,
    } as RouteInput;
  }).filter(Boolean);

  const sget = (k: string, fb: number) => {
    const r = settingsR.data!.find((x: any) => x.key === k);
    return r?.value ? parseFloat(r.value) : fb;
  };
  const settings: Settings = {
    fxBbdPerUsdBase: sget("fx_rate_usd_bbd", 2.02768),
    fxFeePct: sget("fx_fee_pct", 2) / 100,
    customsMultiplier: sget("customs_multiplier", 2),
    dvf: sget("dvf", 1),
    kgToLbs: sget("conversions_kg_to_lbs", 2.20462),
    cbmDivisor: sget("conversions_cbm_divisor", 1_000_000),
    volumetricDivisor: sget("conversions_volumetric_divisor", 200),
    inToCm: sget("conversions_in_to_cm", 2.54),
  };
  return { products: prodsR.data!, routes, settings };
}

function productToInput(p: any): ProductInput | null {
  if (!p.origin?.code) return null;
  const tiers: any[] = [];
  const seen = new Set<number>();
  for (const d of p.product_decorations ?? []) {
    for (const b of d.product_decoration_bands ?? []) {
      if (seen.has(b.qty)) continue;
      seen.add(b.qty);
      tiers.push({
        qty: Number(b.qty),
        unitUsd: pn(b.unit_cost) ?? 0,
        setupUsd: pn(b.setup_cost) ?? 0,
        inlandFreightUsd: pn(b.inland_freight_usd),
      });
    }
  }
  tiers.sort((a, b) => a.qty - b.qty);
  if (!tiers.length || p.carton_pack == null || p.carton_length == null || p.carton_width == null || p.carton_height == null || p.carton_weight == null) return null;
  const dr = pn(p.subcategory?.duty_rate_pct);
  return {
    id: p.id,
    origin: p.origin.code,
    pcsPerCtn: Number(p.carton_pack),
    ctnLengthRaw: Number(p.carton_length),
    ctnWidthRaw: Number(p.carton_width),
    ctnHeightRaw: Number(p.carton_height),
    wtPerCtnRaw: Number(p.carton_weight),
    dimensionUnit: (p.supplier?.dimension_unit ?? "cm") as any,
    weightUnit: (p.supplier?.weight_unit_v2 ?? "kg") as any,
    dutyRate: dr == null ? null : dr / 100,
    pricingTiers: tiers,
  };
}

(async () => {
  const { products, routes, settings } = await loadAll();
  const sfg = products.find((p: any) => p.supplier_item_number === "SFG-AGU");
  const v2 = products.find((p: any) => p.supplier_item_number === "SFG-3-V2");
  if (!sfg || !v2) throw new Error("fixtures missing");

  // ───────── 1. Regression: SFG-AGU LDP @ qty 250 ─────────
  const sfgInput = productToInput(sfg)!;
  const sfgCalc = computeProductCalc(sfgInput, routes, settings);
  const row250 = sfgCalc.rows.find((r) => r.spec.qty === 250)!;
  const oceanRoute = routes.find((r) => r.code === "OCEAN-CHINA-BB")!;
  const dhlRoute = routes.find((r) => r.code === "DHL-CHINA-BB")!;
  const ocean250 = row250.bbOutputs[oceanRoute.id];
  const dhl250 = row250.bbOutputs[dhlRoute.id];
  console.log("REGRESSION SFG-AGU @ qty 250:");
  if (ocean250.active) console.log(`  OCEAN-CHINA-BB LDP = BBD ${ocean250.ldpBbd!.amount.toFixed(2)} (expect 2634.74)`);
  if (dhl250.active)  console.log(`  DHL-CHINA-BB   LDP = BBD ${dhl250.ldpBbd!.amount.toFixed(2)} (expect 7046.22)`);

  // ───────── 2. Kit = 1× SFG-AGU + 1× SFG-3-V2 (decoration NULL) at Q=50 ─────────
  const kitLines: KitComponentLine[] = [
    { id: "L1", component: calcPageProductToKitComponent(sfg as any), quantity: 1, decoration_id: null, sort_order: 0 },
    { id: "L2", component: calcPageProductToKitComponent(v2 as any),  quantity: 1, decoration_id: null, sort_order: 1 },
  ];
  const Q = 50;
  const kitCalc = computeKitCalc("KIT-TEST", kitLines, [Q], routes, settings);

  // Component costs at effectiveQty=50 individually — use the SAME wrapper helper
  // so both paths consume identical synthetic single-tier inputs (apples-to-apples).
  const { computeComponentCalcAt } = await import("../src/lib/calcKitEngine");
  const sfgAt50 = computeComponentCalcAt(calcPageProductToKitComponent(sfg as any), null, 50, routes, settings)!;
  const v2At50  = computeComponentCalcAt(calcPageProductToKitComponent(v2  as any), null, 50, routes, settings)!;


  const kitRow = kitCalc.rows[0];
  const oceanK = kitRow.bbOutputs[oceanRoute.id];
  const sfgOceanCell = sfgAt50.rows[0].bbOutputs[oceanRoute.id];
  const v2OceanCell = v2At50.rows[0].bbOutputs[oceanRoute.id];
  console.log(`\nKIT (1×SFG-AGU + 1×SFG-3-V2, no deco) @ Q=${Q} on OCEAN-CHINA-BB:`);
  console.log(`  complete=${kitRow.complete}`);
  if (sfgOceanCell.active) console.log(`  component SFG-AGU LDP   = BBD ${sfgOceanCell.ldpBbd?.amount.toFixed(2) ?? "—"}`);
  if (v2OceanCell.active)  console.log(`  component SFG-3-V2 LDP  = BBD ${v2OceanCell.ldpBbd?.amount.toFixed(2) ?? "—"}`);
  if (oceanK.active) {
    console.log(`  KIT SUMMED LDP          = BBD ${oceanK.ldpBbd.toFixed(2)}`);
    if (sfgOceanCell.active && v2OceanCell.active && sfgOceanCell.ldpBbd && v2OceanCell.ldpBbd) {
      const expected = sfgOceanCell.ldpBbd.amount + v2OceanCell.ldpBbd.amount;
      console.log(`  EXPECTED A+B            = BBD ${expected.toFixed(2)}   match=${Math.abs(expected - oceanK.ldpBbd) < 0.01}`);
    }
  } else {
    console.log(`  KIT INACTIVE: ${(oceanK as any).reason}`);
  }

  // ───────── 3. Incomplete propagation: blank carton on V2 ─────────
  const v2Broken: any = { ...v2, carton_weight: null };
  const brokenLines: KitComponentLine[] = [
    { id: "L1", component: calcPageProductToKitComponent(sfg as any), quantity: 1, decoration_id: null, sort_order: 0 },
    { id: "L2", component: calcPageProductToKitComponent(v2Broken),   quantity: 1, decoration_id: null, sort_order: 1 },
  ];
  const brokenCalc = computeKitCalc("KIT-BROKEN", brokenLines, [Q], routes, settings);
  const brokenRow = brokenCalc.rows[0];
  const brokenOcean = brokenRow.bbOutputs[oceanRoute.id];
  console.log(`\nINCOMPLETE CHECK (V2 carton_weight=NULL):`);
  console.log(`  kit complete = ${brokenRow.complete}`);
  console.log(`  kit fobUsd   = ${brokenRow.fobUsd}`);
  console.log(`  ocean active = ${brokenOcean.active}`);
  if (!brokenOcean.active) {
    console.log(`  ocean reason = ${brokenOcean.reason}`);
    console.log(`  incomplete components = ${brokenOcean.incompleteComponents.join(",")}`);
  }
})();
