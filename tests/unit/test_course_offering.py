from decimal import Decimal

from optigrade.domain.course import CourseOffering


def test_course_offering_valid() -> None:
    offering = CourseOffering(
        course_id="044101",
        term="2023_spring",
        credits=Decimal("3.5"),
        credit_units=7,
        name_en="Intro to CS",
    )
    assert offering.course_id == "044101"
    assert offering.term == "2023_spring"
    assert offering.archived is False


def test_course_offering_rejects_invalid_term() -> None:
    try:
        CourseOffering(
            course_id="044101",
            term="spring_2023",
            credits=Decimal("3"),
            credit_units=6,
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for invalid term")


def test_course_offering_rejects_mismatched_credit_units() -> None:
    try:
        CourseOffering(
            course_id="044101",
            term="2023_spring",
            credits=Decimal("3.5"),
            credit_units=6,
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for mismatched credit units")
