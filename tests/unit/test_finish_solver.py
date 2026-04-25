from decimal import Decimal

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.rules import ChooseGroupRule, SpecialtyRule
from optigrade.domain.simulation import FinishSimulationInput
from optigrade.domain.student import (
    CourseInstanceStatus,
    StudentCourseInstance,
    StudentProfile,
)
from optigrade.solver.model_builder import FinishModelConstraint, FinishModelContext
from optigrade.solver.finish_solver import solve_finish_simulation
from optigrade.solver.finish_solver import _select_candidate_subset


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


def test_finish_solver_infeasible_when_missing_core_count() -> None:
    profile = StudentProfile(
        student_id="s2_core",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_core_1", course_id="046196", eligible_bucket_ids={"enrichment"}),
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
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "infeasible"
    assert any(diagnostic.type == "core_count_minimum" for diagnostic in result.diagnostics)


def test_finish_solver_zero_credit_mandatory_required() -> None:
    profile = StudentProfile(
        student_id="s_zero",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_zero_1", course_id="046267", eligible_bucket_ids={"core"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids={"044102"},
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


def test_specialty_mandatory_can_be_assigned_to_core() -> None:
    profile = StudentProfile(
        student_id="s_specialty_core",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_sc_1", course_id="046203", eligible_bucket_ids={"core", "specialty:ai"}),
            _instance(instance_id="ci_sc_2", course_id="046237", eligible_bucket_ids={"specialty:ai"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=12,
        mandatory_course_ids=set(),
        core_course_ids={"046203"},
        required_core_count=1,
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=("046203",),
                choose_groups=(ChooseGroupRule(courses=("046203", "046237"), required_count=1),),
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
    assert result.status == "feasible"
    assert result.diagnostics == []
    core_assignment = next(
        assignment
        for assignment in result.bucket_assignments
        if assignment.course_id == "046203"
    )
    assert "assigned_to_core" in core_assignment.reason_codes
    assert "satisfies_specialty_mandatory_rule" in core_assignment.reason_codes


def test_specialty_visible_minimum_requires_specialty_bucket_assignment() -> None:
    profile = StudentProfile(
        student_id="s_specialty_visible",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_sv_1", course_id="046203", eligible_bucket_ids={"core"}),
            _instance(instance_id="ci_sv_2", course_id="046237", eligible_bucket_ids={"core"}),
        ],
        manual_tags=[],
    )
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids=set(),
        core_course_ids={"046203", "046237"},
        required_core_count=1,
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=(),
                choose_groups=(),
                minimum_total_courses=1,
                eligible_course_ids={"046999"},
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
    assert any(diagnostic.type == "specialty_visible_minimum" for diagnostic in result.diagnostics)


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


def test_choose_group_required_zero_is_optional() -> None:
    profile = StudentProfile(
        student_id="s_group_zero",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_gz_1", course_id="046195", eligible_bucket_ids={"core"}),
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
        required_specialty_count=1,
        specialties={
            "ai": SpecialtyRule(
                specialty_id="ai",
                name_en="AI",
                name_he=None,
                mandatory_courses=(),
                choose_groups=(ChooseGroupRule(courses=("046237", "046238"), required_count=0),),
                minimum_total_courses=0,
                eligible_course_ids={"046237", "046238"},
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
    assert result.status == "feasible"


def test_finish_solver_includes_rule_statuses() -> None:
    profile = StudentProfile(
        student_id="s_rule_status",
        degree_start_year=2022,
        completed_courses=[
            _instance(instance_id="ci_rs_1", course_id="046195", eligible_bucket_ids={"core"}),
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
        FinishSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "feasible"
    assert any(status.rule_type == "mandatory_completion" for status in result.rule_statuses)


def test_select_candidate_subset_honors_min_selected_for_mandatory_constraint() -> None:
    candidates = [
        _instance(instance_id="ci_m1", course_id="046195", eligible_bucket_ids={"mandatory"}, credits="2.0"),
        _instance(instance_id="ci_m2", course_id="046195", eligible_bucket_ids={"mandatory"}, credits="3.0"),
        _instance(instance_id="ci_other", course_id="046267", eligible_bucket_ids={"core"}, credits="1.0"),
    ]
    context = FinishModelContext(
        x_vars={
            "ci_m1": "x_ci_m1",
            "ci_m2": "x_ci_m2",
            "ci_other": "x_ci_other",
        },
        alloc_vars={},
        constraints=[
            FinishModelConstraint(
                type="mandatory_completion",
                details={
                    "course_id": "046195",
                    "x_vars": ["x_ci_m1", "x_ci_m2"],
                    "min_selected": 2,
                },
            ),
            FinishModelConstraint(
                type="total_credit_minimum",
                details={
                    "terms": [],
                    "required_total_credit_units": 0,
                },
            ),
        ],
    )
    simulation_input = FinishSimulationInput(
        student_profile=StudentProfile(
            student_id="s-multi",
            degree_start_year=2022,
            completed_courses=candidates,
            manual_tags=[],
        ),
        degree_catalog=DegreeCatalog(
            degree_id="tiny",
            academic_year=2024,
            program_name="tiny",
            total_credit_units=0,
            mandatory_course_ids={"046195"},
            core_course_ids=set(),
            required_core_count=0,
            required_specialty_count=0,
            specialties={},
        ),
        selected_specialty_ids=None,
    )

    selected_ids = _select_candidate_subset(simulation_input, candidates, context)
    assert "ci_m1" in selected_ids
    assert "ci_m2" in selected_ids


def test_select_candidate_subset_keeps_all_distinct_mandatory_courses() -> None:
    candidates = [
        _instance(instance_id="ci_a1", course_id="046195", eligible_bucket_ids={"mandatory"}, credits="1.0"),
        _instance(instance_id="ci_a2", course_id="046267", eligible_bucket_ids={"mandatory"}, credits="1.0"),
        _instance(instance_id="ci_extra", course_id="046000", eligible_bucket_ids={"core"}, credits="8.0"),
    ]
    context = FinishModelContext(
        x_vars={
            "ci_a1": "x_ci_a1",
            "ci_a2": "x_ci_a2",
            "ci_extra": "x_ci_extra",
        },
        alloc_vars={},
        constraints=[
            FinishModelConstraint(
                type="mandatory_completion",
                details={
                    "course_id": "046195",
                    "x_vars": ["x_ci_a1"],
                    "min_selected": 1,
                },
            ),
            FinishModelConstraint(
                type="mandatory_completion",
                details={
                    "course_id": "046267",
                    "x_vars": ["x_ci_a2"],
                    "min_selected": 1,
                },
            ),
            FinishModelConstraint(
                type="total_credit_minimum",
                details={
                    "terms": [],
                    "required_total_credit_units": 0,
                },
            ),
        ],
    )
    simulation_input = FinishSimulationInput(
        student_profile=StudentProfile(
            student_id="s-mandatory-distinct",
            degree_start_year=2022,
            completed_courses=candidates,
            manual_tags=[],
        ),
        degree_catalog=DegreeCatalog(
            degree_id="tiny",
            academic_year=2024,
            program_name="tiny",
            total_credit_units=0,
            mandatory_course_ids={"046195", "046267"},
            core_course_ids=set(),
            required_core_count=0,
            required_specialty_count=0,
            specialties={},
        ),
        selected_specialty_ids=None,
    )

    selected_ids = _select_candidate_subset(simulation_input, candidates, context)
    assert "ci_a1" in selected_ids
    assert "ci_a2" in selected_ids
