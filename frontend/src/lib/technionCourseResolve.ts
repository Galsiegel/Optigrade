import { expandCourseIdVariants, normalizeCourseIdKey } from "@/lib/courseNumberNormalize";
import type { CourseListItem } from "@/lib/courses";

function idVariantSet(courseId: string): Set<string> {
  return new Set([
    courseId,
    normalizeCourseIdKey(courseId),
    ...expandCourseIdVariants(courseId)
  ]);
}

export function technionCourseIdsMatch(a: string, b: string): boolean {
  const sa = idVariantSet(a);
  const sb = idVariantSet(b);
  for (const x of sa) {
    if (sb.has(x)) return true;
  }
  return false;
}

/** Find a course in a Technion JSON list (handles SAP vs legacy id shapes). */
export function findTechnionCourseItem(
  items: CourseListItem[] | null | undefined,
  courseId: string
): CourseListItem | undefined {
  if (!items?.length) return undefined;
  return items.find((c) => technionCourseIdsMatch(courseId, c.courseId));
}
