"""Course and term domain primitives."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
import re
from typing import Any, NewType

CourseId = NewType("CourseId", str)
TermId = NewType("TermId", str)

_VALID_TERM_PATTERN = re.compile(r"^\d{4}_(winter|spring|summer|fall)$")


def validate_course_id(raw_course_id: str) -> CourseId:
    """Validate and return a course id while preserving leading zeroes."""
    if not isinstance(raw_course_id, str):
        raise TypeError("course_id must be a string")
    if not raw_course_id.strip():
        raise ValueError("course_id cannot be empty")
    return CourseId(raw_course_id.strip())


def normalize_term_id(raw_term: str) -> TermId:
    """Normalize and validate term ids like 2023_spring."""
    if not isinstance(raw_term, str):
        raise TypeError("term must be a string")
    normalized = raw_term.strip().lower()
    if not _VALID_TERM_PATTERN.fullmatch(normalized):
        raise ValueError(
            "term must match <year>_<season>, for example: 2023_spring"
        )
    return TermId(normalized)


@dataclass(frozen=True)
class CreditValue:
    credits: Decimal
    credit_units: int

    @classmethod
    def from_credits(cls, raw_credits: Decimal | int | float | str) -> "CreditValue":
        if isinstance(raw_credits, Decimal):
            credits = raw_credits
        elif isinstance(raw_credits, (int, str, float)):
            credits = Decimal(str(raw_credits))
        else:
            raise TypeError("credits must be Decimal, int, float, or string")

        if credits < Decimal("0"):
            raise ValueError("credits cannot be negative")

        doubled = credits * 2
        if doubled != doubled.to_integral_value():
            raise ValueError("credits must be in .0 or .5 increments")
        return cls(credits=credits, credit_units=int(doubled))


@dataclass(frozen=True)
class CourseOffering:
    course_id: CourseId
    term: TermId
    credits: Decimal
    credit_units: int
    name_en: str | None = None
    name_he: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    archived: bool = False

    def __post_init__(self) -> None:
        validated_course_id = validate_course_id(self.course_id)
        normalized_term = normalize_term_id(self.term)
        credit_value = CreditValue.from_credits(self.credits)
        if credit_value.credit_units != self.credit_units:
            raise ValueError("credit_units must match scaled credits")
        object.__setattr__(self, "course_id", validated_course_id)
        object.__setattr__(self, "term", normalized_term)
        object.__setattr__(self, "credits", credit_value.credits)

