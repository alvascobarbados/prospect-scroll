/**
 * Acceptance test for the cost engine — reproduces the SFG-AGU
 * (golf umbrella) table from the Calculations spec.
 *
 * Tier rates back-solved from the spec's expected outputs:
 *   DHL-CHINA-BB: baseFee=$36.35, tiers 0–61lb @ $4.17, 61+ @ $4.22, fuel 36%
 *   OCEAN-CHINA-BB: baseFee=$50, single tier @ $160/CBM, fuel 0%
 *
 * Settings: base FX 2.02768, fee 2% → effective 2.0682336.
 * Customs multiplier 2.0. Duty 20%.
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
  ctnLengthCm: 105,
  ctnWidthCm: 22,
  ctnHeightCm: 18,
  wtPerCtnKg: 15,
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
  rateUnit: "lbs",
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
  rateUnit: "CBM",
  origin: "CHINA",
  destination: "BB",
  baseFeeUsd: 50,
  fuelPct: 0,
  bufferPct: 0,
  lacFixedBbd: 150,
  lacPerCbmBbd: 90,
  tiers: [{ from: 0, to: null, rateUsd: 160 }],
  sortOrder: 2,
};

const mismatched: RouteInput = {
  // USA_MIAMI origin → should gray out for a CHINA product
  ...dhl,
  id: "dhl-usamia-bb",
  code: "DHL-USAMIA-BB",
  origin: "USA_MIAMI",
  sortOrder: 0,
};

describe("calcEngine — SFG-AGU acceptance", () => {
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
        near(c.dutyBbd.amount, duty[i]);
        near(c.ldpBbd.amount, ldp[i]);
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
        near(b.dutyBbd.amount, duty[i]);
        near(b.ldpBbd.amount, ldp[i]);
      }
    });
  });

  it("origin-mismatched routes gray out", () => {
    result.rows.forEach((r) => {
      expect(r.transports[mismatched.id].active).toBe(false);
      expect(r.bbOutputs[mismatched.id].active).toBe(false);
    });
  });

  it("cheapest BB route per row defaults to Ocean (lower LDP than DHL)", () => {
    result.rows.forEach((r) => {
      expect(cheapestBbRouteForRow(r, result.bbRouteOrder)).toBe(ocean.id);
    });
  });

  it("route column order is stable and includes mismatched route", () => {
    expect(result.routeOrder).toEqual([mismatched.id, dhl.id, ocean.id]);
    expect(result.bbRouteOrder).toEqual([mismatched.id, dhl.id, ocean.id]);
  });

  it("fuel/buffer multiplication runs unconditionally (Ocean 0% → x1)", () => {
    // Ocean qty=25: pre = 50 + 0.04158*160 = 56.6528; with fuel=0 buffer=0 → 56.6528
    const t = result.rows[0].transports[ocean.id];
    if (t.active) near(t.transportUsd.amount, t.transportPreUsd);
  });
});
