import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import type { CourseListItem } from "@/lib/courses";
import { fetchSemestersForCatalog } from "@/lib/semesters";
import { fetchTechnionUgCoursesJson, technionCoursesJsonUrl } from "@/lib/technionUgCourses";

/**
 * - `mergeAllSemesters`: union of every Technion JSON for Firestore `semesters` rows.
 * - `lastSemesterOnly`: one file — last row in 0→2 order from Firestore.
 * - `pinnedSemester`: one file — fixed index **0 חורף / 1 אביב / 2 קיץ** for `catalogYear` (no `semesters` docs required).
 */
export type CatalogCourseListSource = "mergeAllSemesters" | "lastSemesterOnly" | "pinnedSemester";

export type UseCatalogCourseListOptions = {
  db: Firestore | undefined | null;
  catalogId: string | null;
  catalogYear: number | null;
  /** When false, clears state (no fetch). */
  enabled: boolean;
  source?: CatalogCourseListSource;
  /** With `source: "pinnedSemester"`: **0** חורף, **1** אביב, **2** קיץ. Default **1** (אביב) — placeholder “אביב תשפ״ו” style list from one Technion dump. */
  pinnedSemesterIndex?: number;
};

/**
 * Loads Technion gh-pages course JSON for a catalog year (and optional Firestore `semesters` rows).
 */
export function useCatalogCourseList({
  db,
  catalogId,
  catalogYear,
  enabled,
  source = "mergeAllSemesters",
  pinnedSemesterIndex = 1
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
        if (source === "pinnedSemester") {
          const idxRaw = pinnedSemesterIndex;
          const idx = idxRaw === 0 || idxRaw === 1 || idxRaw === 2 ? idxRaw : 1;
          const url = technionCoursesJsonUrl(yearVal, idx);
          try {
            const items = await fetchTechnionUgCoursesJson(url);
            // eslint-disable-next-line no-console
            console.info("[Optigrade] Technion catalog pinned-semester list", {
              catalogId: catId,
              catalogYear: yearVal,
              semester: idx,
              url,
              count: items.length
            });
            if (!cancelled) {
              if (items.length === 0) {
                setCourses([]);
                setError("לא נמצאו קורסים בקובץ הסמסטר שנבחר.");
              } else {
                setCourses(items);
                setError(null);
              }
            }
          } catch (e) {
            console.warn("[Optigrade] Technion semester JSON failed:", url, e);
            if (!cancelled) {
              setCourses([]);
              setError("לא הצלחנו לטעון את רשימת הקורסים מהמקור החיצוני.");
            }
          }
          return;
        }

        const semesters = await fetchSemestersForCatalog(fs, catId);
        if (semesters.length === 0) {
          if (!cancelled) {
            setCourses([]);
            setError("לא נמצאו סמסטרים לקטלוג זה. הוסיפו מסמכים ב־semesters ב־Firestore.");
          }
          return;
        }

        if (source === "lastSemesterOnly") {
          const last = semesters[semesters.length - 1]!;
          const url = technionCoursesJsonUrl(yearVal, last.semester);
          try {
            const items = await fetchTechnionUgCoursesJson(url);
            // eslint-disable-next-line no-console
            console.info("[Optigrade] Technion catalog single-semester list", {
              catalogId: catId,
              catalogYear: yearVal,
              semester: last.semester,
              url,
              count: items.length
            });
            if (!cancelled) {
              if (items.length === 0) {
                setCourses([]);
                setError("לא נמצאו קורסים בקובץ הסמסטר האחרון.");
              } else {
                setCourses(items);
                setError(null);
              }
            }
          } catch (e) {
            console.warn("[Optigrade] Technion semester JSON failed:", url, e);
            if (!cancelled) {
              setCourses([]);
              setError("לא הצלחנו לטעון את רשימת הקורסים מהמקור החיצוני.");
            }
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
  }, [db, catalogId, catalogYear, enabled, source, pinnedSemesterIndex]);

  return { courses, loading, error };
}
