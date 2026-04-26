"""Structured infeasibility diagnostics from finish model constraints."""

from __future__ import annotations

from optigrade.domain.simulation import Diagnostic
from optigrade.solver.model_builder import FinishModelContext


def evaluate_finish_feasibility(model_context: FinishModelContext) -> tuple[bool, list[Diagnostic]]:
    diagnostics: list[Diagnostic] = []
    feasible = True

    for constraint in model_context.constraints:
        if constraint.type in {"mandatory_completion", "specialty_mandatory"}:
            needed = int(constraint.details.get("min_selected", 1))
            actual = len(constraint.details.get("x_vars", []))
            if actual < needed:
                feasible = False
                diagnostics.append(
                    Diagnostic(
                        type=constraint.type,
                        severity="error",
                        related_course_ids=[str(constraint.details.get("course_id", ""))],
                        related_bucket_ids=[],
                        message_en="Missing required course.",
                    )
                )
        elif constraint.type == "specialty_choose_group":
            required_count = int(constraint.details.get("required_count", 0))
            actual = len(constraint.details.get("x_vars", []))
            if actual < required_count:
                feasible = False
                diagnostics.append(
                    Diagnostic(
                        type="specialty_choose_group",
                        severity="error",
                        related_course_ids=[str(cid) for cid in constraint.details.get("group_courses", [])],
                        related_bucket_ids=[f"specialty:{constraint.details.get('specialty_id', '')}"],
                        message_en="Specialty choose-group requirement not satisfiable.",
                    )
                )
        elif constraint.type == "core_count_minimum":
            required_core_count = int(constraint.details.get("required_core_count", 0))
            actual = len(constraint.details.get("alloc_vars", []))
            if actual < required_core_count:
                feasible = False
                diagnostics.append(
                    Diagnostic(
                        type="core_count_minimum",
                        severity="error",
                        related_course_ids=[],
                        related_bucket_ids=["core"],
                        message_en="Insufficient core candidate coverage.",
                    )
                )
        elif constraint.type == "specialty_visible_minimum":
            minimum_total_courses = int(constraint.details.get("minimum_total_courses", 0))
            actual = len(constraint.details.get("alloc_vars", []))
            if actual < minimum_total_courses:
                feasible = False
                specialty_id = str(constraint.details.get("specialty_id", ""))
                diagnostics.append(
                    Diagnostic(
                        type="specialty_visible_minimum",
                        severity="error",
                        related_course_ids=[],
                        related_bucket_ids=[f"specialty:{specialty_id}"],
                        message_en="Specialty visible minimum not satisfiable.",
                    )
                )
        elif constraint.type == "total_credit_minimum":
            required_total = int(constraint.details.get("required_total_credit_units", 0))
            actual_total = sum(
                int(term["credit_units"])
                for term in constraint.details.get("terms", [])
            )
            if actual_total < required_total:
                feasible = False
                diagnostics.append(
                    Diagnostic(
                        type="total_credit_minimum",
                        severity="error",
                        related_course_ids=[],
                        related_bucket_ids=[],
                        message_en="Insufficient total credits.",
                    )
                )
        elif constraint.type == "bucket_credit_minimum":
            required_credit_units = int(constraint.details.get("required_credit_units", 0))
            actual_credit_units = sum(
                int(term["credit_units"])
                for term in constraint.details.get("terms", [])
            )
            if actual_credit_units < required_credit_units:
                feasible = False
                bucket_id = str(constraint.details.get("bucket_id", ""))
                diagnostics.append(
                    Diagnostic(
                        type="bucket_credit_minimum",
                        severity="error",
                        related_course_ids=[],
                        related_bucket_ids=[bucket_id],
                        message_en=f"Insufficient credits for bucket '{bucket_id}'.",
                    )
                )
        elif constraint.type == "required_specialty_count":
            required = int(constraint.details.get("required_specialty_count", 0))
            active_specialty_ids = list(constraint.details.get("active_specialty_ids", []))
            if active_specialty_ids:
                actual = len(active_specialty_ids)
            else:
                actual = len(constraint.details.get("available_specialty_ids", []))
            if actual < required:
                feasible = False
                diagnostics.append(
                    Diagnostic(
                        type="required_specialty_count",
                        severity="error",
                        related_course_ids=[],
                        related_bucket_ids=["specialty"],
                        message_en="Required specialty count is not satisfiable.",
                    )
                )

    return feasible, diagnostics
