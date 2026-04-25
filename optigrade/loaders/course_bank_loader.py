"""Build course bank offerings from raw catalog JSON."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from optigrade.domain.course import CourseOffering, CreditValue, validate_course_id
from optigrade.validation.course_bank_validator import validate_course_bank

CourseBank = dict[tuple[str, str], CourseOffering]


def load_course_bank_from_paths(paths: list[str | Path]) -> CourseBank:
    raw_catalogs: list[dict[str, Any]] = []
    for path in paths:
        with Path(path).open("r", encoding="utf-8") as file:
            raw_catalogs.append(json.load(file))
    return build_course_bank_from_catalogs(raw_catalogs)


def build_course_bank_from_catalogs(raw_catalogs: list[dict[str, Any]]) -> CourseBank:
    course_bank: CourseBank = {}
    for raw_catalog in raw_catalogs:
        term = _normalize_term_or_year(raw_catalog.get("academicYear"))
        for entry in _iter_course_entries(raw_catalog):
            course_id = validate_course_id(entry.get("code"))
            credits = CreditValue.from_credits(entry.get("credits")).credits
            credit_units = CreditValue.from_credits(credits).credit_units
            key = (course_id, term)

            if key in course_bank:
                existing = course_bank[key]
                if existing.credit_units != credit_units:
                    raise ValueError(
                        f"conflicting credits for course_id={course_id}, term={term}"
                    )
                continue

            course_bank[key] = CourseOffering(
                course_id=course_id,
                term=term,
                credits=credits,
                credit_units=credit_units,
                name_en=entry.get("nameEn"),
                name_he=entry.get("nameHe"),
                metadata=entry.get("metadata", {}),
                archived=bool(entry.get("archived", False)),
            )

    validate_course_bank(course_bank)
    return course_bank


def _normalize_term_or_year(raw_value: Any) -> str:
    if not isinstance(raw_value, str) or not raw_value.strip():
        raise ValueError("catalog academicYear is required")
    stripped = raw_value.strip()
    if "/" in stripped:
        start_year = stripped.split("/", maxsplit=1)[0]
        if not start_year.isdigit():
            raise ValueError(f"invalid academicYear value: {raw_value}")
        return f"{start_year}_fall"
    return stripped.lower()


def _iter_course_entries(raw_catalog: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    entries.extend(raw_catalog.get("mandatory", []))
    entries.extend(raw_catalog.get("core", []))
    entries.extend(raw_catalog.get("facultyChoice", []))
    for specialty in raw_catalog.get("specialties", []):
        entries.extend(specialty.get("courses", []))
    return entries
