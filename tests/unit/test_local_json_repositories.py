from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from optigrade.domain.course import CourseOffering, CreditValue
from optigrade.domain.simulation import FutureAvailabilityPool
from optigrade.domain.transcript import ManualTagAuditRecord
from optigrade.loaders.catalog_loader import load_catalog_from_dict
from optigrade.loaders.student_loader import load_student_profile_from_dict
from optigrade.repositories.base import SimulationHistoryRecord
from optigrade.repositories.local_json import (
    LocalJsonAvailabilityPoolRepository,
    LocalJsonDegreeCatalogRepository,
    LocalJsonManualTagAuditRepository,
    LocalJsonSimulationHistoryRepository,
    LocalJsonStudentProfileRepository,
)


def _catalog_payload(total_credits: float = 3.0) -> dict:
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
        "student_id": "student_1",
        "courses": [
            {
                "course_id": "046195",
                "credits": 3.0,
                "grade": "90",
                "semester": "2022-2023 Winter",
                "name": "Algorithms",
            }
        ],
        "manual_tags": [],
    }


def test_local_json_student_profile_repository_round_trip(tmp_path: Path) -> None:
    repo = LocalJsonStudentProfileRepository(tmp_path / "students")
    profile = load_student_profile_from_dict(_student_payload())

    repo.save(profile)
    loaded = repo.get("student_1")

    assert loaded is not None
    assert loaded.student_id == "student_1"
    assert len(loaded.completed_courses) == 1
    assert loaded.completed_courses[0].course_id == "046195"


def test_local_json_degree_catalog_repository_get_and_list(tmp_path: Path) -> None:
    repo = LocalJsonDegreeCatalogRepository(tmp_path / "catalogs")
    catalog = load_catalog_from_dict(_catalog_payload(3.0), degree_id="software")
    repo.save(catalog)
    repo.save(load_catalog_from_dict(_catalog_payload(6.0), degree_id="software"))

    loaded = repo.get("software", 2022)
    listed = repo.list_for_degree("software")

    assert loaded is not None
    assert loaded.academic_year == 2022
    assert listed
    assert listed[0][0] == 2022


def test_local_json_availability_repository_round_trip(tmp_path: Path) -> None:
    repo = LocalJsonAvailabilityPoolRepository(tmp_path / "availability")
    credits = CreditValue.from_credits(3.0)
    repo.save(
        "software",
        FutureAvailabilityPool(
            semesters={
                "2026_winter": [
                    CourseOffering(
                        course_id="046200",
                        term="2026_winter",
                        credits=credits.credits,
                        credit_units=credits.credit_units,
                        name_en="Future Course",
                    )
                ]
            }
        ),
    )
    loaded = repo.get("software")
    assert loaded is not None
    assert "2026_winter" in loaded.semesters
    assert loaded.semesters["2026_winter"][0].course_id == "046200"


def test_local_json_manual_tag_audit_repository_persists_records(tmp_path: Path) -> None:
    repo = LocalJsonManualTagAuditRepository(tmp_path / "manual_tag_audit.json")
    record = ManualTagAuditRecord(
        student_id="student_1",
        course_code="123456",
        credits=Decimal("2.0"),
        bucket_types=["core"],
        comment="manual",
        degree_id="software",
        catalog_year=2022,
        created_at=datetime.now(timezone.utc),
        used_in_successful_export=True,
    )
    repo.append(record)

    rows = repo.list_all()
    assert len(rows) == 1
    assert rows[0].course_code == "123456"
    assert rows[0].used_in_successful_export is True


def test_local_json_simulation_history_repository_filters_by_student(tmp_path: Path) -> None:
    repo = LocalJsonSimulationHistoryRepository(tmp_path / "simulation_history.json")
    repo.append(
        SimulationHistoryRecord(
            student_id="student_1",
            event_type="finish_simulation",
            status="feasible",
            degree_id="software",
            catalog_year=2022,
        )
    )
    repo.append(
        SimulationHistoryRecord(
            student_id="student_2",
            event_type="plan_simulation",
            status="optimal",
        )
    )

    history = repo.list_for_student("student_1")
    assert len(history) == 1
    assert history[0].event_type == "finish_simulation"
