"""Load student profiles from parsed transcript/manual-tag payloads."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from optigrade.domain.student import (
    CourseInstanceStatus,
    ManualCourseTag,
    StudentCourseInstance,
    StudentProfile,
)
from optigrade.validation.student_validator import validate_student_profile


def load_student_profile_from_path(path: str | Path) -> StudentProfile:
    with Path(path).open("r", encoding="utf-8") as file:
        raw_profile = json.load(file)
    return load_student_profile_from_dict(raw_profile)


def load_student_profile_from_dict(raw_profile: dict[str, Any]) -> StudentProfile:
    student_id = str(raw_profile.get("student_id", "")).strip()
    degree_start_year = _infer_degree_start_year(raw_profile.get("courses", []))

    all_instances = _build_course_instances(raw_profile.get("courses", []))
    manual_tags = _build_manual_tags(raw_profile.get("manual_tags", []))

    profile = StudentProfile(
        student_id=student_id,
        degree_start_year=degree_start_year,
        completed_courses=all_instances,
        manual_tags=manual_tags,
    )
    validate_student_profile(profile)
    return profile


def _build_course_instances(raw_courses: list[dict[str, Any]]) -> list[StudentCourseInstance]:
    built: list[StudentCourseInstance] = []
    non_sports_seen: set[str] = set()

    for index, course in enumerate(raw_courses):
        course_id = str(course.get("course_id", "")).strip()
        term = _to_term_id(course.get("semester"))
        credits = 0 if course.get("credits") is None else course.get("credits")
        status = _grade_to_status(course.get("grade"))
        is_sports = course_id.startswith("394")
        if not is_sports and course_id in non_sports_seen:
            status = CourseInstanceStatus.DUPLICATE_IGNORED
        elif not is_sports and status == CourseInstanceStatus.RECOGNIZED_PASSED:
            non_sports_seen.add(course_id)

        eligible_buckets = {"sports"} if is_sports else {"enrichment"}
        built.append(
            StudentCourseInstance(
                course_instance_id=f"transcript_{index}",
                course_id=course_id,
                term=term,
                credits=credits,
                credit_units=int(float(credits) * 2),
                status=status,
                source="transcript",
                verified=True,
                eligible_bucket_ids=eligible_buckets,
                comment=course.get("name"),
            )
        )
    return built


def _build_manual_tags(raw_manual_tags: list[dict[str, Any]]) -> list[ManualCourseTag]:
    tags: list[ManualCourseTag] = []
    for item in raw_manual_tags:
        tags.append(
            ManualCourseTag(
                course_code=item["course_code"],
                credits=item["credits"],
                bucket_types=set(item.get("bucket_types", [])),
                comment=item.get("comment"),
            )
        )
    return tags


def _grade_to_status(grade: Any) -> CourseInstanceStatus:
    grade_str = str(grade).strip().lower()
    if not grade_str:
        return CourseInstanceStatus.UNKNOWN_UNRESOLVED
    if grade_str.isdigit():
        return (
            CourseInstanceStatus.RECOGNIZED_PASSED
            if int(grade_str) >= 55
            else CourseInstanceStatus.RECOGNIZED_FAILED
        )
    if grade_str in {"pass", "exemption with points", "exemption without points"}:
        return CourseInstanceStatus.RECOGNIZED_PASSED
    return CourseInstanceStatus.UNKNOWN_UNRESOLVED


def _to_term_id(raw_semester: Any) -> str:
    if raw_semester is None:
        return "2023_spring"
    text = str(raw_semester).strip().lower()
    season = "spring"
    if "winter" in text:
        season = "winter"
    elif "fall" in text:
        season = "fall"
    elif "summer" in text:
        season = "summer"
    year = "".join(char for char in text[:4] if char.isdigit()) or "2023"
    return f"{year}_{season}"


def _infer_degree_start_year(raw_courses: list[dict[str, Any]]) -> int:
    years: list[int] = []
    for course in raw_courses:
        semester = str(course.get("semester", ""))
        maybe_year = semester[:4]
        if maybe_year.isdigit():
            years.append(int(maybe_year))
    return min(years) if years else 2023
