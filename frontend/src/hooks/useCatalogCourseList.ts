import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { CourseListItem } from "@/lib/courses";
import { fetchSemestersForCatalog } from "@/lib/semesters";
import { fetchTechnionUgCoursesJson, technionCoursesJsonUrl } from "@/lib/technionUgCourses";

export type UseCatalogCourseListOptions = {
  db: Firestore | undefined | null;
  catalogId: string | null;
  catalogYear: number | null;
  /** When false, clears state (no fetch). */
  enabled: boolean;
};

/**
 * Merges Technion gh-pages course JSON for every `semesters` row tied to the catalog
 * (UG fetcher for catalog year ≤2023, SAP fetcher for year ≥2024 — see `technionCoursesJsonUrl`).
 * Dedupes by `courseId`.
 */
export function useCatalogCourseList({
  db,
  catalogId,
  catalogYear,
  enabled
}: UseCatalogCourseListOptions) {
  const [courses, setCourses] = useState<CourseListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !db || !catalogId || catalogYear == null) {
      setCourses(null);
      setLoading(false);
      setError(null);
      return;
    }

    const fs = db;
    const catId = catalogId;
    const yearVal = catalogYear;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setCourses(null);
      try {
        const semesters = await fetchSemestersForCatalog(fs, catId);
        if (semesters.length === 0) {
          if (!cancelled) {
            setCourses([]);
            setError("לא נמצאו סמסטרים לקטלוג זה. הוסיפו מסמכים ב־semesters ב־Firestore.");
          }
          return;
        }

        const merged = new Map<string, CourseListItem>();
        const perUrl: { url: string; ok: boolean; count: number; error?: string }[] = [];
        for (const s of semesters) {
          const url = technionCoursesJsonUrl(yearVal, s.semester);
          try {
            const items = await fetchTechnionUgCoursesJson(url);
            perUrl.push({ url, ok: true, count: items.length });
            for (const c of items) {
              merged.set(c.courseId, c);
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            perUrl.push({ url, ok: false, count: 0, error: errMsg });
            console.warn("[Optigrade] Technion semester JSON failed:", url, e);
          }
        }
        // eslint-disable-next-line no-console
        console.info("[Optigrade] Technion catalog merge", {
          catalogId: catId,
          catalogYear: yearVal,
          totalMerged: merged.size,
          perUrl
        });
        if (merged.size === 0) {
          if (!cancelled) {
            setCourses([]);
            setError("לא הצלחנו לטעון את רשימת הקורסים מהמקור החיצוני.");
          }
          return;
        }
        if (!cancelled) setCourses(Array.from(merged.values()));
      } catch (e) {
        console.error("useCatalogCourseList:", e);
        if (!cancelled) {
          setCourses([]);
          setError("לא הצלחנו לטעון את רשימת הקורסים מהמקור החיצוני.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [db, catalogId, catalogYear, enabled]);

  return { courses, loading, error };
}
