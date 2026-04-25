"""Degree catalog domain model."""

from __future__ import annotations

from dataclasses import dataclass, field

from .course import CourseId, validate_course_id
from .rules import SpecialtyRule


@dataclass(frozen=True)
class DegreeCatalog:
    degree_id: str
    academic_year: int
    program_name: str
    total_credit_units: int
    mandatory_course_ids: set[CourseId]
    core_course_ids: set[CourseId]
    required_core_count: int
    required_specialty_count: int
    specialties: dict[str, SpecialtyRule]
    faculty_choice_course_ids: set[CourseId] = field(default_factory=set)
    enrichment_min_credit_units: int = 0
    sports_min_credit_units: int = 0
    malag_min_credit_units: int = 0
    project_rules: list[object] = field(default_factory=list)
    lab_rules: list[object] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.degree_id.strip():
            raise ValueError("degree_id cannot be empty")
        if self.academic_year < 2000:
            raise ValueError("academic_year must be a valid year")
        if self.total_credit_units < 0:
            raise ValueError("total_credit_units cannot be negative")
        if self.required_core_count < 0:
            raise ValueError("required_core_count cannot be negative")
        if self.required_specialty_count < 0:
            raise ValueError("required_specialty_count cannot be negative")

        mandatory_ids = {validate_course_id(course_id) for course_id in self.mandatory_course_ids}
        core_ids = {validate_course_id(course_id) for course_id in self.core_course_ids}
        faculty_ids = {validate_course_id(course_id) for course_id in self.faculty_choice_course_ids}
        object.__setattr__(self, "mandatory_course_ids", mandatory_ids)
        object.__setattr__(self, "core_course_ids", core_ids)
        object.__setattr__(self, "faculty_choice_course_ids", faculty_ids)
