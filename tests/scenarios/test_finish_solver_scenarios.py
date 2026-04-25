from optigrade.loaders.catalog_loader import load_catalog_from_path
from optigrade.loaders.student_loader import load_student_profile_from_path
from optigrade.domain.simulation import FinishSimulationInput
from optigrade.solver.finish_solver import solve_finish_simulation


def test_finish_solver_with_tiny_basic_fixture_is_infeasible() -> None:
    catalog = load_catalog_from_path(
        path="tests/fixtures/catalogs/tiny_basic.json",
        degree_id="tiny_basic",
    )
    student = load_student_profile_from_path(
        path="tests/fixtures/students/tiny_sports_duplicates_student.json"
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=student,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "infeasible"
    assert len(result.diagnostics) > 0


def test_finish_solver_with_tiny_infeasible_fixture_reports_diagnostics() -> None:
    catalog = load_catalog_from_path(
        path="tests/fixtures/catalogs/tiny_infeasible.json",
        degree_id="tiny_infeasible",
    )
    student = load_student_profile_from_path(
        path="tests/fixtures/students/tiny_non_sports_duplicates_student.json"
    )
    result = solve_finish_simulation(
        FinishSimulationInput(
            student_profile=student,
            degree_catalog=catalog,
            selected_specialty_ids=None,
        )
    )
    assert result.status == "infeasible"
    assert len(result.diagnostics) > 0
