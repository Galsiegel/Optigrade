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
    del degree_catalog  # Kept in signature for upcoming milestone constraints.

    x_vars: dict[str, str] = {}
    alloc_vars: dict[tuple[str, str], str] = {}
    constraints: list[FinishModelConstraint] = []

    for candidate in candidates:
        x_var = f"x_{candidate.course_instance_id}"
        x_vars[candidate.course_instance_id] = x_var

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

    return FinishModelContext(x_vars=x_vars, alloc_vars=alloc_vars, constraints=constraints)
