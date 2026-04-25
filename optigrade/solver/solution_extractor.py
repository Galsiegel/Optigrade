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
    selected_instance_ids: set[str] | None = None,
) -> FinishSimulationResult:
    candidate_by_instance_id = {
        instance.course_instance_id: instance for instance in candidates
    }
    effective_selected_ids = selected_instance_ids or {
        instance.course_instance_id for instance in candidates
    }
    selected_credit_units = sum(
        instance.credit_units
        for instance in candidates
        if instance.course_instance_id in effective_selected_ids
    )

    bucket_assignments: list[BucketAssignment] = []
    assigned_instance_ids: set[str] = set()
    for instance in candidates:
        if instance.course_instance_id not in effective_selected_ids:
            continue
        candidate_buckets = sorted(
            bucket_id
            for (instance_id, bucket_id) in model_context.alloc_vars.keys()
            if instance_id == instance.course_instance_id
        )
        if candidate_buckets:
            assigned_instance_ids.add(instance.course_instance_id)
            bucket_assignments.append(
                BucketAssignment(
                    course_instance_id=instance.course_instance_id,
                    course_id=str(instance.course_id),
                    bucket_id=candidate_buckets[0],
                )
            )

    extra_unused_courses: list[CourseResult] = []
    for instance_id, _x_var in model_context.x_vars.items():
        if instance_id in assigned_instance_ids:
            continue
        matching = candidate_by_instance_id.get(instance_id)
        if matching is None:
            continue
        if instance_id in effective_selected_ids:
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
        if not instance.verified and instance.course_instance_id in effective_selected_ids
    ]

    return FinishSimulationResult(
        status=status,
        summary=CreditSummary(
            total_selected_credit_units=selected_credit_units,
            total_selected_courses=len(effective_selected_ids),
        ),
        bucket_assignments=bucket_assignments,
        extra_unused_courses=extra_unused_courses,
        manual_unverified_courses=manual_unverified_courses,
        warnings=warnings,
        diagnostics=diagnostics,
    )
