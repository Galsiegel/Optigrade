import { parseTranscriptSemesterEn } from "@/lib/transcriptSemester";

/** Stored in Firestore for pass/fail (עובר בינארי). */
export const PASS_FAIL_GRADE_DB = "-1";

export type GradeRowItem = {
  courseId: string;
  courseName: string;
  courseNumber: string;
  coursePoints: string | null;
  grade: string;
  /** Hebrew season+year from transcript English line (e.g. `חורף תשפ״ג`); null if unknown. */
  semesterLabel: string | null;
  /** Raw transcript line e.g. `2025-2026 Winter` — used to group and sort terms. */
  transcriptSemesterEn: string | null;
};

export type GradeSemesterGroup = {
  key: string;
  title: string;
  order: { y: number; s: number };
  rows: GradeRowItem[];
};

export function isPassFailGradeStored(grade: string): boolean {
  return String(grade).trim() === PASS_FAIL_GRADE_DB;
}

export function formatGradeForDisplay(grade: string): string {
  if (isPassFailGradeStored(grade)) return "עובר";
  return String(grade).trim();
}

export function parseNumericGrade0to100(raw: string): number | null {
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return n;
}

/** Keeps prior value if the new string would parse to > 100 (no clamping to 100). */
export function sanitizeGradeInputOnChange(raw: string, previous: string): string {
  let s = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  if (s === "") return "";
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return s.slice(0, -1);
  if (n > 100) return previous;
  if (n < 0) return "0";
  return s;
}

/** Parse leading number from points label e.g. "5.5 נק״ז" → 5.5 */
export function pointsWeightFromLabel(label: string | null): number | null {
  if (!label) return null;
  const m = /^[\s]*([0-9]+(?:\.[0-9]+)?)/.exec(label.replace(",", "."));
  if (!m) return null;
  const w = Number(m[1]);
  return Number.isFinite(w) && w > 0 ? w : null;
}

/** Display sum of נק״ז for summary lines (trim trailing zeros). */
export function formatTotalNakazLabel(total: number): string {
  const rounded = Math.round(total * 100) / 100;
  const s = rounded % 1 === 0 ? String(rounded) : String(rounded);
  return `${s} נק״ז`;
}

export function buildGradeSemesterGroups(grades: GradeRowItem[]): GradeSemesterGroup[] {
  const m = new Map<
    string,
    { key: string; rows: GradeRowItem[]; order: { y: number; s: number } }
  >();
  for (const row of grades) {
    const sem = row.transcriptSemesterEn?.trim() || null;
    const key = sem ?? "__none__";
    if (!m.has(key)) {
      const parsed = sem ? parseTranscriptSemesterEn(sem) : null;
      const order = parsed
        ? { y: parsed.jsonYear, s: parsed.semester0to2 }
        : { y: 9_999, s: 9 };
      m.set(key, { key, rows: [], order });
    }
    m.get(key)!.rows.push(row);
  }
  const list: GradeSemesterGroup[] = [];
  for (const g of m.values()) {
    const title =
      g.rows.find((r) => r.semesterLabel)?.semesterLabel ??
      (g.key === "__none__" ? "ללא סמסטר" : g.key);
    list.push({ key: g.key, title, order: g.order, rows: g.rows });
  }
  list.sort((a, b) => a.order.y - b.order.y || a.order.s - b.order.s);
  return list;
}
