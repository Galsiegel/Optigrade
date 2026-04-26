from __future__ import annotations

from decimal import Decimal

import pytest

from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance


def test_student_course_instance_validates_and_normalizes_fields() -> None:
    instance = StudentCourseInstance(
        course_instance_id="ci_044101_2023s",
        course_id="044101",
        term="2023_spring",
        credits=Decimal("3.5"),
        credit_units=7,
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"core", "enrichment"},
    )
    assert instance.course_id == "044101"
    assert instance.term == "2023_spring"
    assert instance.credit_units == 7
    assert "core" in instance.eligible_bucket_ids


def test_student_course_instance_rejects_mismatched_credit_units() -> None:
    with pytest.raises(ValueError, match="credit_units must match scaled credits"):
        StudentCourseInstance(
            course_instance_id="ci_bad",
            course_id="044101",
            term="2023_spring",
            credits=Decimal("3.5"),
            credit_units=6,
            status=CourseInstanceStatus.RECOGNIZED_PASSED,
            source="transcript",
            verified=True,
            eligible_bucket_ids={"core"},
        )


def test_solver_eligibility_for_statuses() -> None:
    passed = StudentCourseInstance(
        course_instance_id="ci_passed",
        course_id="044101",
        term="2023_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"core"},
    )
    failed = StudentCourseInstance(
        course_instance_id="ci_failed",
        course_id="044102",
        term="2023_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=CourseInstanceStatus.RECOGNIZED_FAILED,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"core"},
    )
    assert passed.is_solver_eligible is True
    assert failed.is_solver_eligible is False
