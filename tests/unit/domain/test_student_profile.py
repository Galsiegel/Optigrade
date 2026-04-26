from __future__ import annotations

from decimal import Decimal

from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance, StudentProfile


def _instance(course_instance_id: str, course_id: str, status: CourseInstanceStatus) -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=course_instance_id,
        course_id=course_id,
        term="2023_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=status,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"core"},
    )


def test_solver_eligible_courses_filters_only_supported_statuses() -> None:
    profile = StudentProfile(
        student_id="12345",
        degree_start_year=2022,
        completed_courses=[
            _instance("ci_1", "044101", CourseInstanceStatus.RECOGNIZED_PASSED),
            _instance("ci_2", "044102", CourseInstanceStatus.RECOGNIZED_FAILED),
            _instance("ci_3", "044103", CourseInstanceStatus.UNKNOWN_STUDENT_TAGGED),
            _instance("ci_4", "044104", CourseInstanceStatus.UNKNOWN_UNRESOLVED),
        ],
        manual_tags=[],
    )
    eligible = profile.solver_eligible_courses()
    assert [course.course_instance_id for course in eligible] == ["ci_1", "ci_3"]


def test_profile_keeps_student_identity_fields() -> None:
    profile = StudentProfile(
        student_id="24680",
        degree_start_year=2021,
        completed_courses=[],
        manual_tags=[],
    )
    assert profile.student_id == "24680"
    assert profile.degree_start_year == 2021
