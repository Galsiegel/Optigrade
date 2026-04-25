"""Simulation input models and planning availability primitives."""

from __future__ import annotations

from dataclasses import dataclass, field

from .course import CourseOffering, normalize_term_id


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
