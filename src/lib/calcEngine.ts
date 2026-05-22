/**
 * Calculations cost engine — the single source of truth for Alvasco
 * landed-cost math. Pure, side-effect-free, reusable by the Calculations
 * card AND (later) the Pricelist.
 *
 * No literal rates/fees/FX live here — everything comes in as arguments
 * via Settings, Routes, Product. Adding a route or changing a rate is a
 * DB-only change.
 *
 * Two USD→BBD paths that MUST NEVER MIX:
 *   - Cash/landed (CIF→LDF): uses effectiveFx = base × (1 + feePct/100)
 *   - Customs valuation (Duty): uses customsMultiplier (2.0) ONLY
 *
 * All percent inputs are decimals (0.36 == 36%). The data-loading layer
 * converts DB-stored percent points by /100 before calling the engine.
 *
 * Conservative costing: full float precision is preserved through every
 * step; rounding to 2dp happens only in the formatter at display time.
 */
import type { Money } from "./formatMoney";
import { bbd, usd } from "./formatMoney";

// ---------- Inputs ----------

export type Settings = {
  fxBbdPerUsdBase: number;        // e.g. 2.02768
  fxFeePct: number;               // decimal: 0.02 for 2%
  customsMultiplier: number;      // 2.0
  /** Declared Value Factor — multiplies the customs valuation INSIDE
   *  the duty path only (never on the cash/LDF path). */
  dvf: number;                    // e.g. 0.5
  kgToLbs: number;                // 2.20462
  cbmDivisor: number;             // 1_000_000
  volumetricDivisor: number;      // 200
  inToCm: number;                 // 2.54
};

export type PricingTier = {
  qty: number;
  unitUsd: number;
  setupUsd: number;
};

export type ProductInput = {
  id: string;
  origin: string;                 // origin.code (CHINA, USA_MIAMI, ...)
  pcsPerCtn: number;
  /** Raw carton dimensions in supplier's native unit (cm OR in). Field name
   *  preserved as `*Cm` for backwards compatibility — the canonical conversion
   *  happens inside computeProductCalc using `dimensionUnit`. */
  ctnLengthCm: number;
  ctnWidthCm: number;
  ctnHeightCm: number;
  /** Raw carton weight in supplier's native unit (kg OR lb). */
  wtPerCtnKg: number;
  /** Supplier-native units for the raw values above. Defaults to metric. */
  dimensionUnit?: "cm" | "in";
  weightUnit?: "kg" | "lb";
  dutyRate: number;               // decimal: 0.20 for 20%
  pricingTiers: PricingTier[];
  /** Optional FOB extras (FC/ITC/ED). Defaults all zero. v1 unused. */
  fobExtras?: { fcUsd?: number; itcUsd?: number; edUsd?: number };
};

export type RouteTier = {
  from: number;
  to: number | null;              // null = unbounded
  rateUsd: number;
};

export type RouteInput = {
  id: string;
  code: string;                   // 'DHL-CHINA-BB'
  methodCode: string;             // 'DHL' | 'OCEAN'
  rateUnit: "lbs" | "CBM";
  origin: string;
  destination: "BB" | "CBN" | string;
  baseFeeUsd: number;             // route.fixed_cost
  fuelPct: number;                // decimal: 0.36 for 36%
  bufferPct: number;              // decimal
  lacFixedBbd: number;
  lacPerCbmBbd: number;
  tiers: RouteTier[];
  sortOrder: number;
};

// ---------- Outputs ----------

export type RowSpec = {
  qty: number;
  cartons: number;
  totalCbm: number;
  totalWeightKg: number;
  volumetricKg: number;
  chargeableKg: number;
  productTotalUsd: Money;
  /** Per-unit FOB. */
  fobUnitUsd: Money;
};

export type TransportCell =
  | {
      active: true;
      routeId: string;
      applied: number;             // lbs OR CBM
      tier: RouteTier | null;
      tierCostUsd: number;
      transportPreUsd: number;     // base + tier
      transportUsd: Money;         // after fuel + buffer
      cifUsd: Money;
      cifUnitUsd: Money;
    }
  | { active: false; routeId: string; reason: "origin mismatch" | "no tier" };

export type BBRouteCell =
  | {
      active: true;
      routeId: string;
      lacBbd: Money;
      ldfBbd: Money;
      ldfUnitBbd: Money;
      dutyBbd: Money;
      ldpBbd: Money;
      ldpUnitBbd: Money;
    }
  | { active: false; routeId: string; reason: "origin mismatch" | "no transport" };

export type CalcRow = {
  spec: RowSpec;
  transports: Record<string, TransportCell>;     // by route.id
  bbOutputs: Record<string, BBRouteCell>;        // by route.id (BB-dest only)
};

export type CalcResult = {
  productId: string;
  effectiveFx: number;
  rows: CalcRow[];
  /** Stable ordered route IDs for column rendering. */
  routeOrder: string[];
  /** Subset of routeOrder where destination === 'BB'. */
  bbRouteOrder: string[];
};

// ---------- Engine ----------

function pickTier(tiers: RouteTier[], applied: number): RouteTier | null {
  for (const t of tiers) {
    const lo = t.from;
    const hi = t.to ?? Infinity;
    if (applied >= lo && applied < hi) return t;
  }
  // Allow inclusive upper bound on the very last band if a tier ends with null+inclusive intent
  // (defensive — current data uses [from, to) which the loop already covers).
  return null;
}

export function computeEffectiveFx(settings: Settings): number {
  return settings.fxBbdPerUsdBase * (1 + settings.fxFeePct);
}

export function sortRoutes(routes: RouteInput[]): RouteInput[] {
  return [...routes].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
}

export function computeProductCalc(
  product: ProductInput,
  routes: RouteInput[],
  settings: Settings,
): CalcResult {
  const effectiveFx = computeEffectiveFx(settings);
  const ordered = sortRoutes(routes);
  const routeOrder = ordered.map((r) => r.id);
  const bbRouteOrder = ordered.filter((r) => r.destination === "BB").map((r) => r.id);

  const fobExtras =
    (product.fobExtras?.fcUsd ?? 0) +
    (product.fobExtras?.itcUsd ?? 0) +
    (product.fobExtras?.edUsd ?? 0);

  // Normalize supplier-native carton dimensions/weight to canonical cm/kg ONCE,
  // up-front. Every downstream formula then runs on canonical units regardless
  // of whether the supplier ships in metric or imperial.
  const inToCm = settings.inToCm;
  const kgToLbs = settings.kgToLbs;
  const lenCm = product.dimensionUnit === "in" ? product.ctnLengthCm * inToCm : product.ctnLengthCm;
  const widCm = product.dimensionUnit === "in" ? product.ctnWidthCm * inToCm : product.ctnWidthCm;
  const hgtCm = product.dimensionUnit === "in" ? product.ctnHeightCm * inToCm : product.ctnHeightCm;
  const wtKg = product.weightUnit === "lb" ? product.wtPerCtnKg / kgToLbs : product.wtPerCtnKg;

  const rows: CalcRow[] = product.pricingTiers.map((tier) => {
    const cartons = tier.qty / product.pcsPerCtn;
    const totalCbm = cartons * ((lenCm * widCm * hgtCm) / settings.cbmDivisor);
    const totalWeightKg = cartons * wtKg;
    const volumetricKg = totalCbm * settings.volumetricDivisor;
    const chargeableKg = Math.max(totalWeightKg, volumetricKg);
    const productTotalAmt = tier.qty * tier.unitUsd + tier.setupUsd + fobExtras;
    const fobUnitAmt = productTotalAmt / tier.qty;

    const spec: RowSpec = {
      qty: tier.qty,
      cartons,
      totalCbm,
      totalWeightKg,
      volumetricKg,
      chargeableKg,
      productTotalUsd: usd(productTotalAmt),
      fobUnitUsd: usd(fobUnitAmt),
    };

    const transports: Record<string, TransportCell> = {};
    const bbOutputs: Record<string, BBRouteCell> = {};

    for (const route of ordered) {
      if (route.origin !== product.origin) {
        transports[route.id] = {
          active: false,
          routeId: route.id,
          reason: "origin mismatch",
        };
        if (route.destination === "BB") {
          bbOutputs[route.id] = {
            active: false,
            routeId: route.id,
            reason: "no transport",
          };
        }
        continue;
      }

      const applied =
        route.rateUnit === "lbs"
          ? chargeableKg * settings.kgToLbs
          : totalCbm;
      const matched = pickTier(route.tiers, applied);
      if (!matched) {
        transports[route.id] = { active: false, routeId: route.id, reason: "no tier" };
        if (route.destination === "BB") {
          bbOutputs[route.id] = {
            active: false,
            routeId: route.id,
            reason: "no transport",
          };
        }
        continue;
      }

      const tierCost = applied * matched.rateUsd;
      const transportPre = route.baseFeeUsd + tierCost;
      // Fuel AND buffer applied UNCONDITIONALLY for every route — a 0 is a ×1 no-op.
      const transportAmt = transportPre * (1 + route.fuelPct) * (1 + route.bufferPct);
      const cifAmt = productTotalAmt + transportAmt;

      transports[route.id] = {
        active: true,
        routeId: route.id,
        applied,
        tier: matched,
        tierCostUsd: tierCost,
        transportPreUsd: transportPre,
        transportUsd: usd(transportAmt),
        cifUsd: usd(cifAmt),
        cifUnitUsd: usd(cifAmt / tier.qty),
      };

      if (route.destination === "BB") {
        const lacAmt = route.lacFixedBbd + totalCbm * route.lacPerCbmBbd;
        // CASH path — uses effectiveFx (includes FX fee)
        const ldfAmt = cifAmt * effectiveFx + lacAmt;
        // CUSTOMS path — uses customsMultiplier × DVF ONLY (never FX, never fee)
        const dutyAmt = cifAmt * settings.customsMultiplier * settings.dvf * product.dutyRate;
        const ldpAmt = ldfAmt + dutyAmt;
        bbOutputs[route.id] = {
          active: true,
          routeId: route.id,
          lacBbd: bbd(lacAmt),
          ldfBbd: bbd(ldfAmt),
          ldfUnitBbd: bbd(ldfAmt / tier.qty),
          dutyBbd: bbd(dutyAmt),
          ldpBbd: bbd(ldpAmt),
          ldpUnitBbd: bbd(ldpAmt / tier.qty),
        };
      }
    }

    return { spec, transports, bbOutputs };
  });

  return { productId: product.id, effectiveFx, rows, routeOrder, bbRouteOrder };
}

/** Find the cheapest active BB-destination route for a row, by LDP. */
export function cheapestBbRouteForRow(row: CalcRow, bbRouteOrder: string[]): string | null {
  let best: { id: string; amt: number } | null = null;
  for (const id of bbRouteOrder) {
    const cell = row.bbOutputs[id];
    if (!cell || !cell.active) continue;
    if (best == null || cell.ldpBbd.amount < best.amt) {
      best = { id, amt: cell.ldpBbd.amount };
    }
  }
  return best?.id ?? null;
}
