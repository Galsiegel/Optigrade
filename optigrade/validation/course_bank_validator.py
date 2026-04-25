"""Validation rules for normalized course-bank offerings."""

from __future__ import annotations

from optigrade.domain.course import CourseOffering, CreditValue, validate_course_id

CourseBank = dict[tuple[str, str], CourseOffering]


def validate_course_bank(course_bank: CourseBank) -> None:
    for (course_id, term), offering in course_bank.items():
        validate_course_id(course_id)
        if offering.course_id != course_id:
            raise ValueError("course bank key and offering course_id mismatch")
        if offering.term != term:
            raise ValueError("course bank key and offering term mismatch")
        if CreditValue.from_credits(offering.credits).credit_units != offering.credit_units:
            raise ValueError("offering credits and credit_units mismatch")
