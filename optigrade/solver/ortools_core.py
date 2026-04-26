"""OR-Tools CP-SAT optimization core for finish/planning solvers."""

from __future__ import annotations

from dataclasses import dataclass

from ortools.sat.python import cp_model

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.student import StudentCourseInstance


@dataclass(frozen=True)
class CpSatSolveResult:
    feasible: bool
    selected_instance_ids: set[str]
    selected_bucket_by_instance_id: dict[str, str]
    selected_future_ids: set[str]
    future_credit_units: int
    future_course_count: int


@dataclass
class _ModelBundle:
    model: cp_model.CpModel
    x_vars: dict[str, cp_model.IntVar]
    alloc_vars: dict[tuple[str, str], cp_model.IntVar]
    candidate_by_id: dict[str, StudentCourseInstance]
    future_ids: set[str]


def solve_finish_cp_sat(
    *,
    candidates: list[StudentCourseInstance],
    degree_catalog: DegreeCatalog,
    selected_specialty_ids: set[str] | None,
    forced_selected_instance_ids: set[str] | None = None,
) -> CpSatSolveResult:
    bundle = _build_model(
        candidates=candidates,
        degree_catalog=degree_catalog,
        selected_specialty_ids=selected_specialty_ids,
        forced_selected_instance_ids=forced_selected_instance_ids or set(),
    )
    _set_finish_objective(bundle)
    status, solver = _solve(bundle.model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return CpSatSolveResult(
            feasible=False,
            selected_instance_ids=set(),
            selected_bucket_by_instance_id={},
            selected_future_ids=set(),
            future_credit_units=0,
            future_course_count=0,
        )

    selected_ids = {
        instance_id for instance_id, x_var in bundle.x_vars.items() if solver.Value(x_var) == 1
    }
    selected_bucket_by_instance_id = _extract_bucket_assignments(bundle.alloc_vars, solver)
    selected_future_ids = selected_ids.intersection(bundle.future_ids)
    return CpSatSolveResult(
        feasible=True,
        selected_instance_ids=selected_ids,
        selected_bucket_by_instance_id=selected_bucket_by_instance_id,
        selected_future_ids=selected_future_ids,
        future_credit_units=0,
        future_course_count=0,
    )


def solve_planning_cp_sat(
    *,
    candidates: list[StudentCourseInstance],
    degree_catalog: DegreeCatalog,
    selected_specialty_ids: set[str] | None,
    passed_instance_ids: set[str],
    future_instance_ids: set[str],
    locked_future_instance_ids: set[str],
    num_plans: int,
) -> list[CpSatSolveResult]:
    bundle = _build_model(
        candidates=candidates,
        degree_catalog=degree_catalog,
        selected_specialty_ids=selected_specialty_ids,
        forced_selected_instance_ids=passed_instance_ids.union(locked_future_instance_ids),
        future_instance_ids=future_instance_ids,
    )
    _set_planning_objective(bundle)

    plans: list[CpSatSolveResult] = []
    requested = max(1, num_plans)
    for _ in range(requested):
        status, solver = _solve(bundle.model)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break

        selected_ids = {
            instance_id for instance_id, x_var in bundle.x_vars.items() if solver.Value(x_var) == 1
        }
        selected_bucket_by_instance_id = _extract_bucket_assignments(bundle.alloc_vars, solver)
        selected_future_ids = selected_ids.intersection(future_instance_ids)
        future_credit_units = sum(
            bundle.candidate_by_id[instance_id].credit_units for instance_id in selected_future_ids
        )
        future_course_count = len(selected_future_ids)
        plans.append(
            CpSatSolveResult(
                feasible=True,
                selected_instance_ids=selected_ids,
                selected_bucket_by_instance_id=selected_bucket_by_instance_id,
                selected_future_ids=selected_future_ids,
                future_credit_units=future_credit_units,
                future_course_count=future_course_count,
            )
        )

        _exclude_exact_future_set(bundle.model, bundle.x_vars, future_instance_ids, selected_future_ids)

    return plans


def _build_model(
    *,
    candidates: list[StudentCourseInstance],
    degree_catalog: DegreeCatalog,
    selected_specialty_ids: set[str] | None,
    forced_selected_instance_ids: set[str],
    future_instance_ids: set[str] | None = None,
) -> _ModelBundle:
    model = cp_model.CpModel()
    x_vars: dict[str, cp_model.IntVar] = {}
    alloc_vars: dict[tuple[str, str], cp_model.IntVar] = {}
    candidate_by_id = {candidate.course_instance_id: candidate for candidate in candidates}
    future_ids = set(future_instance_ids or set())

    for candidate in candidates:
        instance_id = candidate.course_instance_id
        x_var = model.NewBoolVar(f"x_{instance_id}")
        x_vars[instance_id] = x_var

        alloc_for_instance: list[cp_model.IntVar] = []
        for bucket_id in sorted(candidate.eligible_bucket_ids):
            alloc_var = model.NewBoolVar(f"alloc_{instance_id}_{bucket_id}")
            alloc_vars[(instance_id, bucket_id)] = alloc_var
            alloc_for_instance.append(alloc_var)
            model.Add(alloc_var <= x_var)
        if alloc_for_instance:
            model.Add(sum(alloc_for_instance) <= 1)

    for forced_instance_id in sorted(forced_selected_instance_ids):
        if forced_instance_id in x_vars:
            model.Add(x_vars[forced_instance_id] == 1)

    for mandatory_course_id in sorted(degree_catalog.mandatory_course_ids):
        mandatory_x_vars = [
            x_vars[candidate.course_instance_id]
            for candidate in candidates
            if str(candidate.course_id) == mandatory_course_id
        ]
        if mandatory_x_vars:
            model.Add(sum(mandatory_x_vars) >= 1)
        else:
            model.Add(0 >= 1)

    core_alloc_vars = [
        alloc_var
        for (instance_id, bucket_id), alloc_var in alloc_vars.items()
        if bucket_id == "core"
        and str(candidate_by_id[instance_id].course_id) in degree_catalog.core_course_ids
    ]
    model.Add(sum(core_alloc_vars) >= degree_catalog.required_core_count)

    model.Add(
        sum(candidate.credit_units * x_vars[candidate.course_instance_id] for candidate in candidates)
        >= degree_catalog.total_credit_units
    )

    for bucket_id, required_credit_units in (
        ("enrichment", degree_catalog.enrichment_min_credit_units),
        ("sports", degree_catalog.sports_min_credit_units),
        ("malag", degree_catalog.malag_min_credit_units),
    ):
        model.Add(
            sum(
                candidate_by_id[instance_id].credit_units * alloc_var
                for (instance_id, alloc_bucket_id), alloc_var in alloc_vars.items()
                if alloc_bucket_id == bucket_id
            )
            >= required_credit_units
        )

    available_specialty_ids = set(degree_catalog.specialties.keys())
    if selected_specialty_ids is None:
        active_specialty_ids = sorted(available_specialty_ids)
    else:
        active_specialty_ids = sorted(selected_specialty_ids.intersection(available_specialty_ids))

    if len(active_specialty_ids) < degree_catalog.required_specialty_count:
        model.Add(0 >= 1)

    for specialty_id in active_specialty_ids:
        specialty = degree_catalog.specialties[specialty_id]
        specialty_alloc_vars = [
            alloc_var
            for (instance_id, bucket_id), alloc_var in alloc_vars.items()
            if bucket_id == f"specialty:{specialty_id}"
            and str(candidate_by_id[instance_id].course_id) in specialty.eligible_course_ids
        ]
        model.Add(sum(specialty_alloc_vars) >= specialty.minimum_total_courses)

        for mandatory_course_id in specialty.mandatory_courses:
            mandatory_x_vars = [
                x_vars[candidate.course_instance_id]
                for candidate in candidates
                if str(candidate.course_id) == mandatory_course_id
            ]
            if mandatory_x_vars:
                model.Add(sum(mandatory_x_vars) >= 1)
            else:
                model.Add(0 >= 1)

        for choose_group in specialty.choose_groups:
            group_x_vars = [
                x_vars[candidate.course_instance_id]
                for candidate in candidates
                if str(candidate.course_id) in choose_group.courses
            ]
            if choose_group.required_count == 0:
                continue
            if group_x_vars:
                model.Add(sum(group_x_vars) >= choose_group.required_count)
            else:
                model.Add(0 >= choose_group.required_count)

    return _ModelBundle(
        model=model,
        x_vars=x_vars,
        alloc_vars=alloc_vars,
        candidate_by_id=candidate_by_id,
        future_ids=future_ids,
    )


def _set_planning_objective(bundle: _ModelBundle) -> None:
    future_ids = sorted(bundle.future_ids)
    if not future_ids:
        bundle.model.Minimize(0)
        return

    future_credits_expr = sum(
        bundle.candidate_by_id[instance_id].credit_units * bundle.x_vars[instance_id]
        for instance_id in future_ids
    )
    future_courses_expr = sum(bundle.x_vars[instance_id] for instance_id in future_ids)

    # Lexicographic objective: minimize future credits first, then future courses.
    objective_weight = len(future_ids) + 1
    bundle.model.Minimize(future_credits_expr * objective_weight + future_courses_expr)


def _set_finish_objective(bundle: _ModelBundle) -> None:
    instance_ids = sorted(bundle.x_vars.keys())
    if not instance_ids:
        bundle.model.Minimize(0)
        return
    total_credits_expr = sum(
        bundle.candidate_by_id[instance_id].credit_units * bundle.x_vars[instance_id]
        for instance_id in instance_ids
    )
    total_courses_expr = sum(bundle.x_vars[instance_id] for instance_id in instance_ids)
    objective_weight = len(instance_ids) + 1
    bundle.model.Minimize(total_credits_expr * objective_weight + total_courses_expr)


def _exclude_exact_future_set(
    model: cp_model.CpModel,
    x_vars: dict[str, cp_model.IntVar],
    future_ids: set[str],
    selected_future_ids: set[str],
) -> None:
    sorted_future_ids = sorted(future_ids)
    if not sorted_future_ids:
        return
    same_set_terms = []
    selected_lookup = set(selected_future_ids)
    for future_id in sorted_future_ids:
        x_var = x_vars[future_id]
        if future_id in selected_lookup:
            same_set_terms.append(x_var)
        else:
            same_set_terms.append(1 - x_var)
    model.Add(sum(same_set_terms) <= len(sorted_future_ids) - 1)


def _extract_bucket_assignments(
    alloc_vars: dict[tuple[str, str], cp_model.IntVar],
    solver: cp_model.CpSolver,
) -> dict[str, str]:
    selected_bucket_by_instance_id: dict[str, str] = {}
    for (instance_id, bucket_id), alloc_var in sorted(alloc_vars.items()):
        if solver.Value(alloc_var) == 1:
            selected_bucket_by_instance_id[instance_id] = bucket_id
    return selected_bucket_by_instance_id


def _solve(model: cp_model.CpModel) -> tuple[int, cp_model.CpSolver]:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)
    return status, solver
