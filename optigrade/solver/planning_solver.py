"""Planning solver with top-N distinct future course sets."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

from optigrade.domain.course import CourseOffering
from optigrade.domain.simulation import (
    PlanningPlan,
    PlanningSimulationInput,
    PlanningSimulationResult,
    PlanningSuggestedCourse,
)
from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance, StudentProfile
from optigrade.solver.candidates import build_finish_candidates
from optigrade.solver.diagnostics import evaluate_finish_feasibility
from optigrade.solver.model_builder import build_finish_model
from optigrade.solver.solution_extractor import extract_finish_result


@dataclass(frozen=True)
class _PlanningCandidates:
    candidates: list[StudentCourseInstance]
    passed_ids: set[str]
    future_by_id: dict[str, StudentCourseInstance]
    warnings: list[str]


def planning_offering_id(offering: CourseOffering) -> str:
    availability_index = int(offering.metadata.get("availability_index", 0))
    return f"{offering.term}:{offering.course_id}:{availability_index}"


def solve_planning_simulation(simulation_input: PlanningSimulationInput) -> PlanningSimulationResult:
    planning_candidates = _build_planning_candidates(simulation_input)

    feasible_plans: list[tuple[frozenset[str], PlanningPlan]] = []
    for future_selection in _enumerate_future_subsets(
        future_ids=set(planning_candidates.future_by_id.keys()),
        locked_ids=simulation_input.locked_course_offering_ids,
    ):
        selected_ids = planning_candidates.passed_ids.union(future_selection)
        result = _evaluate_selection(simulation_input, planning_candidates, selected_ids, future_selection)
        if result is None:
            continue
        feasible_plans.append((frozenset(future_selection), result))

    if not feasible_plans:
        diagnostics = _infeasible_diagnostics(simulation_input, planning_candidates)
        return PlanningSimulationResult(
            status="infeasible",
            plans=[],
            diagnostics=diagnostics,
            warnings=planning_candidates.warnings,
        )

    feasible_plans.sort(
        key=lambda item: (
            item[1].future_credit_units,
            item[1].future_course_count,
            [course.course_instance_id for course in item[1].suggested_courses],
        )
    )

    selected_plans: list[PlanningPlan] = []
    seen_future_sets: set[frozenset[str]] = set()
    for future_set, plan in feasible_plans:
        if future_set in seen_future_sets:
            continue
        seen_future_sets.add(future_set)
        selected_plans.append(
            PlanningPlan(
                rank=len(selected_plans) + 1,
                future_credit_units=plan.future_credit_units,
                future_course_count=plan.future_course_count,
                suggested_courses=plan.suggested_courses,
                bucket_assignments=plan.bucket_assignments,
                rule_statuses=plan.rule_statuses,
                generic_missing_requirements=plan.generic_missing_requirements,
                warnings=plan.warnings,
            )
        )
        if len(selected_plans) >= max(1, simulation_input.num_plans):
            break

    warnings = list(planning_candidates.warnings)
    requested_count = max(1, simulation_input.num_plans)
    if len(selected_plans) < requested_count:
        warnings.append("No additional distinct feasible future plan found.")

    return PlanningSimulationResult(
        status="optimal",
        plans=selected_plans,
        diagnostics=[],
        warnings=warnings,
    )


def _build_planning_candidates(simulation_input: PlanningSimulationInput) -> _PlanningCandidates:
    warnings: list[str] = []

    passed_candidates_result = build_finish_candidates(
        simulation_input.student_profile,
        simulation_input.degree_catalog,
    )
    warnings.extend(passed_candidates_result.warnings)
    passed_candidates = passed_candidates_result.candidates
    passed_ids = {candidate.course_instance_id for candidate in passed_candidates}

    future_candidates: list[StudentCourseInstance] = []
    for offering in simulation_input.future_availability_pool.all_offerings():
        course_id = str(offering.course_id)
        if course_id in simulation_input.blocked_course_ids:
            continue
        instance_id = planning_offering_id(offering)
        future_candidates.append(
            StudentCourseInstance(
                course_instance_id=instance_id,
                course_id=offering.course_id,
                term=offering.term,
                credits=offering.credits,
                credit_units=offering.credit_units,
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                source="future_availability",
                verified=True,
                eligible_bucket_ids=set(),
                comment=offering.name_en,
            )
        )

    future_profile = StudentProfile(
        student_id=simulation_input.student_profile.student_id,
        degree_start_year=simulation_input.student_profile.degree_start_year,
        completed_courses=future_candidates,
        manual_tags=[],
    )
    future_candidates_result = build_finish_candidates(
        future_profile,
        simulation_input.degree_catalog,
    )

    candidates = [*passed_candidates, *future_candidates_result.candidates]
    future_by_id = {
        candidate.course_instance_id: candidate for candidate in future_candidates_result.candidates
    }

    missing_locks = sorted(simulation_input.locked_course_offering_ids.difference(future_by_id.keys()))
    if missing_locks:
        warnings.append(
            "Some locked course offerings are unavailable after filtering: "
            + ", ".join(missing_locks)
        )

    return _PlanningCandidates(
        candidates=candidates,
        passed_ids=passed_ids,
        future_by_id=future_by_id,
        warnings=warnings,
    )


def _enumerate_future_subsets(
    *,
    future_ids: set[str],
    locked_ids: set[str],
) -> list[set[str]]:
    sorted_future_ids = sorted(future_ids)
    locked_existing = locked_ids.intersection(future_ids)
    remaining = [future_id for future_id in sorted_future_ids if future_id not in locked_existing]

    subsets: list[set[str]] = []
    for size in range(len(remaining) + 1):
        for combo in combinations(remaining, size):
            subset = set(combo).union(locked_existing)
            subsets.append(subset)
    return subsets


def _evaluate_selection(
    simulation_input: PlanningSimulationInput,
    planning_candidates: _PlanningCandidates,
    selected_ids: set[str],
    selected_future_ids: set[str],
) -> PlanningPlan | None:
    selected_candidates = [
        candidate
        for candidate in planning_candidates.candidates
        if candidate.course_instance_id in selected_ids
    ]
    context = build_finish_model(
        candidates=selected_candidates,
        degree_catalog=simulation_input.degree_catalog,
        selected_specialty_ids=simulation_input.selected_specialty_ids,
    )
    feasible, diagnostics = evaluate_finish_feasibility(context)
    if not feasible:
        return None

    finish_result = extract_finish_result(
        candidates=selected_candidates,
        model_context=context,
        status="feasible",
        warnings=[],
        diagnostics=diagnostics,
        selected_instance_ids={candidate.course_instance_id for candidate in selected_candidates},
    )

    suggested_courses = [
        PlanningSuggestedCourse(
            course_instance_id=instance_id,
            course_id=str(planning_candidates.future_by_id[instance_id].course_id),
            term=str(planning_candidates.future_by_id[instance_id].term),
            credit_units=planning_candidates.future_by_id[instance_id].credit_units,
            locked_by_student=instance_id in simulation_input.locked_course_offering_ids,
        )
        for instance_id in sorted(selected_future_ids)
    ]
    return PlanningPlan(
        rank=0,
        future_credit_units=sum(course.credit_units for course in suggested_courses),
        future_course_count=len(suggested_courses),
        suggested_courses=suggested_courses,
        bucket_assignments=finish_result.bucket_assignments,
        rule_statuses=[],
        generic_missing_requirements=[],
        warnings=[],
    )


def _infeasible_diagnostics(
    simulation_input: PlanningSimulationInput,
    planning_candidates: _PlanningCandidates,
):
    context = build_finish_model(
        candidates=planning_candidates.candidates,
        degree_catalog=simulation_input.degree_catalog,
        selected_specialty_ids=simulation_input.selected_specialty_ids,
    )
    _feasible, diagnostics = evaluate_finish_feasibility(context)
    return diagnostics
