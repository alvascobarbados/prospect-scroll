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
 *   - Customs valuation (Duty): uses customsMultiplier × DVF ONLY
 *
 * Silent-zero safety:
 *   - dutyRate=null → engine emits dutyMissing=true, NOT a 0 duty.
 *   - baseFeeUsd=null or matched tier.rateUsd=null → TransportCell is
 *     active:false with reason "invalid data", NOT a $0 transport.
 *   These guarantees live in the engine so any caller (card, pricelist)
 *   inherits the safety automatically.
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
  dvf: number;                    // e.g. 0.5 or 1.0
  kgToLbs: number;                // 2.20462
  cbmDivisor: number;             // 1_000_000
  volumetricDivisor: number;      // 200
  inToCm: number;                 // 2.54
};

export type PricingTier = {
  qty: number;
  unitUsd: number;
  setupUsd: number;
  /** Optional inland (ground) freight USD for this tier, supplier → forwarder.
   *  NULL = not entered. Only applied when the route's includeInlandFreight=true. */
  inlandFreightUsd?: number | null;
};

export type ProductInput = {
  id: string;
  origin: string;                 // origin.code (CHINA, USA_MIAMI, ...)
  pcsPerCtn: number;
  /** Raw carton dimensions in supplier's native unit (cm OR in). Normalized
   *  to cm inside computeProductCalc via `dimensionUnit`. */
  ctnLengthRaw: number;
  ctnWidthRaw: number;
  ctnHeightRaw: number;
  /** Raw carton weight in supplier's native unit (kg OR lb). */
  wtPerCtnRaw: number;
  /** Supplier-native units for the raw values above. Defaults to metric. */
  dimensionUnit?: "cm" | "in";
  weightUnit?: "kg" | "lb";
  /** Duty rate as decimal (0.20 = 20%). NULL = not set; engine will flag
   *  dutyMissing=true rather than silently computing $0 duty. A legitimate
   *  0% (set explicitly) DOES compute a real 0. */
  dutyRate: number | null;
  pricingTiers: PricingTier[];
  /** Optional FOB extras (FC/ITC/ED). Defaults all zero. v1 unused. */
  fobExtras?: { fcUsd?: number; itcUsd?: number; edUsd?: number };
};

export type RouteTier = {
  from: number;
  to: number | null;              // null = unbounded
  /** USD rate per chargeable unit. NULL = data error; engine flags
   *  the row as "invalid data" rather than billing $0. */
  rateUsd: number | null;
};

/**
 * Which physical parameter the carrier bills on.
 * Drives the applied-quantity calculation; together with chargeableUnit
 * it determines the units in which `applied` is expressed.
 */
export type ChargeableMetric =
  | "ACTUAL_WEIGHT"
  | "VOLUMETRIC_WEIGHT"
  | "CHARGEABLE_WEIGHT"
  | "VOLUME";

export type RouteInput = {
  id: string;
  code: string;                   // 'DHL-CHINA-BB'
  methodCode: string;             // 'DHL' | 'OCEAN'
  /** Billing parameter (chargeable metric). Selects which quantity gets
   *  multiplied by the tier rate. */
  chargeableMetric: ChargeableMetric;
  /** Display + unit-of-measure for `applied` ('lbs' | 'kg' | 'CBM' | …). */
  chargeableUnit: string;
  origin: string;
  destination: "BB" | "CBN" | string;
  /** Route fixed cost. NULL = data error → route is flagged invalid. */
  baseFeeUsd: number | null;
  fuelPct: number;                // decimal: 0.36 for 36%
  bufferPct: number;              // decimal
  lacFixedBbd: number;
  lacPerCbmBbd: number;
  /** When TRUE, this route adds the tier's inlandFreightUsd to transportPre
   *  (and propagates through fuel + buffer). FALSE = no ground leg. */
  includeInlandFreight: boolean;
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

export type TransportInactiveReason =
  | "origin mismatch"
  | "no tier"
  | "invalid data";

export type TransportCell =
  | {
      active: true;
      routeId: string;
      applied: number;             // in chargeableUnit
      tier: RouteTier | null;
      tierCostUsd: number;
      /** Inland (ground) freight USD added to transportPre. 0 when route
       *  switch is off OR tier has no value set (see itcMissing). */
      itcUsd: number;
      /** TRUE when the route's includeInlandFreight=true but the tier has
       *  no inlandFreightUsd set. */
      itcMissing: boolean;
      transportPreUsd: number;     // base + tier + itc
      transportUsd: Money;         // after fuel + buffer
      cifUsd: Money;
      cifUnitUsd: Money;
    }
  | { active: false; routeId: string; reason: TransportInactiveReason };

export type BBRouteCell =
  | {
      active: true;
      routeId: string;
      lacBbd: Money;
      ldfBbd: Money;
      ldfUnitBbd: Money;
      /** Duty cell. When dutyMissing=true, dutyBbd / ldpBbd / ldpUnitBbd
       *  are NULL — callers must render an explicit "not set" state,
       *  never treat as a final number. */
      dutyMissing: boolean;
      dutyBbd: Money | null;
      ldpBbd: Money | null;
      ldpUnitBbd: Money | null;
    }
  | { active: false; routeId: string; reason: "origin mismatch" | "no transport" | "invalid data" };

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

/** Resolve the applied quantity for a chargeable metric, in the route's
 *  chargeable unit. Weight metrics convert from canonical kg. */
function resolveApplied(
  metric: ChargeableMetric,
  unit: string,
  totalCbm: number,
  totalWeightKg: number,
  volumetricKg: number,
  kgToLbs: number,
): number {
  const toUnit = (kg: number) =>
    unit === "lbs" || unit === "lb" ? kg * kgToLbs : kg;
  switch (metric) {
    case "ACTUAL_WEIGHT":     return toUnit(totalWeightKg);
    case "VOLUMETRIC_WEIGHT": return toUnit(volumetricKg);
    case "CHARGEABLE_WEIGHT": return toUnit(Math.max(totalWeightKg, volumetricKg));
    case "VOLUME":            return totalCbm;
  }
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

  // Normalize supplier-native carton dimensions/weight to canonical cm/kg ONCE.
  const inToCm = settings.inToCm;
  const kgToLbs = settings.kgToLbs;
  const lenCm = product.dimensionUnit === "in" ? product.ctnLengthRaw * inToCm : product.ctnLengthRaw;
  const widCm = product.dimensionUnit === "in" ? product.ctnWidthRaw  * inToCm : product.ctnWidthRaw;
  const hgtCm = product.dimensionUnit === "in" ? product.ctnHeightRaw * inToCm : product.ctnHeightRaw;
  const wtKg  = product.weightUnit    === "lb" ? product.wtPerCtnRaw  / kgToLbs : product.wtPerCtnRaw;

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
        transports[route.id] = { active: false, routeId: route.id, reason: "origin mismatch" };
        if (route.destination === "BB") {
          bbOutputs[route.id] = { active: false, routeId: route.id, reason: "no transport" };
        }
        continue;
      }

      // Invalid-data guard: missing base fee can never produce a real cost.
      if (route.baseFeeUsd == null || !Number.isFinite(route.baseFeeUsd)) {
        transports[route.id] = { active: false, routeId: route.id, reason: "invalid data" };
        if (route.destination === "BB") {
          bbOutputs[route.id] = { active: false, routeId: route.id, reason: "invalid data" };
        }
        continue;
      }

      const applied = resolveApplied(
        route.chargeableMetric,
        route.chargeableUnit,
        totalCbm,
        totalWeightKg,
        volumetricKg,
        settings.kgToLbs,
      );
      const matched = pickTier(route.tiers, applied);
      if (!matched) {
        transports[route.id] = { active: false, routeId: route.id, reason: "no tier" };
        if (route.destination === "BB") {
          bbOutputs[route.id] = { active: false, routeId: route.id, reason: "no transport" };
        }
        continue;
      }

      // Invalid tier rate → don't silently bill $0.
      if (matched.rateUsd == null || !Number.isFinite(matched.rateUsd)) {
        transports[route.id] = { active: false, routeId: route.id, reason: "invalid data" };
        if (route.destination === "BB") {
          bbOutputs[route.id] = { active: false, routeId: route.id, reason: "invalid data" };
        }
        continue;
      }

      const tierCost = applied * matched.rateUsd;
      const tierItc = tier.inlandFreightUsd;
      const itcMissing = route.includeInlandFreight && (tierItc == null);
      const itcUsd = route.includeInlandFreight ? (tierItc ?? 0) : 0;
      const transportPre = route.baseFeeUsd + tierCost + itcUsd;
      // Fuel AND buffer applied UNCONDITIONALLY for every route — a 0 is a ×1 no-op.
      const transportAmt = transportPre * (1 + route.fuelPct) * (1 + route.bufferPct);
      const cifAmt = productTotalAmt + transportAmt;

      transports[route.id] = {
        active: true,
        routeId: route.id,
        applied,
        tier: matched,
        tierCostUsd: tierCost,
        itcUsd,
        itcMissing,
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
        const dutyMissing = product.dutyRate == null;
        const dutyAmt = dutyMissing
          ? null
          : cifAmt * settings.customsMultiplier * settings.dvf * (product.dutyRate as number);
        const ldpAmt = dutyAmt == null ? null : ldfAmt + dutyAmt;
        bbOutputs[route.id] = {
          active: true,
          routeId: route.id,
          lacBbd: bbd(lacAmt),
          ldfBbd: bbd(ldfAmt),
          ldfUnitBbd: bbd(ldfAmt / tier.qty),
          dutyMissing,
          dutyBbd: dutyAmt == null ? null : bbd(dutyAmt),
          ldpBbd: ldpAmt == null ? null : bbd(ldpAmt),
          ldpUnitBbd: ldpAmt == null ? null : bbd(ldpAmt / tier.qty),
        };
      }
    }

    return { spec, transports, bbOutputs };
  });

  return { productId: product.id, effectiveFx, rows, routeOrder, bbRouteOrder };
}

/** Find the cheapest active BB-destination route for a row, by LDP.
 *  Rows where LDP is null (dutyMissing) are skipped. */
export function cheapestBbRouteForRow(row: CalcRow, bbRouteOrder: string[]): string | null {
  let best: { id: string; amt: number } | null = null;
  for (const id of bbRouteOrder) {
    const cell = row.bbOutputs[id];
    if (!cell || !cell.active) continue;
    if (cell.ldpBbd == null) continue;
    if (best == null || cell.ldpBbd.amount < best.amt) {
      best = { id, amt: cell.ldpBbd.amount };
    }
  }
  return best?.id ?? null;
}
