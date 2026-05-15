/**
 * Origin code → single-letter abbreviation used as char 7 of a product's
 * primary_item_number. Six origins are pre-seeded with stable codes.
 */
export const ORIGIN_CODE_TO_LETTER: Record<string, string> = {
  CHINA: "C",
  USA_MIAMI: "M",
  USA_NON_MIAMI: "N",
  BARBADOS: "B",
  INDIA: "I",
  VIETNAM: "V",
};

export function originLetterFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return ORIGIN_CODE_TO_LETTER[code.toUpperCase()] ?? null;
}
