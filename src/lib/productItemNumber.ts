/**
 * Product primary_item_number = `{subcategoryCode}{sequence}{originLetter}`.
 * Length 7. CHECK constraint in DB: ^[A-Z0-9]{6}[A-Z]$.
 *
 *   chars 1-3  → subcategory.code  (3 alphanumeric)
 *   chars 4-6  → 3-digit sequence  (001-999)
 *   char  7    → origin letter     (A-Z)
 */

export function composePrimaryItemNumber(
  subcategoryCode: string,
  sequence: string | number,
  originLetter: string,
): string {
  const subc = subcategoryCode.toUpperCase().trim();
  const seq = String(sequence).padStart(3, "0").slice(-3);
  const letter = originLetter.toUpperCase().slice(0, 1);
  return `${subc}${seq}${letter}`;
}

export function parsePrimaryItemNumber(num: string | null | undefined): {
  subcategoryCode: string;
  sequence: string;
  originLetter: string;
} | null {
  if (!num || num.length !== 7) return null;
  return {
    subcategoryCode: num.slice(0, 3).toUpperCase(),
    sequence: num.slice(3, 6),
    originLetter: num.slice(6, 7).toUpperCase(),
  };
}

/** Validate a 3-digit sequence input. Returns sanitized string or null. */
export function sanitizeSequenceInput(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(0, 3);
}

/** Find next available 3-digit sequence within a subcategory. */
export function nextSequenceFor(
  subcategoryCode: string,
  existingItemNumbers: string[],
): string {
  const subc = subcategoryCode.toUpperCase();
  const used = new Set<number>();
  for (const n of existingItemNumbers) {
    if (n.length !== 7) continue;
    if (n.slice(0, 3).toUpperCase() !== subc) continue;
    const s = parseInt(n.slice(3, 6), 10);
    if (Number.isFinite(s)) used.add(s);
  }
  for (let i = 1; i < 1000; i++) {
    if (!used.has(i)) return String(i).padStart(3, "0");
  }
  return "999";
}
