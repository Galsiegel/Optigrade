from __future__ import annotations

from classes.student import StudentCourse, StudentProfile


def _sample_profile() -> StudentProfile:
    return StudentProfile(
        student_name="Gal",
        student_id="12345",
        degree_name="Software Engineering",
        faculty_name="Engineering",
        accumulated_credits=9.5,
        required_credits=159.5,
        gpa=88.2,
        courses=[
            StudentCourse(
                course_id="044101",
                name="Intro",
                credits=3.0,
                grade="90",
                semester="2022-2023 Winter",
            ),
            StudentCourse(
                course_id="394800",
                name="Sports A",
                credits=1.0,
                grade="Pass",
                semester="2022-2023 Winter",
            ),
            StudentCourse(
                course_id="394800",
                name="Sports A",
                credits=1.0,
                grade="Pass",
                semester="2023-2024 Winter",
            ),
        ],
    )


def test_passed_course_ids_are_unique() -> None:
    profile = _sample_profile()
    assert profile.passed_course_ids == {"044101", "394800"}


def test_course_credits_are_keyed_by_course_and_semester() -> None:
    profile = _sample_profile()
    assert profile.course_credits[("394800", "2022-2023 Winter")] == 1.0
    assert profile.course_credits[("394800", "2023-2024 Winter")] == 1.0
    assert len(profile.course_credits) == 3


def test_get_course_returns_first_match_or_none() -> None:
    profile = _sample_profile()
    assert profile.get_course("044101") is not None
    assert profile.get_course("999999") is None


def test_profile_json_roundtrip(tmp_path) -> None:
    profile = _sample_profile()
    target = tmp_path / "student_profile.json"
    profile.save_json(str(target))
    loaded = StudentProfile.load_json(str(target))
    assert loaded.to_dict() == profile.to_dict()
