from decimal import Decimal

from optigrade.domain.student import (
    CourseInstanceStatus,
    ManualCourseTag,
    StudentCourseInstance,
)


def test_failed_course_is_not_solver_eligible() -> None:
    instance = StudentCourseInstance(
        course_instance_id="ci-1",
        course_id="044101",
        term="2023_spring",
        credits=Decimal("3.5"),
        credit_units=7,
        status=CourseInstanceStatus.RECOGNIZED_FAILED,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"mandatory"},
    )
    assert instance.is_solver_eligible is False


def test_unknown_student_tagged_is_solver_eligible_and_unverified() -> None:
    instance = StudentCourseInstance(
        course_instance_id="ci-2",
        course_id="999001",
        term=None,
        credits=Decimal("2.0"),
        credit_units=4,
        status=CourseInstanceStatus.UNKNOWN_STUDENT_TAGGED,
        source="manual_tag",
        verified=False,
        eligible_bucket_ids={"enrichment"},
    )
    assert instance.is_solver_eligible is True
    assert instance.verified is False


def test_manual_course_tag_validates_bucket_types() -> None:
    tag = ManualCourseTag(
        course_code="999002",
        credits=Decimal("1.5"),
        bucket_types={"free_choice", "sports"},
        comment="Approved by student",
    )
    assert tag.bucket_types == {"enrichment", "sports"}


def test_student_course_instance_allows_context_deferred_bucket_ids() -> None:
    instance = StudentCourseInstance(
        course_instance_id="ci-3",
        course_id="044101",
        term="2023_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids=set(),
    )
    assert instance.eligible_bucket_ids == set()
