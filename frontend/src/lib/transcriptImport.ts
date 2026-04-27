import { toSapEightDigitCourseIdForStorage } from "@/lib/courseNumberNormalize";
import type { UserGradeWithSemester } from "@/lib/users";

/** Matches backend/api `transcripts` course objects (subset). */
type TranscriptCourseRow = {
  course_id?: unknown;
  grade?: unknown;
  is_pass?: unknown;
  is_numeric_grade?: unknown;
  semester?: unknown;
  name?: unknown;
};

const PASS_FAIL_DB = "-1";

function rowToGradeString(row: TranscriptCourseRow): string | null {
  const idRaw = row.course_id;
  if (typeof idRaw !== "string") return null;
  const courseId = idRaw.trim();
  if (!courseId) return null;

  if (row.is_pass === true) return PASS_FAIL_DB;

  const gradeStr = String(row.grade ?? "").trim();
  if (gradeStr === "Pass") return PASS_FAIL_DB;

  if (row.is_numeric_grade === true && /^\d+$/.test(gradeStr)) {
    const n = Number(gradeStr);
    if (n >= 0 && n <= 100) return String(n);
    return null;
  }

  if (/exemption/i.test(gradeStr)) return PASS_FAIL_DB;

  if (/^\d+(?:\.\d+)?$/.test(gradeStr)) {
    const n = Number(gradeStr.replace(",", "."));
    if (Number.isFinite(n) && n >= 0 && n <= 100) return String(Math.round(n));
  }

  return null;
}

/** Build Firestore `grades` map from `POST .../transcripts/parse-pdf` JSON `courses` array. */
export function gradesRecordFromTranscriptPayload(courses: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(courses)) return out;
  for (const item of courses) {
    if (!item || typeof item !== "object") continue;
    const g = rowToGradeString(item as TranscriptCourseRow);
    if (g === null) continue;
    const rawId = String((item as TranscriptCourseRow).course_id ?? "").trim();
    if (!rawId) continue;
    out[toSapEightDigitCourseIdForStorage(rawId)] = g;
  }
  return out;
}

/** Build `grades` object shape: `courseId -> { grade, semester }`. */
export function gradesWithSemesterFromTranscriptPayload(
  courses: unknown
): Record<string, UserGradeWithSemester> {
  const out: Record<string, UserGradeWithSemester> = {};
  if (!Array.isArray(courses)) return out;
  for (const item of courses) {
    if (!item || typeof item !== "object") continue;
    const g = rowToGradeString(item as TranscriptCourseRow);
    if (g === null) continue;
    const r = item as TranscriptCourseRow;
    const rawId = String(r.course_id ?? "").trim();
    if (!rawId) continue;
    const id = toSapEightDigitCourseIdForStorage(rawId);
    const sem = String(r.semester ?? "").trim();
    out[id] = { grade: g, semester: sem || null };
  }
  return out;
}
