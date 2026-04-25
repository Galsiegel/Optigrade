"""Finish-degree solver service."""

from __future__ import annotations

from optigrade.domain.simulation import FinishSimulationInput, FinishSimulationResult
from optigrade.solver.candidates import build_finish_candidates
from optigrade.solver.diagnostics import evaluate_finish_feasibility
from optigrade.solver.model_builder import build_finish_model
from optigrade.solver.solution_extractor import extract_finish_result


def solve_finish_simulation(simulation_input: FinishSimulationInput) -> FinishSimulationResult:
    candidate_result = build_finish_candidates(
        simulation_input.student_profile,
        simulation_input.degree_catalog,
    )
    model_context = build_finish_model(
        candidates=candidate_result.candidates,
        degree_catalog=simulation_input.degree_catalog,
        selected_specialty_ids=simulation_input.selected_specialty_ids,
    )
    feasible, diagnostics = evaluate_finish_feasibility(model_context)
    status = "feasible" if feasible else "infeasible"
    selected_instance_ids = (
        _select_candidate_subset(simulation_input, candidate_result.candidates, model_context)
        if feasible
        else {candidate.course_instance_id for candidate in candidate_result.candidates}
    )
    return extract_finish_result(
        candidates=candidate_result.candidates,
        model_context=model_context,
        status=status,
        warnings=candidate_result.warnings,
        diagnostics=diagnostics,
        selected_instance_ids=selected_instance_ids,
    )


def _select_candidate_subset(
    simulation_input: FinishSimulationInput,
    candidates,
    model_context,
) -> set[str]:
    selected_ids: set[str] = set()
    candidate_by_id = {candidate.course_instance_id: candidate for candidate in candidates}

    for constraint in model_context.constraints:
        if constraint.type == "mandatory_completion":
            x_vars = constraint.details.get("x_vars", [])
            if x_vars:
                selected_ids.add(str(x_vars[0]).replace("x_", "", 1))

    for constraint in model_context.constraints:
        if constraint.type == "core_count_minimum":
            required = int(constraint.details.get("required_core_count", 0))
            for instance_id in constraint.details.get("course_instance_ids", [])[:required]:
                selected_ids.add(str(instance_id))

    required_total = simulation_input.degree_catalog.total_credit_units
    current_total = sum(candidate_by_id[idx].credit_units for idx in selected_ids if idx in candidate_by_id)
    remaining = sorted(
        (candidate for candidate in candidates if candidate.course_instance_id not in selected_ids),
        key=lambda candidate: candidate.credit_units,
        reverse=True,
    )
    for candidate in remaining:
        if current_total >= required_total:
            break
        selected_ids.add(candidate.course_instance_id)
        current_total += candidate.credit_units

    if not selected_ids:
        return {candidate.course_instance_id for candidate in candidates}
    return selected_ids
