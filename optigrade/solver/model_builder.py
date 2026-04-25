"""Solver-agnostic model builder for finish-degree baseline constraints."""

from __future__ import annotations

from dataclasses import dataclass

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.student import StudentCourseInstance


@dataclass(frozen=True)
class FinishModelConstraint:
    type: str
    details: dict[str, object]


@dataclass(frozen=True)
class FinishModelContext:
    x_vars: dict[str, str]
    alloc_vars: dict[tuple[str, str], str]
    constraints: list[FinishModelConstraint]


def build_finish_model(
    candidates: list[StudentCourseInstance],
    degree_catalog: DegreeCatalog,
) -> FinishModelContext:
    x_vars: dict[str, str] = {}
    alloc_vars: dict[tuple[str, str], str] = {}
    constraints: list[FinishModelConstraint] = []
    candidate_by_instance_id: dict[str, StudentCourseInstance] = {}

    for candidate in candidates:
        x_var = f"x_{candidate.course_instance_id}"
        x_vars[candidate.course_instance_id] = x_var
        candidate_by_instance_id[candidate.course_instance_id] = candidate

        for bucket_id in sorted(candidate.eligible_bucket_ids):
            alloc_key = (candidate.course_instance_id, bucket_id)
            alloc_var = f"alloc_{candidate.course_instance_id}_{bucket_id}"
            alloc_vars[alloc_key] = alloc_var
            constraints.append(
                FinishModelConstraint(
                    type="alloc_implies_selected",
                    details={
                        "course_instance_id": candidate.course_instance_id,
                        "bucket_id": bucket_id,
                        "alloc_var": alloc_var,
                        "x_var": x_var,
                    },
                )
            )

        constraints.append(
            FinishModelConstraint(
                type="one_visible_bucket",
                details={
                    "course_instance_id": candidate.course_instance_id,
                    "alloc_vars": [
                        alloc_vars[(candidate.course_instance_id, bucket_id)]
                        for bucket_id in sorted(candidate.eligible_bucket_ids)
                    ],
                    "max_visible_buckets": 1,
                },
            )
        )

    for mandatory_course_id in sorted(degree_catalog.mandatory_course_ids):
        matching_x_vars = [
            x_vars[candidate.course_instance_id]
            for candidate in candidates
            if str(candidate.course_id) == mandatory_course_id
        ]
        constraints.append(
            FinishModelConstraint(
                type="mandatory_completion",
                details={
                    "course_id": mandatory_course_id,
                    "x_vars": matching_x_vars,
                    "min_selected": 1,
                },
            )
        )

    core_alloc_vars = [
        alloc_var
        for (instance_id, bucket_id), alloc_var in sorted(alloc_vars.items())
        if bucket_id == "core"
        and str(candidate_by_instance_id[instance_id].course_id)
        in degree_catalog.core_course_ids
    ]
    constraints.append(
        FinishModelConstraint(
            type="core_count_minimum",
            details={
                "alloc_vars": core_alloc_vars,
                "required_core_count": degree_catalog.required_core_count,
            },
        )
    )

    total_credit_terms = [
        {
            "x_var": x_vars[candidate.course_instance_id],
            "credit_units": candidate.credit_units,
            "course_instance_id": candidate.course_instance_id,
        }
        for candidate in candidates
    ]
    constraints.append(
        FinishModelConstraint(
            type="total_credit_minimum",
            details={
                "terms": total_credit_terms,
                "required_total_credit_units": degree_catalog.total_credit_units,
            },
        )
    )

    return FinishModelContext(x_vars=x_vars, alloc_vars=alloc_vars, constraints=constraints)
