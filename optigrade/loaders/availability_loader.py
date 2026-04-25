"""Load future availability pool from raw JSON-like structures."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from optigrade.domain.course import CourseOffering, CreditValue, validate_course_id
from optigrade.domain.simulation import FutureAvailabilityPool


def load_availability_pool_from_path(path: str | Path) -> FutureAvailabilityPool:
    with Path(path).open("r", encoding="utf-8") as file:
        raw_data = json.load(file)
    return load_availability_pool_from_dict(raw_data)


def load_availability_pool_from_dict(raw_data: dict[str, Any]) -> FutureAvailabilityPool:
    raw_semesters = raw_data.get("semesters", raw_data)
    semesters: dict[str, list[CourseOffering]] = {}
    for semester, entries in raw_semesters.items():
        offerings: list[CourseOffering] = []
        for index, entry in enumerate(entries):
            if bool(entry.get("archived", False)):
                continue
            credits = CreditValue.from_credits(entry["credits"])
            offerings.append(
                CourseOffering(
                    course_id=validate_course_id(entry["code"]),
                    term=semester,
                    credits=credits.credits,
                    credit_units=credits.credit_units,
                    name_en=entry.get("nameEn"),
                    name_he=entry.get("nameHe"),
                    metadata={
                        "availability_index": index,
                        **entry.get("metadata", {}),
                    },
                    archived=False,
                )
            )
        semesters[semester] = offerings
    return FutureAvailabilityPool(semesters=semesters)
