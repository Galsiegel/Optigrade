"""Extract explainable finish-simulation results from model context."""

from __future__ import annotations

from optigrade.domain.simulation import (
    BucketAssignment,
    CourseResult,
    CreditSummary,
    Diagnostic,
    FinishSimulationResult,
)
from optigrade.domain.student import StudentCourseInstance
from optigrade.solver.model_builder import FinishModelContext


def extract_finish_result(
    *,
    candidates: list[StudentCourseInstance],
    model_context: FinishModelContext,
    status: str,
    warnings: list[str],
    diagnostics: list[Diagnostic],
) -> FinishSimulationResult:
    selected_instance_ids = {instance.course_instance_id for instance in candidates}
    selected_credit_units = sum(instance.credit_units for instance in candidates)

    bucket_assignments: list[BucketAssignment] = []
    for instance in candidates:
        candidate_buckets = sorted(
            bucket_id
            for (instance_id, bucket_id) in model_context.alloc_vars.keys()
            if instance_id == instance.course_instance_id
        )
        if candidate_buckets:
            bucket_assignments.append(
                BucketAssignment(
                    course_instance_id=instance.course_instance_id,
                    course_id=str(instance.course_id),
                    bucket_id=candidate_buckets[0],
                )
            )

    extra_unused_courses: list[CourseResult] = []
    for instance_id, _x_var in model_context.x_vars.items():
        if instance_id in selected_instance_ids:
            continue
        matching = next(
            (instance for instance in candidates if instance.course_instance_id == instance_id),
            None,
        )
        if matching is None:
            continue
        extra_unused_courses.append(
            CourseResult(
                course_instance_id=matching.course_instance_id,
                course_id=str(matching.course_id),
                verified=matching.verified,
            )
        )

    manual_unverified_courses = [
        CourseResult(
            course_instance_id=instance.course_instance_id,
            course_id=str(instance.course_id),
            verified=instance.verified,
        )
        for instance in candidates
        if not instance.verified
    ]

    return FinishSimulationResult(
        status=status,
        summary=CreditSummary(
            total_selected_credit_units=selected_credit_units,
            total_selected_courses=len(candidates),
        ),
        bucket_assignments=bucket_assignments,
        extra_unused_courses=extra_unused_courses,
        manual_unverified_courses=manual_unverified_courses,
        warnings=warnings,
        diagnostics=diagnostics,
    )
