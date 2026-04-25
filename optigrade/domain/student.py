"""Student-facing domain models used by solvers."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum

from .bucket import normalize_bucket_id
from .course import CourseId, CreditValue, TermId, normalize_term_id, validate_course_id


class CourseInstanceStatus(str, Enum):
    RECOGNIZED_PASSED = "recognized_passed"
    RECOGNIZED_FAILED = "recognized_failed"
    UNKNOWN_UNRESOLVED = "unknown_unresolved"
    UNKNOWN_STUDENT_TAGGED = "unknown_student_tagged"
    DUPLICATE_IGNORED = "duplicate_ignored"
    IGNORED = "ignored"


@dataclass(frozen=True)
class StudentCourseInstance:
    course_instance_id: str
    course_id: CourseId
    term: TermId | None
    credits: Decimal
    credit_units: int
    status: CourseInstanceStatus
    source: str
    verified: bool
    eligible_bucket_ids: set[str]
    comment: str | None = None

    def __post_init__(self) -> None:
        if not self.course_instance_id.strip():
            raise ValueError("course_instance_id cannot be empty")
        if not self.source.strip():
            raise ValueError("source cannot be empty")

        validated_course_id = validate_course_id(self.course_id)
        credit_value = CreditValue.from_credits(self.credits)
        if credit_value.credit_units != self.credit_units:
            raise ValueError("credit_units must match scaled credits")

        normalized_term: TermId | None = None
        if self.term is not None:
            normalized_term = normalize_term_id(self.term)

        normalized_bucket_ids = {normalize_bucket_id(bid) for bid in self.eligible_bucket_ids}
        if not normalized_bucket_ids:
            raise ValueError("eligible_bucket_ids cannot be empty")

        object.__setattr__(self, "course_id", validated_course_id)
        object.__setattr__(self, "term", normalized_term)
        object.__setattr__(self, "credits", credit_value.credits)
        object.__setattr__(self, "eligible_bucket_ids", normalized_bucket_ids)

    @property
    def is_solver_eligible(self) -> bool:
        return self.status in {
            CourseInstanceStatus.RECOGNIZED_PASSED,
            CourseInstanceStatus.UNKNOWN_STUDENT_TAGGED,
        }


@dataclass(frozen=True)
class ManualCourseTag:
    course_code: CourseId
    credits: Decimal
    bucket_types: set[str]
    comment: str | None = None

    def __post_init__(self) -> None:
        validated_course_code = validate_course_id(self.course_code)
        credit_value = CreditValue.from_credits(self.credits)
        if not self.bucket_types:
            raise ValueError("bucket_types cannot be empty")
        normalized_bucket_types = {normalize_bucket_id(bid) for bid in self.bucket_types}
        object.__setattr__(self, "course_code", validated_course_code)
        object.__setattr__(self, "credits", credit_value.credits)
        object.__setattr__(self, "bucket_types", normalized_bucket_types)


@dataclass
class StudentProfile:
    student_id: str
    degree_start_year: int
    completed_courses: list[StudentCourseInstance]
    manual_tags: list[ManualCourseTag]

    def solver_eligible_courses(self) -> list[StudentCourseInstance]:
        return [course for course in self.completed_courses if course.is_solver_eligible]

