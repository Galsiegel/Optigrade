from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.rules import ChooseGroupRule, SpecialtyRule
from optigrade.domain.simulation import FinishSimulationInput
from optigrade.domain.student import (
    CourseInstanceStatus,
    StudentCourseInstance,
    StudentProfile,
)
from optigrade.solver.finish_solver import solve_finish_simulation
from tests.assertions.finish_result import assert_valid_finish_result


SCENARIOS_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "scenarios"


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _build_catalog(raw: dict) -> DegreeCatalog:
    return DegreeCatalog(
        degree_id=raw["degree_id"],
        academic_year=raw["academic_year"],
        program_name=raw["program_name"],
        total_credit_units=raw["total_credit_units"],
        mandatory_course_ids=set(raw["mandatory_course_ids"]),
        core_course_ids=set(raw["core_course_ids"]),
        required_core_count=raw["required_core_count"],
        required_specialty_count=raw["required_specialty_count"],
        specialties={
            specialty_id: SpecialtyRule(
                specialty_id=specialty_id,
                name_en=specialty["name_en"],
                name_he=specialty.get("name_he"),
                mandatory_courses=tuple(specialty["mandatory_courses"]),
                choose_groups=tuple(
                    ChooseGroupRule(
                        courses=tuple(group["courses"]),
                        required_count=group["required_count"],
                    )
                    for group in specialty["choose_groups"]
                ),
                minimum_total_courses=specialty["minimum_total_courses"],
                eligible_course_ids=set(specialty["eligible_course_ids"]),
            )
            for specialty_id, specialty in raw["specialties"].items()
        },
    )


def _build_profile(raw: dict) -> StudentProfile:
    courses = []
    for course in raw["completed_courses"]:
        credits = Decimal(str(course["credits"]))
        courses.append(
            StudentCourseInstance(
                course_instance_id=course["course_instance_id"],
                course_id=course["course_id"],
                term=course["term"],
                credits=credits,
                credit_units=int(credits * 2),
                status=CourseInstanceStatus(course["status"]),
                source=course["source"],
                verified=course["verified"],
                eligible_bucket_ids=set(course["eligible_bucket_ids"]),
            )
        )
    return StudentProfile(
        student_id=raw["student_id"],
        degree_start_year=raw["degree_start_year"],
        completed_courses=courses,
        manual_tags=[],
    )


def test_finish_basic_feasible_matches_expected_output() -> None:
    scenario_dir = SCENARIOS_ROOT / "finish_basic_feasible"
    input_payload = _load_json(scenario_dir / "input.json")
    expected = _load_json(scenario_dir / "expected.json")
    catalog = _build_catalog(input_payload["catalog"])
    profile = _build_profile(input_payload["student_profile"])
    selected_specialty_ids = set(input_payload["selected_specialty_ids"])

    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=selected_specialty_ids,
        )
    )

    assert result.status == expected["status"]
    assert result.summary.total_selected_credit_units == expected["summary"]["total_selected_credit_units"]
    assert result.summary.total_selected_courses == expected["summary"]["total_selected_courses"]
    assert _assignments_by_bucket(result) == expected["expected_bucket_assignments"]
    assert [course.course_id for course in result.manual_unverified_courses] == expected[
        "expected_manual_unverified_courses"
    ]
    assert [course.course_id for course in result.extra_unused_courses] == expected["expected_unused_courses"]
    assert [diagnostic.type for diagnostic in result.diagnostics] == expected["expected_diagnostics"]
    assert_valid_finish_result(result, catalog, profile, selected_specialty_ids)


def _assignments_by_bucket(result) -> dict[str, list[str]]:
    assignments: dict[str, list[str]] = {}
    for assignment in result.bucket_assignments:
        assignments.setdefault(assignment.bucket_id, []).append(assignment.course_id)
    return assignments
