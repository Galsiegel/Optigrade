from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.rules import SpecialtyRule
from optigrade.validation.catalog_validator import validate_degree_catalog


def test_degree_catalog_allows_zero_credit_mandatory_course() -> None:
    catalog = DegreeCatalog(
        degree_id="computer_software_engineering",
        academic_year=2022,
        program_name="B.Sc in Computer and Software Engineering",
        total_credit_units=319,
        mandatory_course_ids={"044102"},
        core_course_ids=set(),
        required_core_count=0,
        required_specialty_count=0,
        specialties={},
    )
    validate_degree_catalog(catalog)
    assert "044102" in catalog.mandatory_course_ids


def test_degree_catalog_rejects_impossible_specialty_requirement() -> None:
    catalog = DegreeCatalog(
        degree_id="computer_software_engineering",
        academic_year=2022,
        program_name="B.Sc in Computer and Software Engineering",
        total_credit_units=319,
        mandatory_course_ids=set(),
        core_course_ids=set(),
        required_core_count=0,
        required_specialty_count=2,
        specialties={
            "specialty_ai": SpecialtyRule(
                specialty_id="specialty_ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=(),
                choose_groups=(),
                minimum_total_courses=0,
                eligible_course_ids=set(),
            )
        },
    )
    try:
        validate_degree_catalog(catalog)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for impossible specialty count")
