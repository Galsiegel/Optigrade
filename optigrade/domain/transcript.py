"""Transcript parsing and manual-tag audit domain models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

from .course import CreditValue, validate_course_id
from .student import CourseInstanceStatus


@dataclass(frozen=True)
class ParsedTranscriptCourse:
    course_id: str
    name: str | None
    term: str | None
    credits: Decimal | None
    grade: str | int | None
    parser_status: CourseInstanceStatus

    def __post_init__(self) -> None:
        object.__setattr__(self, "course_id", validate_course_id(self.course_id))
        if self.credits is not None:
            object.__setattr__(self, "credits", CreditValue.from_credits(self.credits).credits)


@dataclass(frozen=True)
class ParsedTranscript:
    student_name: str | None
    student_id_number: str | None
    courses: list[ParsedTranscriptCourse] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ManualTagAuditRecord:
    student_id: str
    course_code: str
    credits: Decimal
    bucket_types: list[str]
    comment: str | None
    degree_id: str | None
    catalog_year: int | None
    created_at: datetime
    used_in_successful_export: bool = False

    def __post_init__(self) -> None:
        if not self.student_id.strip():
            raise ValueError("student_id cannot be empty")
        object.__setattr__(self, "course_code", validate_course_id(self.course_code))
        object.__setattr__(self, "credits", CreditValue.from_credits(self.credits).credits)
        if not self.bucket_types:
            raise ValueError("bucket_types cannot be empty")
