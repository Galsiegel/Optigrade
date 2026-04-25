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


def _instance(
    *,
    instance_id: str,
    course_id: str,
    eligible_bucket_ids: set[str],
    credits: str = "3.0",
) -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal(credits),
        credit_units=int(Decimal(credits) * 2),
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids=eligible_bucket_ids,
    )


def test_finish_solver_feasible_basic_case() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_1", course_id="046195", eligible_bucket_ids={"core"}),
            _instance(instance_id="ci_2", course_id="046267", eligible_bucket_ids={"core"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=12,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195", "046267"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "feasible"
    assert result.diagnostics == []


def test_finish_solver_infeasible_when_missing_mandatory() -> None:
    profile = StudentProfile(
        student_id="s2",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_3", course_id="046267", eligible_bucket_ids={"core"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids={"046195"},
        core_course_ids={"046267"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "infeasible"
    assert any(diagnostic.type == "mandatory_completion" for diagnostic in result.diagnostics)


def test_finish_solver_infeasible_when_specialty_requirements_missing() -> None:
    profile = StudentProfile(
        student_id="s3",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_4", course_id="046195", eligible_bucket_ids={"core"}),
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
        required_core_count=0,
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=("046203",),
                choose_groups=(
                    ChooseGroupRule(courses=("046203", "046237"), required_count=1),
                ),
                minimum_total_courses=1,
                eligible_course_ids={"046203", "046237"},
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
    assert result.status == "infeasible"
    assert any(
        diagnostic.type in {"specialty_mandatory", "specialty_choose_group", "specialty_visible_minimum"}
        for diagnostic in result.diagnostics
    )


def test_finish_solver_selected_specialty_enforced() -> None:
    profile = StudentProfile(
        student_id="s4",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_5", course_id="046203", eligible_bucket_ids={"specialty:systems"}),
            _instance(instance_id="ci_6", course_id="046237", eligible_bucket_ids={"specialty:systems"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids=set(),
        core_course_ids=set(),
        required_core_count=0,
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=("046195",),
                choose_groups=(ChooseGroupRule(courses=("046195", "046196"), required_count=1),),
                minimum_total_courses=1,
                eligible_course_ids={"046195", "046196"},
            ),
            "systems": SpecialtyRule(
                specialty_id="systems",
                name_en="Systems",
                name_he=None,
                mandatory_courses=("046203",),
                choose_groups=(ChooseGroupRule(courses=("046203", "046237"), required_count=1),),
                minimum_total_courses=1,
                eligible_course_ids={"046203", "046237"},
            ),
        },
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids={"ai"},
        )
    )
    assert result.status == "infeasible"
    assert any(diagnostic.type == "specialty_mandatory" for diagnostic in result.diagnostics)


def test_finish_solver_marks_extra_unused_courses() -> None:
    profile = StudentProfile(
        student_id="s5",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_7", course_id="046195", eligible_bucket_ids={"core"}),
            _instance(instance_id="ci_8", course_id="046267", eligible_bucket_ids={"core"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195", "046267"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "feasible"
    assert len(result.extra_unused_courses) == 1
