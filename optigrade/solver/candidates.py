"""Candidate-building utilities for finish/planning solvers."""

from __future__ import annotations

from dataclasses import dataclass, field

from optigrade.domain.student import StudentCourseInstance, StudentProfile


@dataclass(frozen=True)
class CandidateBuildResult:
    candidates: list[StudentCourseInstance]
    warnings: list[str] = field(default_factory=list)


def build_finish_candidates(student_profile: StudentProfile) -> CandidateBuildResult:
    candidates: list[StudentCourseInstance] = []
    warnings: list[str] = []
    seen_non_sports_course_ids: set[str] = set()

    for instance in student_profile.completed_courses:
        if not instance.is_solver_eligible:
            continue

        is_sports = "sports" in instance.eligible_bucket_ids or str(instance.course_id).startswith("394")
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
