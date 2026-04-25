"""Finish-degree solver service."""

from __future__ import annotations

from optigrade.domain.simulation import FinishSimulationInput, FinishSimulationResult
from optigrade.solver.candidates import build_finish_candidates
from optigrade.solver.diagnostics import evaluate_finish_feasibility
from optigrade.solver.model_builder import build_finish_model
from optigrade.solver.solution_extractor import extract_finish_result


def solve_finish_simulation(simulation_input: FinishSimulationInput) -> FinishSimulationResult:
    candidate_result = build_finish_candidates(simulation_input.student_profile)
    model_context = build_finish_model(
        candidates=candidate_result.candidates,
        degree_catalog=simulation_input.degree_catalog,
    )
    feasible, diagnostics = evaluate_finish_feasibility(model_context)
    status = "feasible" if feasible else "infeasible"
    return extract_finish_result(
        candidates=candidate_result.candidates,
        model_context=model_context,
        status=status,
        warnings=candidate_result.warnings,
        diagnostics=diagnostics,
    )
