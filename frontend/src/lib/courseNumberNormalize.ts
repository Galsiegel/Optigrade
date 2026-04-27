/**
 * Technion course numbers: pre-2024 (UG) dumps often use 6 digits `XXXXXX`;
 * SAP dumps (2024+) use `0XXX0XXX` (zeros at positions 0 and 4). Seven-digit standard ids
 * map like the transcript PDF: `0` + faculty(3) + course(4) → eight digits.
 *
 * Example: `234114` ↔ `02340114`; `3940800` ↔ `03940800`.
 */

const SAP_PADDED_8 = /^0(\d{3})0(\d{3})$/;

/** If `0XXX0XXX`, return legacy `XXXXXX`; otherwise return trimmed input unchanged. */
export function normalizeCourseIdKey(raw: string): string {
  const d = raw.replace(/\s+/g, "");
  const m = SAP_PADDED_8.exec(d);
  if (m) return m[1] + m[2];
  return d;
}

/**
 * Canonical id for **`users.grades`** map keys: SAP **`0XXX0XXX`** when the id is 6 or 7 digits
 * (7-digit standard Technion ids map like the PDF: `0` + faculty(3) + course(4)).
 * Already SAP-shaped values are returned as-is; other strings are returned trimmed.
 */
export function toSapEightDigitCourseIdForStorage(raw: string): string {
  const d = raw.replace(/\s+/g, "");
  if (SAP_PADDED_8.test(d)) return d;
  if (/^\d{6}$/.test(d)) return `0${d.slice(0, 3)}0${d.slice(3)}`;
  if (/^\d{7}$/.test(d)) return `0${d.slice(0, 3)}${d.slice(3)}`;
  return d;
}

/** All string variants for equality / Technion map lookup (deduped). */
export function expandCourseIdVariants(raw: string): string[] {
  const d = raw.replace(/\s+/g, "");
  const sap = toSapEightDigitCourseIdForStorage(d);
  const leg = normalizeCourseIdKey(sap);
  return [...new Set([d, sap, leg])];
}
