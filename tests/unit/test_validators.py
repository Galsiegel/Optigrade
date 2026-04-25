from decimal import Decimal

from optigrade.domain.course import CourseOffering
from optigrade.domain.student import (
    CourseInstanceStatus,
    ManualCourseTag,
    StudentCourseInstance,
    StudentProfile,
)
from optigrade.validation.course_bank_validator import validate_course_bank
from optigrade.validation.student_validator import validate_student_profile


def test_course_bank_validator_rejects_empty_term_key() -> None:
    bank = {
        ("046195", ""): CourseOffering(
            course_id="046195",
            term="2023_spring",
            credits=Decimal("3.5"),
            credit_units=7,
        )
    }
    try:
        validate_course_bank(bank)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for empty term key")


def test_student_validator_requires_manual_tag_bucket_types() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[
            StudentCourseInstance(
                course_instance_id="ci-1",
                course_id="046195",
                term="2023_spring",
                credits=Decimal("3.5"),
                credit_units=7,
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                source="transcript",
                verified=True,
                eligible_bucket_ids={"enrichment"},
            )
        ],
        manual_tags=[
            ManualCourseTag(
                course_code="999001",
                credits=Decimal("1.0"),
                bucket_types={"enrichment"},
            )
        ],
    )
    validate_student_profile(profile)
