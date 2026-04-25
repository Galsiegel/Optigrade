from __future__ import annotations

from decimal import Decimal

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


def _instance(
    *,
    instance_id: str,
    course_id: str,
    eligible_bucket_ids: set[str],
    credits: str = "3.0",
    status: CourseInstanceStatus = CourseInstanceStatus.RECOGNIZED_PASSED,
    verified: bool = True,
) -> StudentCourseInstance:
    credit_units = int(Decimal(credits) * 2)
    return StudentCourseInstance(
        course_instance_id=instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal(credits),
        credit_units=credit_units,
        status=status,
        source="transcript" if verified else "manual_student_tag",
        verified=verified,
        eligible_bucket_ids=eligible_bucket_ids,
    )


def test_feasible_finish_result_satisfies_shared_invariants() -> None:
    profile = StudentProfile(
        student_id="s_invariant",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="ci_core",
                course_id="046195",
                eligible_bucket_ids={"core"},
            ),
            _instance(
                instance_id="ci_ai",
                course_id="046237",
                eligible_bucket_ids={"specialty:ai"},
                verified=False,
            ),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=12,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195"},
        required_core_count=1,
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=("046195",),
                choose_groups=(ChooseGroupRule(courses=("046237",), required_count=1),),
                minimum_total_courses=1,
                eligible_course_ids={"046195", "046237"},
            )
        },
    )

    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids={"ai"},
        )
    )

    assert_valid_finish_result(result, catalog, profile, selected_specialty_ids={"ai"})


def test_faculty_choice_assignment_does_not_satisfy_core_count() -> None:
    profile = StudentProfile(
        student_id="s_faculty_choice_not_core",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="ci_wrong_bucket",
                course_id="046267",
                eligible_bucket_ids={"faculty_choice"},
            )
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids=set(),
        core_course_ids={"046195"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
        faculty_choice_course_ids={"046267"},
    )

    result = solve_finish_simulation(
        FinishSimulationInput(profile, catalog, selected_specialty_ids=None)
    )

    assert result.status == "infeasible"
    assert any(diagnostic.type == "core_count_minimum" for diagnostic in result.diagnostics)


def test_unresolved_unknown_course_is_not_silently_used() -> None:
    profile = StudentProfile(
        student_id="s_unresolved",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="ci_unknown",
                course_id="046195",
                eligible_bucket_ids={"core"},
                status=CourseInstanceStatus.UNKNOWN_UNRESOLVED,
            )
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
    )

    result = solve_finish_simulation(
        FinishSimulationInput(profile, catalog, selected_specialty_ids=None)
    )

    assert result.status == "infeasible"
    assert any(diagnostic.type == "mandatory_completion" for diagnostic in result.diagnostics)


def test_failed_course_is_not_silently_used() -> None:
    profile = StudentProfile(
        student_id="s_failed",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="ci_failed",
                course_id="046195",
                eligible_bucket_ids={"core"},
                status=CourseInstanceStatus.RECOGNIZED_FAILED,
            )
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
    )

    result = solve_finish_simulation(
        FinishSimulationInput(profile, catalog, selected_specialty_ids=None)
    )

    assert result.status == "infeasible"
    assert any(diagnostic.type == "mandatory_completion" for diagnostic in result.diagnostics)
