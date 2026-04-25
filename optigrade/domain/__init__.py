"""Domain primitives for backend-first architecture."""

from .bucket import (
    VALID_BUCKET_IDS,
    normalize_bucket_id,
    parse_specialty_bucket_id,
    validate_bucket_id,
)
from .catalog import DegreeCatalog
from .course import (
    CourseId,
    CourseOffering,
    CreditValue,
    TermId,
    normalize_term_id,
    validate_course_id,
)
from .rules import ChooseGroupRule, SpecialtyRule
from .simulation import FinishSimulationInput, FutureAvailabilityPool
from .student import (
    CourseInstanceStatus,
    ManualCourseTag,
    StudentCourseInstance,
    StudentProfile,
)

__all__ = [
    "CourseId",
    "TermId",
    "CreditValue",
    "CourseOffering",
    "normalize_term_id",
    "validate_course_id",
    "DegreeCatalog",
    "ChooseGroupRule",
    "SpecialtyRule",
    "FinishSimulationInput",
    "FutureAvailabilityPool",
    "VALID_BUCKET_IDS",
    "normalize_bucket_id",
    "parse_specialty_bucket_id",
    "validate_bucket_id",
    "CourseInstanceStatus",
    "StudentCourseInstance",
    "ManualCourseTag",
    "StudentProfile",
]
