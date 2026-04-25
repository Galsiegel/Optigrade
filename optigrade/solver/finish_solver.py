"""Finish-degree solver service."""

from __future__ import annotations

from optigrade.domain.simulation import FinishSimulationInput
from optigrade.solver.candidates import build_finish_candidates
from optigrade.solver.model_builder import FinishModelContext, build_finish_model
from optigrade.solver.solution_extractor import FinishSimulationResult, extract_finish_result


def solve_finish_simulation(simulation_input: FinishSimulationInput) -> FinishSimulationResult:
    candidate_result = build_finish_candidates(simulation_input.student_profile)
    model_context = build_finish_model(
        candidates=candidate_result.candidates,
        degree_catalog=simulation_input.degree_catalog,
    )
    feasible, diagnostics = _evaluate_feasibility(model_context)
    status = "feasible" if feasible else "infeasible"
    return extract_finish_result(
        candidates=candidate_result.candidates,
        model_context=model_context,
        status=status,
        warnings=candidate_result.warnings,
        diagnostics=diagnostics,
    )


def _evaluate_feasibility(model_context: FinishModelContext) -> tuple[bool, list[str]]:
    diagnostics: list[str] = []
    feasible = True

    for constraint in model_context.constraints:
        if constraint.type in {"mandatory_completion", "specialty_mandatory"}:
            if len(constraint.details.get("x_vars", [])) < int(constraint.details.get("min_selected", 1)):
                feasible = False
                diagnostics.append(
                    f"Missing required course for constraint {constraint.type}"
                )
        elif constraint.type == "specialty_choose_group":
            required_count = int(constraint.details.get("required_count", 0))
            if len(constraint.details.get("x_vars", [])) < required_count:
                feasible = False
                diagnostics.append("Specialty choose-group requirement not satisfiable")
        elif constraint.type == "core_count_minimum":
            required_core_count = int(constraint.details.get("required_core_count", 0))
            if len(constraint.details.get("alloc_vars", [])) < required_core_count:
                feasible = False
                diagnostics.append("Insufficient core candidates")
        elif constraint.type == "specialty_visible_minimum":
            minimum_total_courses = int(constraint.details.get("minimum_total_courses", 0))
            if len(constraint.details.get("alloc_vars", [])) < minimum_total_courses:
                feasible = False
                diagnostics.append("Specialty visible minimum not satisfiable")
        elif constraint.type == "total_credit_minimum":
            required_total = int(constraint.details.get("required_total_credit_units", 0))
            actual_total = sum(
                int(term["credit_units"])
                for term in constraint.details.get("terms", [])
            )
            if actual_total < required_total:
                feasible = False
                diagnostics.append("Insufficient total credits")

    return feasible, diagnostics
