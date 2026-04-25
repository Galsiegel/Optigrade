import json
from pathlib import Path

from fastapi.testclient import TestClient

from optigrade.api.app import JsonFileRepository, create_app


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _catalog_payload(total_credits: float) -> dict:
    return {
        "academicYear": "2022/2023",
        "programName": "Software",
        "generalRules": {
            "totalCredits": total_credits,
            "mustChooseCoreGroups": 0,
            "mustTakeSpecialities": 0,
            "enrichment": 0,
            "physicalEducation": 0,
            "malag": 0,
        },
        "mandatory": [],
        "core": [],
        "facultyChoice": [],
        "specialties": [],
    }


def _student_payload() -> dict:
    return {
        "student_id": "student_123",
        "courses": [
            {
                "course_id": "046195",
                "credits": 3.0,
                "grade": "90",
                "semester": "2022-2023 Winter",
                "name": "Algorithms",
            }
        ],
    }


def _build_client(tmp_path: Path) -> TestClient:
    _write_json(tmp_path / "students" / "student_123.json", _student_payload())
    _write_json(tmp_path / "catalogs" / "software_2022.json", _catalog_payload(total_credits=3.0))
    _write_json(tmp_path / "catalogs" / "software_2021.json", _catalog_payload(total_credits=3.0))
    _write_json(
        tmp_path / "availability" / "software.json",
        {
            "semesters": {
                "2026_winter": [
                    {"code": "046200", "credits": 3.0, "nameEn": "Future 1"},
                    {"code": "046201", "credits": 3.0, "nameEn": "Future 2"},
                ]
            }
        },
    )
    app = create_app(
        students_repo=JsonFileRepository(tmp_path / "students"),
        catalogs_repo=JsonFileRepository(tmp_path / "catalogs"),
        availability_repo=JsonFileRepository(tmp_path / "availability"),
    )
    return TestClient(app)


def test_finish_feasible_request_returns_200(tmp_path: Path) -> None:
    client = _build_client(tmp_path)
    response = client.post(
        "/simulations/finish-degree",
        json={
            "student_profile_id": "student_123",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "catalog_search_strategy": "selected_only",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "feasible"


def test_finish_infeasible_request_returns_200_with_diagnostics(tmp_path: Path) -> None:
    _write_json(tmp_path / "students" / "student_123.json", _student_payload())
    _write_json(tmp_path / "catalogs" / "software_2022.json", _catalog_payload(total_credits=20.0))
    app = create_app(
        students_repo=JsonFileRepository(tmp_path / "students"),
        catalogs_repo=JsonFileRepository(tmp_path / "catalogs"),
        availability_repo=JsonFileRepository(tmp_path / "availability"),
    )
    client = TestClient(app)
    response = client.post(
        "/simulations/finish-degree",
        json={
            "student_profile_id": "student_123",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "catalog_search_strategy": "selected_only",
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "infeasible"
    assert payload["diagnostics"]


def test_planning_request_returns_top_2_plans(tmp_path: Path) -> None:
    client = _build_client(tmp_path)
    response = client.post(
        "/simulations/plan-degree",
        json={
            "student_profile_id": "student_123",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "locked_course_offering_ids": [],
            "blocked_course_ids": [],
            "future_semesters": ["2026_winter"],
            "num_plans": 2,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "optimal"
    assert len(payload["plans"]) == 2


def test_planning_invalid_course_id_returns_422(tmp_path: Path) -> None:
    client = _build_client(tmp_path)
    response = client.post(
        "/simulations/plan-degree",
        json={
            "student_profile_id": "student_123",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "locked_course_offering_ids": [],
            "blocked_course_ids": ["bad-course"],
            "future_semesters": ["2026_winter"],
            "num_plans": 2,
        },
    )
    assert response.status_code == 422


def test_missing_student_profile_returns_404(tmp_path: Path) -> None:
    _write_json(tmp_path / "catalogs" / "software_2022.json", _catalog_payload(total_credits=6.0))
    app = create_app(
        students_repo=JsonFileRepository(tmp_path / "students"),
        catalogs_repo=JsonFileRepository(tmp_path / "catalogs"),
        availability_repo=JsonFileRepository(tmp_path / "availability"),
    )
    client = TestClient(app)
    response = client.post(
        "/simulations/finish-degree",
        json={
            "student_profile_id": "missing",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "catalog_search_strategy": "selected_only",
        },
    )
    assert response.status_code == 404


def test_invalid_catalog_year_returns_404(tmp_path: Path) -> None:
    _write_json(tmp_path / "students" / "student_123.json", _student_payload())
    app = create_app(
        students_repo=JsonFileRepository(tmp_path / "students"),
        catalogs_repo=JsonFileRepository(tmp_path / "catalogs"),
        availability_repo=JsonFileRepository(tmp_path / "availability"),
    )
    client = TestClient(app)
    response = client.post(
        "/simulations/finish-degree",
        json={
            "student_profile_id": "student_123",
            "degree_id": "software",
            "catalog_year": 2022,
            "selected_specialties": [],
            "catalog_search_strategy": "selected_only",
        },
    )
    assert response.status_code == 404
