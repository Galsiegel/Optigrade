"""Extract explainable finish-simulation results from model context."""

from __future__ import annotations

from typing import Literal

from optigrade.domain.simulation import (
    BucketAssignment,
    CourseResult,
    CreditSummary,
    Diagnostic,
    FinishSimulationResult,
    RuleStatus,
)
from optigrade.domain.student import StudentCourseInstance
from optigrade.solver.model_builder import FinishModelContext


def extract_finish_result(
    *,
    candidates: list[StudentCourseInstance],
    model_context: FinishModelContext,
    status: Literal["feasible", "infeasible"],
    degree_id: str,
    catalog_year: int,
    selected_specialty_ids: set[str] | None,
    warnings: list[str],
    diagnostics: list[Diagnostic],
    selected_instance_ids: set[str] | None = None,
    selected_bucket_by_instance_id: dict[str, str] | None = None,
    active_specialty_ids: set[str] | None = None,
) -> FinishSimulationResult:
    candidate_by_instance_id = {
        instance.course_instance_id: instance for instance in candidates
    }
    effective_selected_ids = (
        {instance.course_instance_id for instance in candidates}
        if selected_instance_ids is None
        else set(selected_instance_ids)
    )
    selected_credit_units = sum(
        instance.credit_units
        for instance in candidates
        if instance.course_instance_id in effective_selected_ids
    )
    selected_course_ids = {
        str(instance.course_id)
        for instance in candidates
        if instance.course_instance_id in effective_selected_ids
    }

    bucket_assignments: list[BucketAssignment] = []
    assigned_instance_ids: set[str] = set()
    selected_bucket_by_instance_id = selected_bucket_by_instance_id or {}
    for instance in candidates:
        if instance.course_instance_id not in effective_selected_ids:
            continue
        chosen_bucket = selected_bucket_by_instance_id.get(instance.course_instance_id)
        if chosen_bucket is None and status == "feasible":
            candidate_buckets = sorted(
                bucket_id
                for (instance_id, bucket_id) in model_context.alloc_vars.keys()
                if instance_id == instance.course_instance_id
            )
            if candidate_buckets:
                chosen_bucket = candidate_buckets[0]
        if chosen_bucket is not None:
            assigned_instance_ids.add(instance.course_instance_id)
            reason_codes = _build_assignment_reason_codes(
                instance=instance,
                bucket_id=chosen_bucket,
                selected_course_ids=selected_course_ids,
                model_context=model_context,
            )
            bucket_assignments.append(
                BucketAssignment(
                    course_instance_id=instance.course_instance_id,
                    course_id=str(instance.course_id),
                    bucket_id=chosen_bucket,
                    reason_codes=reason_codes,
                )
            )

    extra_unused_courses: list[CourseResult] = []
    manual_unverified_courses: list[CourseResult] = []
    if status == "feasible":
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
                    reason_codes=["extra_unused"],
                )
            )

        manual_unverified_courses = [
            CourseResult(
                course_instance_id=instance.course_instance_id,
                course_id=str(instance.course_id),
                verified=instance.verified,
                reason_codes=["manual_unverified"],
            )
            for instance in candidates
            if not instance.verified and instance.course_instance_id in effective_selected_ids
        ]
    rule_statuses = _build_rule_statuses(
        model_context,
        selected_instance_ids=effective_selected_ids,
        selected_bucket_by_instance_id=selected_bucket_by_instance_id,
        active_specialty_ids=active_specialty_ids or set(),
    )

    return FinishSimulationResult(
        status=status,
        degree_id=degree_id,
        catalog_year=catalog_year,
        selected_specialty_ids=sorted(selected_specialty_ids or set()),
        summary=CreditSummary(
            total_selected_credit_units=selected_credit_units,
            total_selected_courses=len(effective_selected_ids),
        ),
        bucket_assignments=bucket_assignments,
        rule_statuses=rule_statuses,
        extra_unused_courses=extra_unused_courses,
        manual_unverified_courses=manual_unverified_courses,
        warnings=warnings,
        diagnostics=diagnostics,
    )


def _build_assignment_reason_codes(
    *,
    instance: StudentCourseInstance,
    bucket_id: str,
    selected_course_ids: set[str],
    model_context: FinishModelContext,
) -> list[str]:
    reason_codes: set[str] = {"counts_toward_total_credits"}
    if instance.source == "transcript":
        reason_codes.add("completed_from_transcript")
    if not instance.verified:
        reason_codes.add("manual_unverified")

    bucket_reason_map = {
        "mandatory": "assigned_to_mandatory",
        "core": "assigned_to_core",
        "faculty_choice": "assigned_to_faculty_choice",
        "enrichment": "assigned_to_enrichment",
        "sports": "assigned_to_sports",
        "malag": "assigned_to_malag",
    }
    if bucket_id.startswith("specialty:"):
        reason_codes.add("assigned_to_active_specialty")
    mapped = bucket_reason_map.get(bucket_id)
    if mapped is not None:
        reason_codes.add(mapped)

    instance_course_id = str(instance.course_id)
    for constraint in model_context.constraints:
        if constraint.type == "specialty_mandatory":
            course_id = str(constraint.details.get("course_id", ""))
            if course_id == instance_course_id:
                reason_codes.add("satisfies_specialty_mandatory_rule")
        elif constraint.type == "specialty_choose_group":
            required_count = int(constraint.details.get("required_count", 0))
            group_courses = {str(course_id) for course_id in constraint.details.get("group_courses", [])}
            if required_count > 0 and instance_course_id in group_courses and group_courses.intersection(selected_course_ids):
                reason_codes.add("satisfies_choose_group")

    return sorted(reason_codes)


def _build_rule_statuses(
    model_context: FinishModelContext,
    *,
    selected_instance_ids: set[str],
    selected_bucket_by_instance_id: dict[str, str],
    active_specialty_ids: set[str],
) -> list[RuleStatus]:
    statuses: list[RuleStatus] = []
    selected_var_names = {
        x_var_name
        for instance_id, x_var_name in model_context.x_vars.items()
        if instance_id in selected_instance_ids
    }
    selected_alloc_var_names = {
        alloc_var_name
        for (instance_id, bucket_id), alloc_var_name in model_context.alloc_vars.items()
        if instance_id in selected_instance_ids
        and selected_bucket_by_instance_id.get(instance_id) == bucket_id
    }
    for index, constraint in enumerate(model_context.constraints):
        constraint_type = constraint.type
        details = constraint.details

        if constraint_type in {"mandatory_completion", "specialty_mandatory"}:
            required = int(details.get("min_selected", 1))
            actual = sum(1 for x_var in details.get("x_vars", []) if x_var in selected_var_names)
            status = "satisfied" if actual >= required else "unsatisfied"
        elif constraint_type == "specialty_choose_group":
            required = int(details.get("required_count", 0))
            actual = sum(1 for x_var in details.get("x_vars", []) if x_var in selected_var_names)
            if required == 0:
                status = "not_applicable"
            else:
                status = "satisfied" if actual >= required else "unsatisfied"
        elif constraint_type in {"core_count_minimum", "specialty_visible_minimum"}:
            if constraint_type == "core_count_minimum":
                required = int(details.get("required_core_count", 0))
            else:
                required = int(details.get("minimum_total_courses", 0))
            actual = sum(1 for alloc_var in details.get("alloc_vars", []) if alloc_var in selected_alloc_var_names)
            status = "satisfied" if actual >= required else "unsatisfied"
        elif constraint_type == "total_credit_minimum":
            required = int(details.get("required_total_credit_units", 0))
            actual = sum(
                int(term["credit_units"])
                for term in details.get("terms", [])
                if term.get("course_instance_id") in selected_instance_ids
            )
            status = "satisfied" if actual >= required else "unsatisfied"
        elif constraint_type == "bucket_credit_minimum":
            required = int(details.get("required_credit_units", 0))
            actual = sum(
                int(term["credit_units"])
                for term in details.get("terms", [])
                if term.get("alloc_var") in selected_alloc_var_names
            )
            status = "satisfied" if actual >= required else "unsatisfied"
        elif constraint_type == "required_specialty_count":
            required = int(details.get("required_specialty_count", 0))
            actual = len(active_specialty_ids)
            status = "satisfied" if actual >= required else "unsatisfied"
        else:
            continue

        statuses.append(
            RuleStatus(
                rule_id=f"{constraint_type}:{index}",
                rule_type=constraint_type,
                status=status,
                required=required,
                actual=actual,
                message_en=f"{constraint_type} requirement status: {status}.",
            )
        )
    return statuses
