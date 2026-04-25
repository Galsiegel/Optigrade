from optigrade.domain.simulation import Diagnostic
from optigrade.solver.diagnostics import evaluate_finish_feasibility
from optigrade.solver.model_builder import FinishModelConstraint, FinishModelContext


def _context(constraints: list[FinishModelConstraint]) -> FinishModelContext:
    return FinishModelContext(
        x_vars={},
        alloc_vars={},
        constraints=constraints,
    )


def test_diagnostics_reports_missing_mandatory() -> None:
    context = _context(
        [
            FinishModelConstraint(
                type="mandatory_completion",
                details={"course_id": "046195", "x_vars": [], "min_selected": 1},
            )
        ]
    )
    feasible, diagnostics = evaluate_finish_feasibility(context)
    assert feasible is False
    assert diagnostics and diagnostics[0].type == "mandatory_completion"
    assert diagnostics[0].severity == "error"


def test_diagnostics_reports_total_credit_gap() -> None:
    context = _context(
        [
            FinishModelConstraint(
                type="total_credit_minimum",
                details={
                    "terms": [{"x_var": "x_1", "credit_units": 4, "course_instance_id": "ci_1"}],
                    "required_total_credit_units": 10,
                },
            )
        ]
    )
    feasible, diagnostics = evaluate_finish_feasibility(context)
    assert feasible is False
    assert any(d.type == "total_credit_minimum" for d in diagnostics)
    assert all(isinstance(d, Diagnostic) for d in diagnostics)


def test_diagnostics_reports_bucket_credit_gap() -> None:
    context = _context(
        [
            FinishModelConstraint(
                type="bucket_credit_minimum",
                details={
                    "bucket_id": "sports",
                    "terms": [{"alloc_var": "alloc_1", "credit_units": 2, "course_instance_id": "ci_1"}],
                    "required_credit_units": 4,
                },
            )
        ]
    )
    feasible, diagnostics = evaluate_finish_feasibility(context)
    assert feasible is False
    assert any(d.type == "bucket_credit_minimum" for d in diagnostics)
    assert any(d.related_bucket_ids == ["sports"] for d in diagnostics)


def test_diagnostics_reports_core_and_specialty_gaps_with_structure() -> None:
    context = _context(
        [
            FinishModelConstraint(
                type="core_count_minimum",
                details={"alloc_vars": [], "required_core_count": 1},
            ),
            FinishModelConstraint(
                type="specialty_visible_minimum",
                details={"specialty_id": "ai", "alloc_vars": [], "minimum_total_courses": 2},
            ),
            FinishModelConstraint(
                type="required_specialty_count",
                details={"required_specialty_count": 1, "active_specialty_ids": []},
            ),
        ]
    )
    feasible, diagnostics = evaluate_finish_feasibility(context)
    assert feasible is False

    by_type = {diag.type: diag for diag in diagnostics}
    assert "core_count_minimum" in by_type
    assert by_type["core_count_minimum"].related_bucket_ids == ["core"]
    assert by_type["core_count_minimum"].severity == "error"

    assert "specialty_visible_minimum" in by_type
    assert by_type["specialty_visible_minimum"].related_bucket_ids == ["specialty:ai"]
    assert by_type["specialty_visible_minimum"].message_en

    assert "required_specialty_count" in by_type
    assert by_type["required_specialty_count"].related_bucket_ids == ["specialty"]
