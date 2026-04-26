from __future__ import annotations

from classes.student import StudentCourse


def test_numeric_grade_helpers() -> None:
    course = StudentCourse(
        course_id="044101",
        name="Intro",
        credits=3.0,
        grade="95",
        semester="2022-2023 Winter",
    )
    assert course.is_numeric_grade is True
    assert course.numeric_grade == 95
    assert course.is_pass is False
    assert course.is_exemption is False


def test_non_numeric_grade_helpers() -> None:
    course = StudentCourse(
        course_id="044102",
        name="Pass Course",
        credits=2.0,
        grade="Pass",
        semester="2022-2023 Spring",
    )
    assert course.is_numeric_grade is False
    assert course.numeric_grade is None
    assert course.is_pass is True


def test_exemption_without_points_has_zero_effective_credits() -> None:
    course = StudentCourse(
        course_id="044103",
        name="Exempted",
        credits=None,
        grade="Exemption without points",
        semester="2022-2023 Spring",
    )
    assert course.is_exemption is True
    assert course.effective_credits == 0.0


def test_course_dict_roundtrip() -> None:
    original = StudentCourse(
        course_id="044104",
        name="Algorithms",
        credits=3.5,
        grade="87",
        semester="2023-2024 Winter",
    )
    rebuilt = StudentCourse.from_dict(original.to_dict())
    assert rebuilt == original
