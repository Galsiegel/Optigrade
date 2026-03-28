/**
 * Hebrew calendar study-year helpers (academic / catalog labeling).
 * Catalog documents use `year` ≈ Hebrew year minus 3760 (e.g. 5780 → 2020).
 */

export const MIN_STUDY_HEBREW_YEAR = 5780; /** תש״ף */

const TENS = ["י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"] as const;
const ONES = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"] as const;

/** Last three digits of Hebrew year (e.g. 785) → letters with gershayim (e.g. תשפ״ה). */
export function hebrewYearGematriaSuffix(hebrewYear: number): string {
  let n = ((hebrewYear % 1000) + 1000) % 1000;
  const parts: string[] = [];

  const hundredsVals = [400, 300, 200, 100] as const;
  const hundredsChars = ["ת", "ש", "ר", "ק"] as const;
  for (let i = 0; i < hundredsVals.length; i++) {
    while (n >= hundredsVals[i]) {
      parts.push(hundredsChars[i]);
      n -= hundredsVals[i];
    }
  }

  if (n === 15) {
    parts.push("טו");
  } else if (n === 16) {
    parts.push("טז");
  } else {
    if (n >= 10) {
      const ti = Math.floor(n / 10);
      if (ti >= 1 && ti <= 9) {
        parts.push(TENS[ti - 1]);
      }
      n %= 10;
    }
    if (n > 0) {
      parts.push(ONES[n - 1]);
    }
  }

  const s = parts.join("");
  if (s.length === 0) return "";
  if (s.length === 1) return `${s}\u05F3`;
  return `${s.slice(0, -1)}\u05F4${s.slice(-1)}`;
}

/** Full label e.g. 5785 → תשפ״ה */
export function formatHebrewStudyYearLabel(hebrewYear: number): string {
  return hebrewYearGematriaSuffix(hebrewYear);
}

/**
 * Gregorian “catalog year” stored in Firestore `catalogs.year` for this Hebrew year.
 * Matches sample: 5780 / תש״ף → 2020.
 */
export function gregorianYearForHebrewStudyYear(hebrewYear: number): number {
  return hebrewYear - 3760;
}

/** UI: catalog / study year `year` → "(year-1-year)", e.g. 2020 → "(2019-2020)". */
export function formatAcademicYearSpan(year: number): string {
  return `(${year - 1}-${year})`;
}

/**
 * Approximate current Hebrew year for UI (October boundary ≈ post–Rosh Hashanah).
 */
export function getCurrentHebrewYear(now: Date = new Date()): number {
  let g = now.getFullYear();
  const oct1 = new Date(g, 9, 1);
  if (now < oct1) {
    g -= 1;
  }
  return g + 3761;
}

export type StudyYearOption = {
  hebrewYear: number;
  label: string;
  gregorianYear: number;
};

/** Options from תש״ף (5780) through current Hebrew year, oldest first. */
export function buildStudyYearSelectOptions(now: Date = new Date()): StudyYearOption[] {
  const max = Math.max(MIN_STUDY_HEBREW_YEAR, getCurrentHebrewYear(now));
  const out: StudyYearOption[] = [];
  for (let hy = MIN_STUDY_HEBREW_YEAR; hy <= max; hy++) {
    out.push({
      hebrewYear: hy,
      label: formatHebrewStudyYearLabel(hy),
      gregorianYear: gregorianYearForHebrewStudyYear(hy)
    });
  }
  return out;
}
