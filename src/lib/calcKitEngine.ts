/**
 * Kit costing — orchestration wrapper around the existing
 * `computeProductCalc` engine. NEVER changes the core landed-cost math.
 *
 * For a kit at quantity Q:
 *   for each component line:
 *     effectiveQty  = Q × line.quantity
 *     componentCalc = computeProductCalc(component, routes, settings)   ← unchanged engine
 *                     using the component's own decoration_id (or all bands when NULL)
 *                     with a SINGLE synthetic pricing tier at effectiveQty
 *                     (resolved from the component's existing pricing bands)
 *   kitRow = sum of all componentCalc rows[0]
 *
 * Conservative-cost guarantees:
 *   • If a component is incomplete (no carton, missing tier, mismatched origin,
 *     dutyMissing, invalid data, etc.), the kit row inherits that as the kit's
 *     state for that route — never silently sums the resolvable parts.
 */
import {
  computeProductCalc,
  type CalcResult,
  type ProductInput,
  type RouteInput,
  type Settings,
} from "./calcEngine";
import { bbd, usd } from "./formatMoney";

// ─────────── Types ───────────

export type KitComponentBand = {
  decoration_id: string;
  qty: number;
  unit_cost: number;
  setup_cost: number;
  inland_freight_usd: number | null;
};

/** A kit-component product loaded with everything `computeProductCalc` needs,
 *  including its own decoration bands so we can pick a tier at effectiveQty. */
export type KitComponentProduct = {
  id: string;
  origin_code: string | null;
  carton_pack: number | null;
  carton_length: number | null;
  carton_width: number | null;
  carton_height: number | null;
  carton_weight: number | null;
  dimension_unit: "cm" | "in" | null;
  weight_unit: "kg" | "lb" | null;
  duty_rate_pct: number | string | null;
  bands: KitComponentBand[];
};

export type KitComponentLine = {
  id: string;
  component: KitComponentProduct;
  /** per-kit quantity */
  quantity: number;
  /** chosen decoration; NULL = bare (use all bands across decorations as fallback) */
  decoration_id: string | null;
  sort_order: number;
};

export type KitTransportCell =
  | { active: true; transportUsd: number; cifUsd: number }
  | { active: false; reason: string; incompleteComponents: string[] };

export type KitBBCell =
  | { active: true; ldfBbd: number; dutyBbd: number; ldpBbd: number; ldpUnitBbd: number }
  | {
      active: false;
      reason: string;
      dutyMissing: boolean;
      incompleteComponents: string[];
    };

export type KitRow = {
  qty: number;
  /** TRUE iff every component resolved on every route (no inactives, no dutyMissing,
   *  no specs missing). */
  complete: boolean;
  /** Per-component diagnostics that made this row incomplete. */
  incompleteComponents: string[];
  fobUsd: number | null;
  transports: Record<string, KitTransportCell>;
  bbOutputs: Record<string, KitBBCell>;
};

export type KitCalcResult = {
  kitProductId: string;
  rows: KitRow[];
  routeOrder: string[];
  bbRouteOrder: string[];
};

// ─────────── Helpers ───────────

function dutyDecimal(raw: number | string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n)) return null;
  return n / 100;
}

/** Filter component bands by decoration_id (or merge across decorations if NULL),
 *  dedup by qty (first wins), sorted ascending. */
function bandsForDecoration(
  comp: KitComponentProduct,
  decorationId: string | null,
): KitComponentBand[] {
  const src = decorationId
    ? comp.bands.filter((b) => b.decoration_id === decorationId)
    : comp.bands;
  const seen = new Set<number>();
  const out: KitComponentBand[] = [];
  for (const b of src) {
    if (seen.has(b.qty)) continue;
    seen.add(b.qty);
    out.push(b);
  }
  out.sort((a, b) => a.qty - b.qty);
  return out;
}

/** Pick the band whose qty ≤ effectiveQty (largest such); fall back to smallest band
 *  when effectiveQty is below the lowest break. Returns null if there are no bands. */
function pickBandForQty(bands: KitComponentBand[], effectiveQty: number): KitComponentBand | null {
  if (bands.length === 0) return null;
  let chosen: KitComponentBand | null = null;
  for (const b of bands) {
    if (b.qty <= effectiveQty) chosen = b;
    else break;
  }
  return chosen ?? bands[0];
}

/** Build a synthetic ProductInput with ONE pricing tier at exactly effectiveQty.
 *  Returns null if mandatory carton/origin/bands missing → component is incomplete. */
function buildComponentProductInput(
  comp: KitComponentProduct,
  decorationId: string | null,
  effectiveQty: number,
): ProductInput | null {
  if (
    !comp.origin_code ||
    comp.carton_pack == null ||
    comp.carton_length == null ||
    comp.carton_width == null ||
    comp.carton_height == null ||
    comp.carton_weight == null
  ) {
    return null;
  }
  const bands = bandsForDecoration(comp, decorationId);
  const band = pickBandForQty(bands, effectiveQty);
  if (!band) return null;
  return {
    id: comp.id,
    origin: comp.origin_code,
    pcsPerCtn: Number(comp.carton_pack),
    ctnLengthRaw: Number(comp.carton_length),
    ctnWidthRaw: Number(comp.carton_width),
    ctnHeightRaw: Number(comp.carton_height),
    wtPerCtnRaw: Number(comp.carton_weight),
    dimensionUnit: (comp.dimension_unit ?? "cm") as "cm" | "in",
    weightUnit: (comp.weight_unit ?? "kg") as "kg" | "lb",
    dutyRate: dutyDecimal(comp.duty_rate_pct),
    pricingTiers: [
      {
        qty: effectiveQty,
        unitUsd: band.unit_cost,
        setupUsd: band.setup_cost,
        inlandFreightUsd: band.inland_freight_usd,
      },
    ],
  };
}

// ─────────── Public: cost a single component at effectiveQty ───────────

/**
 * Cost a single component product at a specific quantity, using the
 * UNCHANGED `computeProductCalc`. Returns the full CalcResult so callers
 * can inspect both transport and BB outputs.
 */
export function computeComponentCalcAt(
  comp: KitComponentProduct,
  decorationId: string | null,
  effectiveQty: number,
  routes: RouteInput[],
  settings: Settings,
): CalcResult | null {
  const input = buildComponentProductInput(comp, decorationId, effectiveQty);
  if (!input) return null;
  return computeProductCalc(input, routes, settings);
}

// ─────────── Public: cost a kit at a list of kit quantities ───────────

export function computeKitCalc(
  kitProductId: string,
  components: KitComponentLine[],
  kitQuantities: number[],
  routes: RouteInput[],
  settings: Settings,
): KitCalcResult {
  const routeOrder = [...routes].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.id);
  const bbRouteOrder = [...routes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((r) => r.destination === "BB")
    .map((r) => r.id);

  const rows: KitRow[] = [];
  for (const Q of kitQuantities) {
    const transports: Record<string, KitTransportCell> = {};
    const bbOutputs: Record<string, KitBBCell> = {};
    const incompleteComponentsRow: string[] = [];


    // Per-route accumulators
    const fobAcc: Record<string, number> = {};
    const transAcc: Record<string, { transport: number; cif: number }> = {};
    const bbAcc: Record<string, { ldf: number; duty: number; ldp: number }> = {};
    // Per-route incomplete reasons
    const transBad: Record<string, { reason: string; comps: string[] }> = {};
    const bbBad: Record<string, { reason: string; dutyMissing: boolean; comps: string[] }> = {};

    let kitFob: number = 0;
    let kitFobBroken = false;

    if (components.length === 0) {
      kitFobBroken = true;
      incompleteComponentsRow.push("no components");
    }

    for (const line of components) {
      const effectiveQty = Q * line.quantity;
      const calc = computeComponentCalcAt(
        line.component,
        line.decoration_id,
        effectiveQty,
        routes,
        settings,
      );
      if (!calc || calc.rows.length === 0) {
        kitFobBroken = true;
        incompleteComponentsRow.push(line.component.id);
        // Mark every route as bad for this row.
        for (const rid of routeOrder) {
          transBad[rid] = transBad[rid] ?? { reason: "specs incomplete", comps: [] };
          transBad[rid].comps.push(line.component.id);
        }
        for (const rid of bbRouteOrder) {
          bbBad[rid] = bbBad[rid] ?? {
            reason: "specs incomplete",
            dutyMissing: false,
            comps: [],
          };
          bbBad[rid].comps.push(line.component.id);
        }
        continue;
      }
      const compRow = calc.rows[0];
      kitFob += compRow.spec.productTotalUsd.amount;

      for (const route of routes) {
        const t = compRow.transports[route.id];
        if (!t || !t.active) {
          transBad[route.id] = transBad[route.id] ?? {
            reason: t && "reason" in t ? t.reason : "inactive",
            comps: [],
          };
          if (!transBad[route.id].comps.includes(line.component.id)) {
            transBad[route.id].comps.push(line.component.id);
          }
        } else if (!transBad[route.id]) {
          transAcc[route.id] = transAcc[route.id] ?? { transport: 0, cif: 0 };
          transAcc[route.id].transport += t.transportUsd.amount;
          transAcc[route.id].cif += t.cifUsd.amount;
        }

        if (route.destination === "BB") {
          const bb = compRow.bbOutputs[route.id];
          if (!bb || !bb.active) {
            bbBad[route.id] = bbBad[route.id] ?? {
              reason: bb && "reason" in bb ? bb.reason : "inactive",
              dutyMissing: false,
              comps: [],
            };
            if (!bbBad[route.id].comps.includes(line.component.id)) {
              bbBad[route.id].comps.push(line.component.id);
            }
          } else if (bb.dutyMissing || bb.dutyBbd == null || bb.ldpBbd == null) {
            bbBad[route.id] = bbBad[route.id] ?? {
              reason: "duty missing",
              dutyMissing: true,
              comps: [],
            };
            bbBad[route.id].dutyMissing = true;
            if (!bbBad[route.id].comps.includes(line.component.id)) {
              bbBad[route.id].comps.push(line.component.id);
            }
          } else if (!bbBad[route.id]) {
            bbAcc[route.id] = bbAcc[route.id] ?? { ldf: 0, duty: 0, ldp: 0 };
            bbAcc[route.id].ldf += bb.ldfBbd.amount;
            bbAcc[route.id].duty += bb.dutyBbd.amount;
            bbAcc[route.id].ldp += bb.ldpBbd.amount;
          }
        }
      }
    }

    // Materialize per-route cells.
    for (const route of routes) {
      if (transBad[route.id]) {
        transports[route.id] = {
          active: false,
          reason: transBad[route.id].reason,
          incompleteComponents: transBad[route.id].comps,
        };
      } else {
        const a = transAcc[route.id];
        transports[route.id] = a
          ? { active: true, transportUsd: a.transport, cifUsd: a.cif }
          : { active: false, reason: "no components", incompleteComponents: [] };
      }

      if (route.destination === "BB") {
        if (bbBad[route.id]) {
          bbOutputs[route.id] = {
            active: false,
            reason: bbBad[route.id].reason,
            dutyMissing: bbBad[route.id].dutyMissing,
            incompleteComponents: bbBad[route.id].comps,
          };
        } else {
          const a = bbAcc[route.id];
          bbOutputs[route.id] = a
            ? {
                active: true,
                ldfBbd: a.ldf,
                dutyBbd: a.duty,
                ldpBbd: a.ldp,
                ldpUnitBbd: a.ldp / Q,
              }
            : {
                active: false,
                reason: "no components",
                dutyMissing: false,
                incompleteComponents: [],
              };
        }
      }
    }

    const complete =
      !kitFobBroken &&
      Object.values(transports).every((c) => c.active) &&
      Object.values(bbOutputs).every((c) => c.active);

    rows.push({
      qty: Q,
      complete,
      incompleteComponents: incompleteComponentsRow,
      fobUsd: kitFobBroken ? null : kitFob,
      transports,
      bbOutputs,
    });

    // appease typescript: rows already pushed, return value unused
    return undefined as unknown as KitRow;
  });

  // The map above pushes into rows AND returns; the returned array contains
  // the same rows in order. Use rows array directly:
  void rows;

  return {
    kitProductId,
    rows,
    routeOrder,
    bbRouteOrder,
  };
}

// `bbd` / `usd` re-exported so callers formatting kit numbers don't need to
// import from formatMoney directly when they already pull from this module.
export { bbd, usd };
