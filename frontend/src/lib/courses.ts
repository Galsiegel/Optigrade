import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  endAt,
  type Firestore,
  type QueryDocumentSnapshot
} from "firebase/firestore";
import { expandCourseIdVariants } from "@/lib/courseNumberNormalize";

/** Firestore `courses` document shape (fields vary by import pipeline). */
export type CourseDoc = {
  name?: string;
  title?: string;
  number?: string | number;
  code?: string | number;
  courseNumber?: string | number;
  points?: string | number;
};

export type CourseListItem = {
  courseId: string;
  courseName: string;
  courseNumber: string;
  pointsLabel: string | null;
};

/** True if the string contains any Hebrew letter (Unicode Hebrew block). */
export function textContainsHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

export function catalogNumberFromDoc(data: CourseDoc | undefined, docId: string): string {
  const raw = data?.number ?? data?.code ?? data?.courseNumber;
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    return String(raw).trim();
  }
  return docId;
}

export function pointsLabelFromCourseDoc(data: CourseDoc | undefined): string | null {
  if (!data) return null;
  const raw = data.points;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return `${s} נק״ז`;
}

export function mapCourseDoc(docSnap: QueryDocumentSnapshot): CourseListItem {
  const data = docSnap.data() as CourseDoc;
  return {
    courseId: docSnap.id,
    courseName: data?.name ?? data?.title ?? docSnap.id,
    courseNumber: catalogNumberFromDoc(data, docSnap.id),
    pointsLabel: pointsLabelFromCourseDoc(data)
  };
}

export function mergeCourseResults(primary: CourseListItem[], secondary: CourseListItem[]): CourseListItem[] {
  const m = new Map<string, CourseListItem>();
  for (const c of primary) m.set(c.courseId, c);
  for (const c of secondary) {
    if (!m.has(c.courseId)) m.set(c.courseId, c);
  }
  return Array.from(m.values());
}

export function courseMatchesTerm(c: CourseListItem, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (c.courseName.includes(t)) return true;
  const numberLike = new Set<string>([
    ...expandCourseIdVariants(c.courseId),
    ...expandCourseIdVariants(c.courseNumber)
  ]);
  for (const v of numberLike) {
    if (v.includes(t)) return true;
  }
  const compact = t.replace(/\s+/g, "");
  if (compact.length >= 2) {
    for (const v of numberLike) {
      const numCompact = v.replace(/\s+/g, "");
      if (numCompact.includes(compact)) return true;
    }
  }
  return false;
}

export function courseDisplayFromDoc(
  data: CourseDoc | undefined,
  courseId: string
): { courseName: string; courseNumber: string; coursePoints: string | null } {
  return {
    courseName: data?.name ?? data?.title ?? courseId,
    courseNumber: catalogNumberFromDoc(data, courseId),
    coursePoints: pointsLabelFromCourseDoc(data)
  };
}

/**
 * Prefix search on indexed `name` / `number`, then client filter fallback.
 * Used by onboarding and any other screen that picks a course from the catalog.
 */
export async function searchCourses(
  db: Firestore,
  term: string,
  options?: { maxResults?: number }
): Promise<{ items: CourseListItem[]; error: string | null }> {
  const max = options?.maxResults ?? 8;
  const coursesRef = collection(db, "courses");

  let fromName: CourseListItem[] = [];
  let fromNumber: CourseListItem[] = [];

  try {
    try {
      const nameSnap = await getDocs(
        query(coursesRef, orderBy("name"), startAt(term), endAt(`${term}\uf8ff`), limit(max))
      );
      fromName = nameSnap.docs.map(mapCourseDoc);
    } catch (nameErr) {
      console.error(nameErr);
    }

    try {
      const numSnap = await getDocs(
        query(coursesRef, orderBy("number"), startAt(term), endAt(`${term}\uf8ff`), limit(max))
      );
      fromNumber = numSnap.docs.map(mapCourseDoc);
    } catch (numErr) {
      console.error(numErr);
    }

    let results = mergeCourseResults(fromName, fromNumber).slice(0, max);

    if (results.length === 0) {
      const allSnap = await getDocs(coursesRef);
      const all = allSnap.docs.map(mapCourseDoc);
      results = all.filter((c) => courseMatchesTerm(c, term)).slice(0, max);
    }

    return { items: results, error: null };
  } catch (err) {
    console.error(err);
    try {
      const allSnap = await getDocs(collection(db, "courses"));
      const all = allSnap.docs.map(mapCourseDoc);
      const filtered = all.filter((c) => courseMatchesTerm(c, term)).slice(0, max);
      return { items: filtered, error: null };
    } catch (fallbackErr) {
      console.error(fallbackErr);
      return { items: [], error: "לא הצלחנו לחפש קורסים." };
    }
  }
}
