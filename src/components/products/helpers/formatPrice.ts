/**
 * Render a price for the Products page.
 * $0 → em-dash (cleaner scan).
 */
export function formatPrice(value: number | string | null | undefined): string {
  if (value == null) return "\u2014";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(num) || num === 0) return "\u2014";
  return `$${num.toFixed(2)}`;
}
