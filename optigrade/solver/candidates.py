"""Candidate-building utilities for finish/planning solvers."""

from __future__ import annotations

from dataclasses import dataclass, field, replace

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.student import StudentCourseInstance, StudentProfile


@dataclass(frozen=True)
class CandidateBuildResult:
    candidates: list[StudentCourseInstance]
    warnings: list[str] = field(default_factory=list)


def build_finish_candidates(
    student_profile: StudentProfile,
    degree_catalog: DegreeCatalog | None = None,
) -> CandidateBuildResult:
    candidates: list[StudentCourseInstance] = []
    warnings: list[str] = []
    seen_non_sports_course_ids: set[str] = set()

    for instance in student_profile.completed_courses:
        if not instance.is_solver_eligible:
            continue

        instance = _with_catalog_eligible_buckets(instance, degree_catalog)
        is_sports = _is_sports_course(instance)
        if is_sports:
            candidates.append(instance)
            continue

        if instance.course_id in seen_non_sports_course_ids:
            warnings.append(
                f"Duplicate non-sports course ignored for solver: {instance.course_id}"
            )
            continue

        seen_non_sports_course_ids.add(instance.course_id)
        candidates.append(instance)

    return CandidateBuildResult(candidates=candidates, warnings=warnings)


def _with_catalog_eligible_buckets(
    instance: StudentCourseInstance,
    degree_catalog: DegreeCatalog | None,
) -> StudentCourseInstance:
    if degree_catalog is None:
        return instance

    eligible_bucket_ids = _derive_eligible_bucket_ids(instance, degree_catalog)
    return replace(instance, eligible_bucket_ids=eligible_bucket_ids)


def _derive_eligible_bucket_ids(
    instance: StudentCourseInstance,
    degree_catalog: DegreeCatalog,
) -> set[str]:
    course_id = str(instance.course_id)
    eligible_bucket_ids: set[str] = set()

    if _is_sports_course(instance):
        eligible_bucket_ids.add("sports")
        return eligible_bucket_ids

    if course_id in degree_catalog.mandatory_course_ids:
        eligible_bucket_ids.add("mandatory")
    if course_id in degree_catalog.core_course_ids:
        eligible_bucket_ids.add("core")
    if course_id in degree_catalog.faculty_choice_course_ids:
        eligible_bucket_ids.add("faculty_choice")

    for specialty_id, specialty in degree_catalog.specialties.items():
        if course_id in specialty.eligible_course_ids:
            eligible_bucket_ids.add(f"specialty:{specialty_id}")

    if not eligible_bucket_ids:
        eligible_bucket_ids.add("enrichment")

    return eligible_bucket_ids


def _is_sports_course(instance: StudentCourseInstance) -> bool:
    return "sports" in instance.eligible_bucket_ids or str(instance.course_id).startswith("394")
