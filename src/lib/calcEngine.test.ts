/**
 * Acceptance + safety tests for the cost engine.
 *
 *  - SFG-AGU (China, metric): regression-guards the validated numbers.
 *    DVF=1.0, ocean fuel=0 buffer=0, DHL fuel=36% buffer=0.
 *  - Aria (USA, imperial):   pins the unit-normalization path
 *    (carton inches → cm, lb → kg).
 *  - Duty/route safety tests: assert the engine surfaces
 *    dutyMissing / "invalid data" instead of silent zeros.
 */
import { describe, expect, it } from "vitest";
import {
  cheapestBbRouteForRow,
  computeProductCalc,
  type ProductInput,
  type RouteInput,
  type Settings,
} from "./calcEngine";

const settings: Settings = {
  fxBbdPerUsdBase: 2.02768,
  fxFeePct: 0.02,
  customsMultiplier: 2.0,
  dvf: 1.0,
  kgToLbs: 2.20462,
  cbmDivisor: 1_000_000,
  volumetricDivisor: 200,
  inToCm: 2.54,
};

const product: ProductInput = {
  id: "SFG-AGU",
  origin: "CHINA",
  pcsPerCtn: 25,
  ctnLengthRaw: 105,
  ctnWidthRaw: 22,
  ctnHeightRaw: 18,
  wtPerCtnRaw: 15,
  dutyRate: 0.2,
  pricingTiers: [
    { qty: 25, unitUsd: 6.2, setupUsd: 0 },
    { qty: 50, unitUsd: 5.1, setupUsd: 0 },
    { qty: 100, unitUsd: 4.5, setupUsd: 0 },
    { qty: 250, unitUsd: 3.5, setupUsd: 0 },
  ],
};

const dhl: RouteInput = {
  id: "dhl-china-bb",
  code: "DHL-CHINA-BB",
  methodCode: "DHL",
  chargeableMetric: "CHARGEABLE_WEIGHT",
  chargeableUnit: "lbs",
  origin: "CHINA",
  destination: "BB",
  baseFeeUsd: 36.35,
  fuelPct: 0.36,
  bufferPct: 0,
  lacFixedBbd: 80,
  lacPerCbmBbd: 0,
  includeInlandFreight: false,
  tiers: [
    { from: 0, to: 61, rateUsd: 4.17 },
    { from: 61, to: null, rateUsd: 4.22 },
  ],
  sortOrder: 1,
};

const ocean: RouteInput = {
  id: "ocean-china-bb",
  code: "OCEAN-CHINA-BB",
  methodCode: "OCEAN",
  chargeableMetric: "VOLUME",
  chargeableUnit: "CBM",
  origin: "CHINA",
  destination: "BB",
  baseFeeUsd: 50,
  fuelPct: 0,
  bufferPct: 0,
  lacFixedBbd: 150,
  lacPerCbmBbd: 90,
  includeInlandFreight: false,
  tiers: [{ from: 0, to: null, rateUsd: 160 }],
  sortOrder: 2,
};

const mismatched: RouteInput = {
  ...dhl,
  id: "dhl-usamia-bb",
  code: "DHL-USAMIA-BB",
  origin: "USA_MIAMI",
  sortOrder: 0,
};

describe("calcEngine — SFG-AGU regression guard (numbers MUST NOT move)", () => {
  const result = computeProductCalc(product, [dhl, ocean, mismatched], settings);
  const tol = 0.01;
  const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

  it("computes effective FX correctly", () => {
    near(result.effectiveFx, 2.0682336);
  });

  it("emits 4 rows in pricing-tier order", () => {
    expect(result.rows.map((r) => r.spec.qty)).toEqual([25, 50, 100, 250]);
  });

  it("FOB totals match", () => {
    const expected = [155, 255, 450, 875];
    result.rows.forEach((r, i) => near(r.spec.productTotalUsd.amount, expected[i]));
  });

  it("DHL transport USD matches", () => {
    const expected = [236.98, 429.02, 808.6, 1947.35];
    result.rows.forEach((r, i) => {
      const c = r.transports[dhl.id];
      expect(c.active).toBe(true);
      if (c.active) near(c.transportUsd.amount, expected[i]);
    });
  });

  it("DHL CIF USD matches", () => {
    const expected = [391.98, 684.02, 1258.6, 2822.35];
    result.rows.forEach((r, i) => {
      const c = r.transports[dhl.id];
      if (c.active) near(c.cifUsd.amount, expected[i]);
    });
  });

  it("DHL LDF + Duty + LDP BBD match", () => {
    const ldf = [890.7, 1494.71, 2683.08, 5917.28];
    const duty = [156.79, 273.61, 503.44, 1128.94];
    const ldp = [1047.49, 1768.32, 3186.52, 7046.22];
    result.rows.forEach((r, i) => {
      const c = r.bbOutputs[dhl.id];
      expect(c.active).toBe(true);
      if (c.active) {
        near(c.ldfBbd.amount, ldf[i]);
        expect(c.dutyMissing).toBe(false);
        near(c.dutyBbd!.amount, duty[i]);
        near(c.ldpBbd!.amount, ldp[i]);
      }
    });
  });

  it("Ocean transport / CIF / LAC / LDF / Duty / LDP match", () => {
    const transport = [56.65, 63.31, 76.61, 116.53];
    const cif = [211.65, 318.31, 526.61, 991.53];
    const lac = [153.74, 157.48, 164.97, 187.42];
    const ldf = [591.49, 815.81, 1254.12, 2238.13];
    const duty = [84.66, 127.32, 210.64, 396.61];
    const ldp = [676.15, 943.14, 1464.77, 2634.74];

    result.rows.forEach((r, i) => {
      const t = r.transports[ocean.id];
      expect(t.active).toBe(true);
      if (t.active) {
        near(t.transportUsd.amount, transport[i]);
        near(t.cifUsd.amount, cif[i]);
      }
      const b = r.bbOutputs[ocean.id];
      expect(b.active).toBe(true);
      if (b.active) {
        near(b.lacBbd.amount, lac[i]);
        near(b.ldfBbd.amount, ldf[i]);
        near(b.dutyBbd!.amount, duty[i]);
        near(b.ldpBbd!.amount, ldp[i]);
      }
    });
  });

  it("origin-mismatched routes gray out", () => {
    result.rows.forEach((r) => {
      expect(r.transports[mismatched.id].active).toBe(false);
      expect(r.bbOutputs[mismatched.id].active).toBe(false);
    });
  });

  it("cheapest BB route per row defaults to Ocean", () => {
    result.rows.forEach((r) => {
      expect(cheapestBbRouteForRow(r, result.bbRouteOrder)).toBe(ocean.id);
    });
  });

  it("route column order is stable", () => {
    expect(result.routeOrder).toEqual([mismatched.id, dhl.id, ocean.id]);
    expect(result.bbRouteOrder).toEqual([mismatched.id, dhl.id, ocean.id]);
  });

  it("fuel/buffer multiplication runs unconditionally (Ocean 0% → x1)", () => {
    const t = result.rows[0].transports[ocean.id];
    if (t.active) expect(Math.abs(t.transportUsd.amount - t.transportPreUsd)).toBeLessThanOrEqual(0.01);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Imperial-product fixture — pins the unit-normalization path.
// Aria-style 12oz wine cup profile: 19×11×19 in, 23 lb per carton.
// ──────────────────────────────────────────────────────────────────────
describe("calcEngine — imperial product normalizes inches→cm and lb→kg", () => {
  const aria: ProductInput = {
    id: "ARIA-12OZ",
    origin: "USA_NON_MIAMI",
    pcsPerCtn: 50,
    ctnLengthRaw: 19,
    ctnWidthRaw: 11,
    ctnHeightRaw: 19,
    wtPerCtnRaw: 23,
    dimensionUnit: "in",
    weightUnit: "lb",
    dutyRate: 0.2,
    pricingTiers: [
      { qty: 50,  unitUsd: 8.27, setupUsd: 50 },
      { qty: 100, unitUsd: 8.27, setupUsd: 50 },
      { qty: 250, unitUsd: 8.27, setupUsd: 50 },
      { qty: 500, unitUsd: 8.27, setupUsd: 50 },
    ],
  };

  const result = computeProductCalc(aria, [], settings);

  it("converts 19×11×19 in → ~0.06508 CBM per carton", () => {
    // 1 carton = qty 50 (the smallest tier).
    const cbm = result.rows[0].spec.totalCbm;
    expect(Math.abs(cbm - 0.06508)).toBeLessThanOrEqual(0.001);
  });

  it("converts 23 lb → ~10.43 kg per carton", () => {
    const kg = result.rows[0].spec.totalWeightKg;
    expect(Math.abs(kg - 10.43)).toBeLessThanOrEqual(0.01);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Silent-zero safety: missing duty rate must NEVER produce $0 duty.
// ──────────────────────────────────────────────────────────────────────
describe("calcEngine — duty safety", () => {
  it("dutyRate=null → dutyMissing=true, dutyBbd/ldpBbd null (no silent 0)", () => {
    const p: ProductInput = { ...product, dutyRate: null };
    const r = computeProductCalc(p, [ocean], settings);
    const bb = r.rows[0].bbOutputs[ocean.id];
    expect(bb.active).toBe(true);
    if (bb.active) {
      expect(bb.dutyMissing).toBe(true);
      expect(bb.dutyBbd).toBeNull();
      expect(bb.ldpBbd).toBeNull();
      expect(bb.ldpUnitBbd).toBeNull();
    }
  });

  it("dutyRate=0 → real 0 duty, dutyMissing=false (NOT the same as null)", () => {
    const p: ProductInput = { ...product, dutyRate: 0 };
    const r = computeProductCalc(p, [ocean], settings);
    const bb = r.rows[0].bbOutputs[ocean.id];
    expect(bb.active).toBe(true);
    if (bb.active) {
      expect(bb.dutyMissing).toBe(false);
      expect(bb.dutyBbd).not.toBeNull();
      expect(bb.dutyBbd!.amount).toBe(0);
      // LDP must equal LDF when duty is a real 0.
      expect(Math.abs(bb.ldpBbd!.amount - bb.ldfBbd.amount)).toBeLessThanOrEqual(0.001);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────
// Silent-zero safety: invalid route data must surface as "invalid data",
// distinct from "origin mismatch" / "no tier".
// ──────────────────────────────────────────────────────────────────────
describe("calcEngine — invalid-data routing", () => {
  it("baseFeeUsd=null → reason 'invalid data' (not 'origin mismatch'/'no tier')", () => {
    const bad: RouteInput = { ...ocean, baseFeeUsd: null };
    const r = computeProductCalc(product, [bad], settings);
    const t = r.rows[0].transports[bad.id];
    expect(t.active).toBe(false);
    if ("reason" in t) expect(t.reason).toBe("invalid data");
    const bb = r.rows[0].bbOutputs[bad.id];
    expect(bb.active).toBe(false);
    if ("reason" in bb) expect(bb.reason).toBe("invalid data");
  });

  it("matched tier.rateUsd=null → reason 'invalid data'", () => {
    const bad: RouteInput = {
      ...ocean,
      tiers: [{ from: 0, to: null, rateUsd: null }],
    };
    const r = computeProductCalc(product, [bad], settings);
    const t = r.rows[0].transports[bad.id];
    expect(t.active).toBe(false);
    if ("reason" in t) expect(t.reason).toBe("invalid data");
  });
});
