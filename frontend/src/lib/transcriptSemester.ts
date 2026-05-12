import { technionCoursesJsonUrl } from "@/lib/technionUgCourses";
import { formatHebrewStudyYearLabel, hebrewYearFromCatalogFirestoreYear } from "@/lib/hebrewYear";

const SEASON_HEBREW = ["חורף", "אביב", "קיץ"] as const;

/**
 * Transcript PDF lines use e.g. "2022-2023 Spring" (see `parse_transcript.py`).
 * The span is the academic year that **starts** in the first calendar year (Winter starts
 * in Oct of that year). Technion course JSON on gh-pages and **`catalogs.year`** use that
 * same `YYYY` — **not** the end year of the span. Example: "2025-2026 Winter" → `2025` + sem `0`.
 */
export function parseTranscriptSemesterEn(
  semester: string
): { jsonYear: number; semester0to2: number } | null {
  const m = /^(\d{4})-(\d{4})\s+(Winter|Spring|Summer)\s*$/i.exec(semester.trim());
  if (!m) return null;
  const y1 = Number(m[1]);
  if (!Number.isFinite(y1)) return null;
  const season = m[3].toLowerCase();
  const semester0to2 =
    season === "winter" ? 0 : season === "spring" ? 1 : season === "summer" ? 2 : -1;
  if (semester0to2 < 0) return null;
  return { jsonYear: y1, semester0to2 };
}

/**
 * Hebrew card title for a transcript semester line (e.g. `2022-2023 Winter` → `חורף תשפ״ג`).
 * Uses the **start** calendar year of the span + season — not the student catalog’s single anchor year.
 */
export function formatTranscriptSemesterHebrewLabel(transcriptSemesterEn: string): string | null {
  const p = parseTranscriptSemesterEn(transcriptSemesterEn);
  if (!p) return null;
  const hy = hebrewYearFromCatalogFirestoreYear(p.jsonYear);
  const suffix = formatHebrewStudyYearLabel(hy);
  return `${SEASON_HEBREW[p.semester0to2]} ${suffix}`;
}

/** JSON URL for the Technion dump that matches this transcript semester line. */
export function technionJsonUrlFromTranscriptSemester(semester: string): string | null {
  const p = parseTranscriptSemesterEn(semester);
  if (!p) return null;
  return technionCoursesJsonUrl(p.jsonYear, p.semester0to2);
}
