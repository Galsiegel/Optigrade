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
    selected_specialty_ids: set[str] | None = None,
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
                "course_instance_ids": [
                    instance_id
                    for (instance_id, bucket_id), _alloc_var in sorted(alloc_vars.items())
                    if bucket_id == "core"
                    and str(candidate_by_instance_id[instance_id].course_id)
                    in degree_catalog.core_course_ids
                ],
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

    available_specialty_ids = set(degree_catalog.specialties.keys())
    if selected_specialty_ids is None:
        active_specialty_ids = sorted(available_specialty_ids)
    else:
        active_specialty_ids = sorted(selected_specialty_ids.intersection(available_specialty_ids))
        constraints.append(
            FinishModelConstraint(
                type="selected_specialties_enforced",
                details={
                    "selected_specialty_ids": sorted(selected_specialty_ids),
                    "active_specialty_ids": active_specialty_ids,
                },
            )
        )

    constraints.append(
        FinishModelConstraint(
            type="required_specialty_count",
            details={
                "required_specialty_count": degree_catalog.required_specialty_count,
                "active_specialty_ids": active_specialty_ids,
            },
        )
    )

    for specialty_id in active_specialty_ids:
        specialty = degree_catalog.specialties[specialty_id]
        specialty_alloc_vars = [
            alloc_var
            for (instance_id, bucket_id), alloc_var in sorted(alloc_vars.items())
            if bucket_id == f"specialty:{specialty_id}"
            and str(candidate_by_instance_id[instance_id].course_id)
            in specialty.eligible_course_ids
        ]
        constraints.append(
            FinishModelConstraint(
                type="specialty_visible_minimum",
                details={
                    "specialty_id": specialty_id,
                    "alloc_vars": specialty_alloc_vars,
                    "minimum_total_courses": specialty.minimum_total_courses,
                },
            )
        )

        for mandatory_course_id in specialty.mandatory_courses:
            mandatory_x_vars = [
                x_vars[candidate.course_instance_id]
                for candidate in candidates
                if str(candidate.course_id) == mandatory_course_id
            ]
            constraints.append(
                FinishModelConstraint(
                    type="specialty_mandatory",
                    details={
                        "specialty_id": specialty_id,
                        "course_id": mandatory_course_id,
                        "x_vars": mandatory_x_vars,
                        "min_selected": 1,
                    },
                )
            )

        for group_index, choose_group in enumerate(specialty.choose_groups):
            group_x_vars = [
                x_vars[candidate.course_instance_id]
                for candidate in candidates
                if str(candidate.course_id) in choose_group.courses
            ]
            constraints.append(
                FinishModelConstraint(
                    type="specialty_choose_group",
                    details={
                        "specialty_id": specialty_id,
                        "group_index": group_index,
                        "group_courses": list(choose_group.courses),
                        "x_vars": group_x_vars,
                        "required_count": choose_group.required_count,
                    },
                )
            )

    return FinishModelContext(x_vars=x_vars, alloc_vars=alloc_vars, constraints=constraints)
