"""Simulation input models and planning availability primitives."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .catalog import DegreeCatalog
from .course import CourseOffering, normalize_term_id
from .student import StudentProfile


@dataclass(frozen=True)
class FinishSimulationInput:
    student_profile: StudentProfile
    degree_catalog: DegreeCatalog
    selected_specialty_ids: set[str] | None
    strategy: Literal["selected_only", "try_all_from_start_to_current"] = "selected_only"


@dataclass(frozen=True)
class CreditSummary:
    total_selected_credit_units: int
    total_selected_courses: int


@dataclass(frozen=True)
class BucketAssignment:
    course_instance_id: str
    course_id: str
    bucket_id: str


@dataclass(frozen=True)
class CourseResult:
    course_instance_id: str
    course_id: str
    verified: bool


@dataclass(frozen=True)
class Diagnostic:
    type: str
    severity: str
    related_course_ids: list[str]
    related_bucket_ids: list[str]
    message_en: str
    message_he: str | None = None


@dataclass(frozen=True)
class FinishSimulationResult:
    status: str
    summary: CreditSummary
    bucket_assignments: list[BucketAssignment]
    extra_unused_courses: list[CourseResult]
    manual_unverified_courses: list[CourseResult]
    warnings: list[str] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)


@dataclass(frozen=True)
class FutureAvailabilityPool:
    semesters: dict[str, list[CourseOffering]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        normalized: dict[str, list[CourseOffering]] = {}
        for semester, offerings in self.semesters.items():
            normalized_term = normalize_term_id(semester)
            normalized[normalized_term] = list(offerings)
        object.__setattr__(self, "semesters", normalized)

    def all_offerings(self) -> list[CourseOffering]:
        offerings: list[CourseOffering] = []
        for semester_offerings in self.semesters.values():
            offerings.extend(semester_offerings)
        return offerings


@dataclass(frozen=True)
class PlanningSimulationInput:
    student_profile: StudentProfile
    degree_catalog: DegreeCatalog
    future_availability_pool: FutureAvailabilityPool
    selected_specialty_ids: set[str] | None
    locked_course_offering_ids: set[str] = field(default_factory=set)
    blocked_course_ids: set[str] = field(default_factory=set)
    num_plans: int = 2


@dataclass(frozen=True)
class PlanningSuggestedCourse:
    course_instance_id: str
    course_id: str
    term: str
    credit_units: int
    locked_by_student: bool = False


@dataclass(frozen=True)
class PlanningPlan:
    rank: int
    future_credit_units: int
    future_course_count: int
    suggested_courses: list[PlanningSuggestedCourse]
    bucket_assignments: list[BucketAssignment]
    rule_statuses: list[object] = field(default_factory=list)
    generic_missing_requirements: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class PlanningSimulationResult:
    status: Literal["optimal", "infeasible"]
    plans: list[PlanningPlan] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
