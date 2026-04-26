from __future__ import annotations

import pytest

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.rules import ChooseGroupRule, SpecialtyRule


def _ai_specialty() -> SpecialtyRule:
    return SpecialtyRule(
        specialty_id="ai",
        name_en="Artificial Intelligence",
        name_he=None,
        mandatory_courses=("046195",),
        choose_groups=(ChooseGroupRule(courses=("046200", "046201"), required_count=1),),
        minimum_total_courses=2,
        eligible_course_ids={"046195", "046200", "046201"},
    )


def test_degree_catalog_normalizes_course_ids_and_keeps_specialties() -> None:
    catalog = DegreeCatalog(
        degree_id="software_engineering",
        academic_year=2024,
        program_name="Software Engineering",
        total_credit_units=320,
        mandatory_course_ids={"044101"},
        core_course_ids={"044102"},
        required_core_count=1,
        required_specialty_count=1,
        specialties={"ai": _ai_specialty()},
        faculty_choice_course_ids={"044103"},
    )

    assert "044101" in catalog.mandatory_course_ids
    assert "044102" in catalog.core_course_ids
    assert "044103" in catalog.faculty_choice_course_ids
    assert "ai" in catalog.specialties
    assert catalog.specialties["ai"].minimum_total_courses == 2


def test_specialty_rule_requires_mandatory_subset_of_eligible() -> None:
    with pytest.raises(ValueError, match="mandatory_courses must be included"):
        SpecialtyRule(
            specialty_id="ai",
            name_en="Artificial Intelligence",
            name_he=None,
            mandatory_courses=("046999",),
            choose_groups=(),
            minimum_total_courses=1,
            eligible_course_ids={"046195", "046200"},
        )


def test_choose_group_rejects_required_count_above_course_count() -> None:
    with pytest.raises(ValueError, match="required_count cannot exceed"):
        ChooseGroupRule(courses=("046200",), required_count=2)
