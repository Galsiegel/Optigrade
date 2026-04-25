from decimal import Decimal

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.course import CourseOffering
from optigrade.domain.simulation import FutureAvailabilityPool, PlanningSimulationInput
from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance, StudentProfile
from optigrade.solver.planning_solver import (
    _enumerate_future_subsets_best_first,
    planning_offering_id,
    solve_planning_simulation,
)


def _passed_instance(instance_id: str, course_id: str, credits: str = "3.0") -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal(credits),
        credit_units=int(Decimal(credits) * 2),
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids={"core"},
    )


def _offering(code: str, term: str, credits: str, index: int) -> CourseOffering:
    return CourseOffering(
        course_id=code,
        term=term,
        credits=Decimal(credits),
        credit_units=int(Decimal(credits) * 2),
        name_en=code,
        metadata={"availability_index": index},
        archived=False,
    )


def _catalog(total_credit_units: int = 12) -> DegreeCatalog:
    return DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=total_credit_units,
        mandatory_course_ids=set(),
        core_course_ids={"046195"},
        required_core_count=0,
        required_specialty_count=0,
        specialties={},
    )


def test_planning_minimizes_future_credits_then_course_count() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[_passed_instance("p1", "046195", "3.0")],
        manual_tags=[],
    )
    future_a = _offering("046200", "2026_winter", "3.0", 0)  # 6 units, 1 course
    future_b = _offering("046201", "2026_winter", "2.0", 1)  # 4 units
    future_c = _offering("046202", "2026_spring", "1.0", 0)  # 2 units
    pool = FutureAvailabilityPool(semesters={"2026_winter": [future_a, future_b], "2026_spring": [future_c]})

    result = solve_planning_simulation(
        PlanningSimulationInput(
            student_profile=profile,
            degree_catalog=_catalog(total_credit_units=12),
            future_availability_pool=pool,
            selected_specialty_ids=None,
            num_plans=2,
        )
    )

    assert result.status == "optimal"
    assert len(result.plans) == 2
    assert result.plans[0].future_credit_units == 6
    assert result.plans[0].future_course_count == 1
    assert [course.course_id for course in result.plans[0].suggested_courses] == ["046200"]
    assert result.plans[0].rule_statuses
    assert result.plans[1].future_credit_units == 6
    assert result.plans[1].future_course_count == 2
    assert {course.course_id for course in result.plans[1].suggested_courses} == {"046201", "046202"}


def test_planning_locked_future_course_forced_and_blocked_excluded() -> None:
    profile = StudentProfile(
        student_id="s2",
        degree_start_year=2022,
        completed_courses=[_passed_instance("p2", "046195", "3.0")],
        manual_tags=[],
    )
    locked = _offering("046300", "2026_winter", "1.0", 0)
    blocked = _offering("046301", "2026_winter", "3.0", 1)
    needed = _offering("046302", "2026_spring", "2.0", 0)
    pool = FutureAvailabilityPool(semesters={"2026_winter": [locked, blocked], "2026_spring": [needed]})

    result = solve_planning_simulation(
        PlanningSimulationInput(
            student_profile=profile,
            degree_catalog=_catalog(total_credit_units=12),
            future_availability_pool=pool,
            selected_specialty_ids=None,
            locked_course_offering_ids={planning_offering_id(locked)},
            blocked_course_ids={"046301"},
            num_plans=1,
        )
    )

    assert result.status == "optimal"
    assert len(result.plans) == 1
    suggested_ids = {course.course_id for course in result.plans[0].suggested_courses}
    assert "046300" in suggested_ids
    assert "046301" not in suggested_ids
    locked_suggestions = [course for course in result.plans[0].suggested_courses if course.course_id == "046300"]
    assert locked_suggestions and locked_suggestions[0].locked_by_student is True


def test_planning_infeasible_returns_diagnostics() -> None:
    profile = StudentProfile(
        student_id="s3",
        degree_start_year=2022,
        completed_courses=[_passed_instance("p3", "046195", "1.0")],
        manual_tags=[],
    )
    pool = FutureAvailabilityPool(semesters={})
    catalog = DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=10,
        mandatory_course_ids={"046999"},
        core_course_ids=set(),
        required_core_count=0,
        required_specialty_count=0,
        specialties={},
    )

    result = solve_planning_simulation(
        PlanningSimulationInput(
            student_profile=profile,
            degree_catalog=catalog,
            future_availability_pool=pool,
            selected_specialty_ids=None,
            num_plans=2,
        )
    )
    assert result.status == "infeasible"
    assert result.plans == []
    assert any(diagnostic.type == "mandatory_completion" for diagnostic in result.diagnostics)


def test_future_subset_enumeration_is_bounded_by_state_limit() -> None:
    future_by_id = {
        f"future_{index}": _passed_instance(f"future_{index}", f"046{index:03d}", "1.0")
        for index in range(30)
    }
    subsets, truncated = _enumerate_future_subsets_best_first(
        future_by_id=future_by_id,
        locked_ids=set(),
        max_states=64,
    )
    assert truncated is True
    assert len(subsets) == 64
