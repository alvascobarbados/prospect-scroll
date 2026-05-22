/**
 * Single money formatter for Alvasco. Used everywhere monetary values
 * are shown — Calculations card, Pricelist, Product Costs.
 *
 * Rules (locked):
 * - Currency code is ALWAYS prefixed: USD$1,234.56 / BBD$2,634.75
 * - null OR amount === 0 renders as em-dash
 * - 2 decimals, US grouping
 */
export type Currency = "USD" | "BBD";
export type Money = { amount: number; currency: Currency };

export const usd = (amount: number): Money => ({ amount, currency: "USD" });
export const bbd = (amount: number): Money => ({ amount, currency: "BBD" });

export function formatMoney(m: Money | null | undefined): string {
  if (m == null) return "\u2014";
  if (m.amount === 0) return "\u2014";
  const n = m.amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${m.currency}$${n}`;
}

/** Format a raw number (no currency, no em-dash for zero) — for workings. */
export function formatNumber(n: number, dp = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}
