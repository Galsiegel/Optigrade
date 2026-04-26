"""Planning solver with OR-Tools top-N distinct future course sets."""

from __future__ import annotations

from dataclasses import dataclass
from heapq import heappop, heappush
from typing import Iterator

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
from optigrade.solver.ortools_core import solve_planning_cp_sat
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
    cp_sat_plans = solve_planning_cp_sat(
        candidates=planning_candidates.candidates,
        degree_catalog=simulation_input.degree_catalog,
        selected_specialty_ids=simulation_input.selected_specialty_ids,
        passed_instance_ids=planning_candidates.passed_ids,
        future_instance_ids=set(planning_candidates.future_by_id.keys()),
        locked_future_instance_ids=simulation_input.locked_course_offering_ids,
        num_plans=simulation_input.num_plans,
    )
    if not cp_sat_plans:
        diagnostics = _infeasible_diagnostics(simulation_input, planning_candidates)
        return PlanningSimulationResult(
            status="infeasible",
            plans=[],
            diagnostics=diagnostics,
            warnings=[*planning_candidates.warnings],
        )

    selected_plans: list[PlanningPlan] = []
    for cp_sat_plan in cp_sat_plans:
        finish_result = _extract_plan_finish_result(
            simulation_input=simulation_input,
            planning_candidates=planning_candidates,
            selected_ids=cp_sat_plan.selected_instance_ids,
            selected_bucket_by_instance_id=cp_sat_plan.selected_bucket_by_instance_id,
            active_specialty_ids=cp_sat_plan.active_specialty_ids,
        )
        suggested_courses = [
            PlanningSuggestedCourse(
                course_instance_id=instance_id,
                course_id=str(planning_candidates.future_by_id[instance_id].course_id),
                term=str(planning_candidates.future_by_id[instance_id].term),
                credit_units=planning_candidates.future_by_id[instance_id].credit_units,
                locked_by_student=instance_id in simulation_input.locked_course_offering_ids,
            )
            for instance_id in sorted(cp_sat_plan.selected_future_ids)
        ]
        selected_plans.append(
            PlanningPlan(
                rank=len(selected_plans) + 1,
                future_credit_units=cp_sat_plan.future_credit_units,
                future_course_count=cp_sat_plan.future_course_count,
                suggested_courses=suggested_courses,
                bucket_assignments=finish_result.bucket_assignments,
                rule_statuses=finish_result.rule_statuses,
                generic_missing_requirements=[],
                warnings=[],
            )
        )
    warnings = [*planning_candidates.warnings]
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


def _extract_plan_finish_result(
    *,
    simulation_input: PlanningSimulationInput,
    planning_candidates: _PlanningCandidates,
    selected_ids: set[str],
    selected_bucket_by_instance_id: dict[str, str],
    active_specialty_ids: set[str],
):
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
    _feasible, diagnostics = evaluate_finish_feasibility(context)
    return extract_finish_result(
        candidates=selected_candidates,
        model_context=context,
        status="feasible",
        degree_id=simulation_input.degree_catalog.degree_id,
        catalog_year=simulation_input.degree_catalog.academic_year,
        selected_specialty_ids=simulation_input.selected_specialty_ids,
        warnings=[],
        diagnostics=diagnostics,
        selected_instance_ids={candidate.course_instance_id for candidate in selected_candidates},
        selected_bucket_by_instance_id=selected_bucket_by_instance_id,
        active_specialty_ids=active_specialty_ids,
    )


def _iter_future_subsets_best_first(
    *,
    future_by_id: dict[str, StudentCourseInstance],
    locked_ids: set[str],
    max_states: int,
) -> Iterator[tuple[set[str], bool]]:
    future_ids = set(future_by_id.keys())
    sorted_future_ids = sorted(future_ids)
    locked_existing = locked_ids.intersection(future_ids)
    remaining = tuple(future_id for future_id in sorted_future_ids if future_id not in locked_existing)
    credit_units_by_id = {
        future_id: int(candidate.credit_units)
        for future_id, candidate in future_by_id.items()
    }

    # Objective-ordered expansion: (credit_units, course_count, ids, next_index)
    locked_tuple = tuple(sorted(locked_existing))
    locked_credit_units = sum(credit_units_by_id[future_id] for future_id in locked_tuple)
    heap: list[tuple[int, int, tuple[str, ...], int]] = [
        (locked_credit_units, len(locked_tuple), locked_tuple, 0)
    ]
    visited: set[tuple[str, ...]] = set()
    expanded = 0

    while heap and expanded < max_states:
        credit_units, course_count, ids_tuple, next_index = heappop(heap)
        if ids_tuple in visited:
            continue
        visited.add(ids_tuple)
        yield set(ids_tuple), False
        expanded += 1

        selected_set = set(ids_tuple)
        for idx in range(next_index, len(remaining)):
            new_id = remaining[idx]
            if new_id in selected_set:
                continue
            child_tuple = tuple(sorted((*ids_tuple, new_id)))
            if child_tuple in visited:
                continue
            child_credit_units = credit_units + credit_units_by_id[new_id]
            heappush(
                heap,
                (child_credit_units, course_count + 1, child_tuple, idx + 1),
            )

    if heap:
        yield set(locked_tuple), True


def _enumerate_future_subsets_best_first(
    *,
    future_by_id: dict[str, StudentCourseInstance],
    locked_ids: set[str],
    max_states: int,
) -> tuple[list[set[str]], bool]:
    subsets: list[set[str]] = []
    truncated = False
    for subset, hit_limit in _iter_future_subsets_best_first(
        future_by_id=future_by_id,
        locked_ids=locked_ids,
        max_states=max_states,
    ):
        if hit_limit:
            truncated = True
            break
        subsets.append(subset)
    return subsets, truncated


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
