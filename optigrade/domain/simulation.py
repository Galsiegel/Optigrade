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
