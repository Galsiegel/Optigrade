from pathlib import Path

from optigrade.loaders.student_loader import (
    load_student_profile_from_dict,
    load_student_profile_from_path,
)
from optigrade.domain.student import CourseInstanceStatus


def test_student_loader_marks_failed_and_unresolved_as_not_eligible() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s1",
            "courses": [
                {"course_id": "044101", "credits": 3.0, "grade": "40", "semester": "2022-2023 Winter"},
                {"course_id": "044102", "credits": 0.0, "grade": "", "semester": "2022-2023 Spring"},
            ],
        }
    )
    statuses = [course.status for course in profile.completed_courses]
    assert statuses == [
        CourseInstanceStatus.RECOGNIZED_FAILED,
        CourseInstanceStatus.UNKNOWN_UNRESOLVED,
    ]
    assert all(not course.is_solver_eligible for course in profile.completed_courses)


def test_student_loader_non_sports_duplicates_count_once() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s1",
            "courses": [
                {"course_id": "046195", "credits": 3.5, "grade": "90", "semester": "2023-2024 Winter"},
                {"course_id": "046195", "credits": 3.5, "grade": "92", "semester": "2024-2025 Winter"},
            ],
        }
    )
    assert profile.completed_courses[0].status == CourseInstanceStatus.RECOGNIZED_PASSED
    assert profile.completed_courses[1].status == CourseInstanceStatus.DUPLICATE_IGNORED


def test_student_loader_defers_non_sports_bucket_eligibility() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s_bucket_context",
            "courses": [
                {"course_id": "046195", "credits": 3.5, "grade": "90", "semester": "2023-2024 Winter"},
            ],
        }
    )
    assert profile.completed_courses[0].eligible_bucket_ids == set()


def test_student_loader_sports_duplicates_are_preserved() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s1",
            "courses": [
                {"course_id": "3940800", "credits": 1.0, "grade": "98", "semester": "2022-2023 Winter"},
                {"course_id": "3940800", "credits": 1.0, "grade": "99", "semester": "2023-2024 Winter"},
            ],
        }
    )
    assert profile.completed_courses[0].status == CourseInstanceStatus.RECOGNIZED_PASSED
    assert profile.completed_courses[1].status == CourseInstanceStatus.RECOGNIZED_PASSED


def test_student_loader_path_and_manual_tags(tmp_path: Path) -> None:
    raw = {
        "student_id": "s2",
        "courses": [
            {"course_id": "044101", "credits": 3.0, "grade": "88", "semester": "2022-2023 Spring"}
        ],
        "manual_tags": [
            {
                "course_code": "999001",
                "credits": 2.0,
                "bucket_types": ["enrichment"],
                "comment": "manual",
            }
        ],
    }
    path = tmp_path / "student.json"
    path.write_text(__import__("json").dumps(raw), encoding="utf-8")
    profile = load_student_profile_from_path(path)
    assert profile.student_id == "s2"
    assert len(profile.manual_tags) == 1
    assert profile.manual_tags[0].course_code == "999001"


def test_student_loader_parses_fall_semester_term_id() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s3",
            "courses": [
                {"course_id": "044103", "credits": 3.0, "grade": "91", "semester": "2022-2023 Fall"}
            ],
        }
    )
    assert profile.completed_courses[0].term == "2022_fall"


def test_student_loader_missing_semester_stays_none() -> None:
    profile = load_student_profile_from_dict(
        {
            "student_id": "s4",
            "courses": [
                {"course_id": "044104", "credits": 3.0, "grade": "91", "semester": None}
            ],
        }
    )
    assert profile.completed_courses[0].term is None


def test_student_loader_rejects_invalid_credit_increment() -> None:
    try:
        load_student_profile_from_dict(
            {
                "student_id": "s5",
                "courses": [
                    {"course_id": "044105", "credits": 3.25, "grade": "91", "semester": "2022-2023 Spring"}
                ],
            }
        )
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for invalid .25 credit increment")
