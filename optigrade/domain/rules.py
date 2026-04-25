"""Domain rules for specialties and choose-groups."""

from __future__ import annotations

from dataclasses import dataclass

from .course import CourseId, validate_course_id


@dataclass(frozen=True)
class ChooseGroupRule:
    courses: tuple[CourseId, ...]
    required_count: int

    def __post_init__(self) -> None:
        if self.required_count < 0:
            raise ValueError("required_count cannot be negative")
        normalized_courses = tuple(validate_course_id(course_id) for course_id in self.courses)
        if not normalized_courses:
            raise ValueError("choose-group must include at least one course")
        if self.required_count > len(normalized_courses):
            raise ValueError("required_count cannot exceed number of courses in group")
        object.__setattr__(self, "courses", normalized_courses)


@dataclass(frozen=True)
class SpecialtyRule:
    specialty_id: str
    name_en: str
    name_he: str | None
    mandatory_courses: tuple[CourseId, ...]
    choose_groups: tuple[ChooseGroupRule, ...]
    minimum_total_courses: int
    eligible_course_ids: set[CourseId]

    def __post_init__(self) -> None:
        if not self.specialty_id.strip():
            raise ValueError("specialty_id cannot be empty")
        if self.minimum_total_courses < 0:
            raise ValueError("minimum_total_courses cannot be negative")
        if not self.name_en.strip():
            raise ValueError("specialty name_en cannot be empty")

        mandatory_courses = tuple(validate_course_id(course_id) for course_id in self.mandatory_courses)
        eligible_course_ids = {validate_course_id(course_id) for course_id in self.eligible_course_ids}
        if not set(mandatory_courses).issubset(eligible_course_ids):
            raise ValueError("mandatory_courses must be included in eligible_course_ids")

        object.__setattr__(self, "mandatory_courses", mandatory_courses)
        object.__setattr__(self, "eligible_course_ids", eligible_course_ids)
