"""Validation rules for student profile payloads."""

from __future__ import annotations

from optigrade.domain.student import CourseInstanceStatus, StudentProfile


def validate_student_profile(profile: StudentProfile) -> None:
    if not profile.student_id.strip():
        raise ValueError("student_id cannot be empty")
    if profile.degree_start_year < 2000:
        raise ValueError("degree_start_year is invalid")

    for course in profile.completed_courses:
        if course.status == CourseInstanceStatus.RECOGNIZED_PASSED and course.credits is None:
            raise ValueError("recognized_passed courses must have credits")
        if course.status == CourseInstanceStatus.UNKNOWN_UNRESOLVED and course.is_solver_eligible:
            raise ValueError("unknown_unresolved courses cannot be solver-eligible")
