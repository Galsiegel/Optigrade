"""Load DegreeCatalog from syllabus JSON data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.course import CreditValue, validate_course_id
from optigrade.domain.rules import ChooseGroupRule, SpecialtyRule
from optigrade.validation.catalog_validator import validate_degree_catalog


def load_catalog_from_path(path: str | Path, degree_id: str) -> DegreeCatalog:
    with Path(path).open("r", encoding="utf-8") as file:
        raw_catalog = json.load(file)
    return load_catalog_from_dict(raw_catalog, degree_id=degree_id)


def load_catalog_from_dict(raw_catalog: dict[str, Any], degree_id: str) -> DegreeCatalog:
    general_rules = raw_catalog.get("generalRules", {})
    mandatory_course_ids = _extract_course_codes(raw_catalog.get("mandatory", []))
    core_course_ids = _extract_course_codes(raw_catalog.get("core", []))
    faculty_choice_course_ids = _extract_course_codes(raw_catalog.get("facultyChoice", []))
    specialties = _parse_specialties(raw_catalog.get("specialties", []))

    catalog = DegreeCatalog(
        degree_id=degree_id,
        academic_year=_parse_academic_year(raw_catalog["academicYear"]),
        program_name=raw_catalog.get("programName", degree_id),
        total_credit_units=CreditValue.from_credits(general_rules["totalCredits"]).credit_units,
        mandatory_course_ids=mandatory_course_ids,
        core_course_ids=core_course_ids,
        required_core_count=int(general_rules.get("mustChooseCoreGroups", 0)),
        required_specialty_count=int(general_rules.get("mustTakeSpecialities", 0)),
        specialties=specialties,
        faculty_choice_course_ids=faculty_choice_course_ids,
        enrichment_min_credit_units=CreditValue.from_credits(
            general_rules.get("enrichment", 0)
        ).credit_units,
        sports_min_credit_units=CreditValue.from_credits(
            general_rules.get("physicalEducation", 0)
        ).credit_units,
        malag_min_credit_units=CreditValue.from_credits(general_rules.get("malag", 0)).credit_units,
    )
    validate_degree_catalog(catalog)
    return catalog


def _parse_academic_year(raw_year: str) -> int:
    if not isinstance(raw_year, str) or "/" not in raw_year:
        raise ValueError("academicYear must look like 2022/2023")
    return int(raw_year.split("/", maxsplit=1)[0])


def _extract_course_codes(course_entries: list[dict[str, Any]]) -> set[str]:
    course_ids: set[str] = set()
    for entry in course_entries:
        course_ids.add(validate_course_id(entry["code"]))
    return course_ids


def _parse_specialties(raw_specialties: list[dict[str, Any]]) -> dict[str, SpecialtyRule]:
    specialties: dict[str, SpecialtyRule] = {}
    for specialty_entry in raw_specialties:
        specialty_id = specialty_entry["trackId"]
        requirements = specialty_entry.get("requirements", {})
        mandatory_courses = tuple(
            validate_course_id(course_id)
            for course_id in requirements.get("mandatoryCourses", [])
        )
        choose_groups = tuple(
            _parse_choose_group(group)
            for group in requirements.get("chooseOneOfGroups", [])
        )
        minimum_total_courses = int(requirements.get("minimumTotalCourses", 0))
        eligible_course_ids = _extract_course_codes(specialty_entry.get("courses", []))
        specialties[specialty_id] = SpecialtyRule(
            specialty_id=specialty_id,
            name_en=specialty_entry.get("nameEn", specialty_id),
            name_he=specialty_entry.get("nameHe"),
            mandatory_courses=mandatory_courses,
            choose_groups=choose_groups,
            minimum_total_courses=minimum_total_courses,
            eligible_course_ids=eligible_course_ids,
        )
    return specialties


def _parse_choose_group(raw_group: Any) -> ChooseGroupRule:
    if isinstance(raw_group, list):
        return ChooseGroupRule(
            courses=tuple(validate_course_id(course_id) for course_id in raw_group),
            required_count=1,
        )
    if isinstance(raw_group, dict):
        courses = raw_group.get("courses", [])
        required_count = int(raw_group.get("requiredCount", 1))
        return ChooseGroupRule(
            courses=tuple(validate_course_id(course_id) for course_id in courses),
            required_count=required_count,
        )
    raise ValueError("chooseOneOfGroups entries must be list or dict")
