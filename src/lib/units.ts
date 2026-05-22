/**
 * Unit system primitives.
 *
 * A supplier operates in either metric or imperial — never mixed.
 * Use these helpers to derive display units from `supplier.unit_system`.
 */
export type UnitSystem = "metric" | "imperial";

/** Canonical engine token: "kg" | "lb". Use everywhere that touches the
 *  cost engine. For UI display where "lbs" reads better, use
 *  `weightUnitLabel()`. */
export function weightUnit(system: UnitSystem | null | undefined): "kg" | "lb" {
  return system === "imperial" ? "lb" : "kg";
}

/** Display-only label. Always returns "kg" or "lbs" (note the trailing s). */
export function weightUnitLabel(system: UnitSystem | null | undefined): "kg" | "lbs" {
  return system === "imperial" ? "lbs" : "kg";
}

export function linearUnit(system: UnitSystem | null | undefined): "cm" | "in" {
  return system === "imperial" ? "in" : "cm";
}

/** Legacy paired units for mirroring during the transition period. */
export function legacyUnitsFor(system: UnitSystem): { weight_unit: "kg" | "lbs"; volume_unit: "cm" | "in" } {
  return system === "imperial"
    ? { weight_unit: "lbs", volume_unit: "in" }
    : { weight_unit: "kg", volume_unit: "cm" };
}

/** Replace em/en dashes with hyphens in identifiers like item numbers. */
export function sanitizeDashes(value: string): string {
  return value.replace(/[\u2014\u2013]/g, "-");
}
