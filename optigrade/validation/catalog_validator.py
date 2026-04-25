"""Catalog-level validation rules."""

from __future__ import annotations

from optigrade.domain.catalog import DegreeCatalog


def validate_degree_catalog(catalog: DegreeCatalog) -> None:
    if catalog.required_specialty_count > len(catalog.specialties):
        raise ValueError("required_specialty_count cannot exceed available specialties")

    all_known_course_ids = (
        set(catalog.mandatory_course_ids)
        | set(catalog.core_course_ids)
        | set(catalog.faculty_choice_course_ids)
    )

    for specialty_id, specialty in catalog.specialties.items():
        if specialty.minimum_total_courses > len(specialty.eligible_course_ids):
            raise ValueError(
                f"specialty {specialty_id} has minimum_total_courses larger than eligible set"
            )
        for group in specialty.choose_groups:
            if group.required_count > 0 and not set(group.courses).intersection(
                specialty.eligible_course_ids
            ):
                raise ValueError(
                    f"specialty {specialty_id} choose-group has no eligible courses"
                )
        all_known_course_ids |= specialty.eligible_course_ids

    for mandatory_course_id in catalog.mandatory_course_ids:
        if mandatory_course_id not in all_known_course_ids:
            raise ValueError(
                f"mandatory course {mandatory_course_id} is missing from known offerings"
            )
