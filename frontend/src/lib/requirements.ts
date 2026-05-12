import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Firestore,
  type Timestamp
} from "firebase/firestore";
import { expandCourseIdVariants, toSapEightDigitCourseIdForStorage } from "@/lib/courseNumberNormalize";

const COLLECTION = "requirements";

export type RequirementSemester = {
  name: string;
  courses: string[];
};

export type RequirementCoursesPayload = {
  semesters: RequirementSemester[];
};

export type RequirementDoc = {
  name: string;
  /** Same id as `tracks` document and `users.track`. */
  track: string;
  /** `catalogs` document id. */
  catalog: string;
  hasSemesters: boolean;
  minCredits: number;
  minCourses: number;
  courses: RequirementCoursesPayload;
  createdAt?: Timestamp | null;
};

/** `flatCourseIds` is filled when `hasSemesters` is false (Firestore stores `courses` as a string array). */
export type RequirementRow = RequirementDoc & { id: string; flatCourseIds: string[] };

/** Firestore may store `semesters` as an array or as a map (`{ "0": {...}, "1": {...} }`). */
function coerceSemestersList(semestersRaw: unknown): unknown[] {
  if (Array.isArray(semestersRaw)) return semestersRaw;
  if (semestersRaw && typeof semestersRaw === "object" && !Array.isArray(semestersRaw)) {
    const o = semestersRaw as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 0) return [];
    const allNumericKeys = keys.every((k) => /^\d+$/.test(k));
    if (allNumericKeys) {
      return keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => o[k])
        .filter((v) => v != null);
    }
    return Object.values(o).filter((v) => v != null);
  }
  return [];
}

function parseCourseIdEntry(x: unknown): string | null {
  if (typeof x === "string" && x.trim()) return toSapEightDigitCourseIdForStorage(x.trim());
  if (typeof x === "number" && Number.isFinite(x)) return toSapEightDigitCourseIdForStorage(String(Math.trunc(x)));
  return null;
}

function parseCourseIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const id = parseCourseIdEntry(x);
    if (id) out.push(id);
  }
  return out;
}

/** Display name only from Firestore fields — no invented default (UI may show "—" if empty). */
function semesterNameFrom(o: Record<string, unknown>): string {
  const candidates = [o.name, o.title, o.label, o.semesterName];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

/**
 * Firestore sometimes stores one semester as a map `courses.semesters = { name, courses: [...] }`
 * instead of `courses.semesters = [ { name, courses } ]`. Without this branch, `Object.values`
 * mixes the name string and the courses array and we lose the real title.
 */
function tryParseSemestersSingleObjectMap(semestersRaw: unknown): RequirementSemester[] | null {
  if (!semestersRaw || typeof semestersRaw !== "object" || Array.isArray(semestersRaw)) return null;
  const o = semestersRaw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length === 0) return null;
  if (keys.every((k) => /^\d+$/.test(k))) return null;

  const coursesRaw = courseListField(o);
  const hasCourseArray = Array.isArray(coursesRaw);
  const hasTitle = [o.name, o.title, o.label, o.semesterName].some(
    (c) => typeof c === "string" && c.trim() !== ""
  );
  if (!hasCourseArray && !hasTitle) return null;

  return [
    {
      name: semesterNameFrom(o),
      courses: parseCourseIdList(coursesRaw)
    }
  ];
}

function courseListField(o: Record<string, unknown>): unknown {
  return (
    o.courses ??
    o.courseIds ??
    o.courseList ??
    o.items ??
    o.courseNumbers
  );
}

/**
 * Reads `courses.semesters` from the requirement document, with fallbacks for
 * alternate layouts (top-level `semesters`, map-shaped semester lists, numeric course ids).
 */
export function parseCoursesPayload(data: Record<string, unknown>): RequirementCoursesPayload {
  let block: unknown = data.courses;
  if (typeof block === "string" && block.trim()) {
    try {
      block = JSON.parse(block) as unknown;
    } catch {
      block = undefined;
    }
  }
  let semestersRaw: unknown;
  if (block && typeof block === "object" && !Array.isArray(block)) {
    semestersRaw = (block as { semesters?: unknown }).semesters;
  }
  if (semestersRaw === undefined && data.semesters !== undefined) {
    semestersRaw = data.semesters;
  }
  const singleMap = tryParseSemestersSingleObjectMap(semestersRaw);
  if (singleMap) return { semesters: singleMap };

  const list = coerceSemestersList(semestersRaw);
  const semesters: RequirementSemester[] = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const name = semesterNameFrom(o);
    const courses = parseCourseIdList(courseListField(o));
    semesters.push({ name, courses });
  }
  return { semesters };
}

function parseHasSemesters(data: Record<string, unknown>): boolean {
  const v = data.hasSemesters;
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  if (typeof v === "number") return v === 1;
  return Boolean(v);
}

/**
 * When `hasSemesters` is false, `courses` is a **Firestore array** of course id strings (SAP form),
 * optionally `{ list: [...] }` / `{ courseIds: [...] }`, or legacy `{ semesters: [...] }` (first bucket only).
 */
export function parseFlatCoursesArray(data: Record<string, unknown>): string[] {
  let raw: unknown = data.courses;
  if (typeof raw === "string" && raw.trim()) {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      raw = undefined;
    }
  }
  if (Array.isArray(raw)) return parseCourseIdList(raw);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.list)) return parseCourseIdList(o.list);
    if (Array.isArray(o.courseIds)) return parseCourseIdList(o.courseIds);
    const semestersRaw = o.semesters;
    const list = coerceSemestersList(semestersRaw);
    if (list.length === 1 && list[0] && typeof list[0] === "object") {
      return parseCourseIdList(courseListField(list[0] as Record<string, unknown>));
    }
  }
  return [];
}

function rowFromSnap(id: string, data: Record<string, unknown>): RequirementRow {
  const hasSemesters = parseHasSemesters(data);
  return {
    id,
    name: String(data.name ?? ""),
    track: String(data.track ?? ""),
    catalog: String(data.catalog ?? ""),
    hasSemesters,
    minCredits:
      typeof data.minCredits === "number" && Number.isFinite(data.minCredits) ? data.minCredits : 0,
    minCourses:
      typeof data.minCourses === "number" && Number.isFinite(data.minCourses) ? data.minCourses : 0,
    courses: hasSemesters ? parseCoursesPayload(data) : { semesters: [] },
    flatCourseIds: hasSemesters ? [] : parseFlatCoursesArray(data),
    createdAt: (data.createdAt as Timestamp | undefined) ?? null
  };
}

export async function listRequirements(
  db: Firestore,
  trackId: string,
  catalogId: string
): Promise<RequirementRow[]> {
  const q = query(
    collection(db, COLLECTION),
    where("track", "==", trackId),
    where("catalog", "==", catalogId)
  );
  const snap = await getDocs(q);
  const rows: RequirementRow[] = [];
  snap.forEach((d) => {
    rows.push(rowFromSnap(d.id, d.data() as Record<string, unknown>));
  });
  rows.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
    const tb = b.createdAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  return rows;
}

export type CreateRequirementInput = {
  name: string;
  track: string;
  catalog: string;
  hasSemesters: boolean;
  minCredits: number;
  minCourses: number;
};

export async function createRequirement(db: Firestore, input: CreateRequirementInput): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    name: input.name,
    track: input.track,
    catalog: input.catalog,
    hasSemesters: input.hasSemesters,
    minCredits: input.minCredits,
    minCourses: input.minCourses,
    courses: input.hasSemesters ? { semesters: [] as RequirementSemester[] } : ([] as string[]),
    createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function appendRequirementSemester(
  db: Firestore,
  requirementId: string,
  semesterName: string
): Promise<void> {
  const ref = doc(db, COLLECTION, requirementId);
  const name = semesterName.trim();
  if (!name) throw new Error("semester name required");
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("requirement not found");
    const data = snap.data() as Record<string, unknown>;
    if (!parseHasSemesters(data)) throw new Error("requirement has no semesters layout");
    const { semesters } = parseCoursesPayload(data);
    semesters.push({ name, courses: [] });
    transaction.update(ref, { courses: { semesters } });
  });
}

function semesterHasCourse(semester: RequirementSemester, rawCourseId: string): boolean {
  const incoming = new Set(expandCourseIdVariants(toSapEightDigitCourseIdForStorage(rawCourseId)));
  for (const c of semester.courses) {
    for (const v of expandCourseIdVariants(c)) {
      if (incoming.has(v)) return true;
    }
  }
  return false;
}

function courseIdsMatchStored(a: string, b: string): boolean {
  const sa = toSapEightDigitCourseIdForStorage(a);
  const sb = toSapEightDigitCourseIdForStorage(b);
  const variantsB = new Set(expandCourseIdVariants(sb));
  for (const v of expandCourseIdVariants(sa)) {
    if (variantsB.has(v)) return true;
  }
  return false;
}

export async function removeCourseFromRequirementSemester(
  db: Firestore,
  requirementId: string,
  semesterIndex: number,
  storedCourseId: string
): Promise<void> {
  const ref = doc(db, COLLECTION, requirementId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("requirement not found");
    const data = snap.data() as Record<string, unknown>;
    if (!parseHasSemesters(data)) throw new Error("requirement has no semesters layout");
    const { semesters } = parseCoursesPayload(data);
    if (semesterIndex < 0 || semesterIndex >= semesters.length) {
      throw new Error("invalid semester index");
    }
    const sem = semesters[semesterIndex];
    const filtered = sem.courses.filter((c) => !courseIdsMatchStored(c, storedCourseId));
    if (filtered.length === sem.courses.length) return;
    const next = semesters.map((s, i) =>
      i === semesterIndex ? { ...s, courses: filtered } : { ...s, courses: [...s.courses] }
    );
    transaction.update(ref, { courses: { semesters: next } });
  });
}

export async function appendCourseToRequirementSemester(
  db: Firestore,
  requirementId: string,
  semesterIndex: number,
  rawCourseId: string
): Promise<void> {
  const sap = toSapEightDigitCourseIdForStorage(rawCourseId);
  const ref = doc(db, COLLECTION, requirementId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("requirement not found");
    const data = snap.data() as Record<string, unknown>;
    if (!parseHasSemesters(data)) throw new Error("requirement has no semesters layout");
    const { semesters } = parseCoursesPayload(data);
    if (semesterIndex < 0 || semesterIndex >= semesters.length) {
      throw new Error("invalid semester index");
    }
    const sem = semesters[semesterIndex];
    if (semesterHasCourse(sem, sap)) return;
    const next = semesters.map((s, i) =>
      i === semesterIndex ? { ...s, courses: [...s.courses, sap] } : { ...s, courses: [...s.courses] }
    );
    transaction.update(ref, { courses: { semesters: next } });
  });
}

function flatListHasCourse(ids: string[], rawCourseId: string): boolean {
  const sem = { name: "", courses: ids };
  return semesterHasCourse(sem, rawCourseId);
}

/** Append one course id to the flat `courses` array (`hasSemesters: false`). */
export async function appendCourseToRequirementFlat(
  db: Firestore,
  requirementId: string,
  rawCourseId: string
): Promise<void> {
  const sap = toSapEightDigitCourseIdForStorage(rawCourseId);
  const ref = doc(db, COLLECTION, requirementId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("requirement not found");
    const data = snap.data() as Record<string, unknown>;
    if (parseHasSemesters(data)) throw new Error("requirement uses semesters");
    const cur = parseFlatCoursesArray(data);
    if (flatListHasCourse(cur, sap)) return;
    transaction.update(ref, { courses: [...cur, sap] });
  });
}

/** Remove a course from the flat `courses` array (`hasSemesters: false`). */
export async function removeCourseFromRequirementFlat(
  db: Firestore,
  requirementId: string,
  storedCourseId: string
): Promise<void> {
  const ref = doc(db, COLLECTION, requirementId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("requirement not found");
    const data = snap.data() as Record<string, unknown>;
    if (parseHasSemesters(data)) throw new Error("requirement uses semesters");
    const cur = parseFlatCoursesArray(data);
    const next = cur.filter((c) => !courseIdsMatchStored(c, storedCourseId));
    if (next.length === cur.length) return;
    transaction.update(ref, { courses: next });
  });
}
