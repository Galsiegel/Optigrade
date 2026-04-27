/**
 * Technion course dumps from Michael Maltsev’s gh-pages JSON (UG vs SAP naming).
 *
 * Firestore `semesters`: **`catalog`** = `catalogs` doc id (string); **`semester`**: **0** winter, **1** spring, **2** summer.
 *
 * **Catalog year ≤ {@link TECHNION_LEGACY_UG_MAX_CATALOG_YEAR}** — `technion-ug-info-fetcher`:
 * URL `courses_{YYYY}{SS}.json` with SS **01** winter, **02** spring, **03** summer.
 *
 * **Catalog year ≥ {@link TECHNION_SAP_MIN_CATALOG_YEAR}** — `technion-sap-info-fetcher`:
 * URL `courses_{YYYY}_{CCC}.json` with **200** winter, **201** spring, **202** summer.
 */

import { normalizeCourseIdKey } from "@/lib/courseNumberNormalize";
import { courseMatchesTerm, type CourseListItem } from "@/lib/courses";

/** Last catalog `year` that uses the UG fetcher URL pattern (inclusive). */
export const TECHNION_LEGACY_UG_MAX_CATALOG_YEAR = 2023;

/** First catalog `year` that uses the SAP fetcher URL pattern (inclusive). */
export const TECHNION_SAP_MIN_CATALOG_YEAR = 2024;

const UG_INFO_BASE =
  "https://raw.githubusercontent.com/michael-maltsev/technion-ug-info-fetcher/gh-pages";

const SAP_INFO_BASE =
  "https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/gh-pages";

/** Firestore semester (0–2) → UG URL segment (1–3). */
export function ugFetcherSemesterDigit(semester0to2: number): number {
  return semester0to2 + 1;
}

/** Firestore semester (0–2) → SAP URL suffix (200, 201, 202). */
export function sapFetcherSemesterCode(semester0to2: number): number {
  return 200 + semester0to2;
}

/**
 * Full JSON URL for one catalog year + semester (picks UG vs SAP repo by `catalogYear`).
 */
export function technionCoursesJsonUrl(catalogYear: number, semester0to2: number): string {
  if (catalogYear <= TECHNION_LEGACY_UG_MAX_CATALOG_YEAR) {
    const s = ugFetcherSemesterDigit(semester0to2);
    const suffix = `${catalogYear}${String(s).padStart(2, "0")}`;
    return `${UG_INFO_BASE}/courses_${suffix}.json`;
  }
  const code = sapFetcherSemesterCode(semester0to2);
  return `${SAP_INFO_BASE}/courses_${catalogYear}_${code}.json`;
}

type UgGeneral = Record<string, unknown>;

function readGeneral(entry: unknown): UgGeneral | null {
  if (!entry || typeof entry !== "object") return null;
  const g = (entry as { general?: unknown }).general;
  if (!g || typeof g !== "object") return null;
  return g as UgGeneral;
}

/** Map one gh-pages JSON file to normalized list items (course id = מספר מקצוע). */
export function parseTechnionUgCoursesJson(data: unknown): CourseListItem[] {
  if (!Array.isArray(data)) return [];
  const out: CourseListItem[] = [];
  for (const entry of data) {
    const g = readGeneral(entry);
    if (!g) continue;
    const rawNum = String(g["מספר מקצוע"] ?? "").trim();
    const name = String(g["שם מקצוע"] ?? "").trim();
    if (!rawNum) continue;
    const idKey = normalizeCourseIdKey(rawNum);
    const rawPts = g["נקודות"];
    const pts =
      rawPts !== undefined && rawPts !== null && String(rawPts).trim() !== ""
        ? `${String(rawPts).trim()} נק״ז`
        : null;
    out.push({
      courseId: idKey,
      courseName: name || rawNum,
      courseNumber: rawNum,
      pointsLabel: pts
    });
  }
  return out;
}

/** In-memory: same URL is not fetched/parsed more than once per page lifetime (in-flight deduped). */
const technionParsedByUrl = new Map<string, CourseListItem[]>();
const technionInflight = new Map<string, Promise<CourseListItem[]>>();

export async function fetchTechnionUgCoursesJson(url: string): Promise<CourseListItem[]> {
  const hit = technionParsedByUrl.get(url);
  if (hit) return hit;

  let p = technionInflight.get(url);
  if (!p) {
    p = (async () => {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) {
        throw new Error(`courses JSON ${res.status}: ${url}`);
      }
      const data: unknown = await res.json();
      const items = parseTechnionUgCoursesJson(data);
      technionParsedByUrl.set(url, items);
      return items;
    })();
    technionInflight.set(url, p);
  }

  try {
    return await p;
  } finally {
    technionInflight.delete(url);
  }
}

/** Client-side filter (same semantics as Firestore search fallback). */
export function filterCourseListInMemory(
  items: CourseListItem[],
  term: string,
  maxResults: number
): CourseListItem[] {
  const t = term.trim();
  if (t.length < 2) return [];
  return items.filter((c) => courseMatchesTerm(c, t)).slice(0, maxResults);
}
