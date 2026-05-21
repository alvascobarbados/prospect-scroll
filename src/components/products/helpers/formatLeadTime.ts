export function formatLeadTime(min: number | null | undefined, max: number | null | undefined): string {
  if (min == null) return "\u2014";
  if (max == null || max === min) return `${min} days`;
  return `${min}\u2013${max} days`; // en-dash
}
