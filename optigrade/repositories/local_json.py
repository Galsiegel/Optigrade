"""Local JSON repository implementations for development."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.course import CourseOffering
from optigrade.domain.simulation import FutureAvailabilityPool
from optigrade.domain.student import CourseInstanceStatus, StudentProfile
from optigrade.domain.transcript import ManualTagAuditRecord
from optigrade.loaders.availability_loader import load_availability_pool_from_dict
from optigrade.loaders.catalog_loader import load_catalog_from_dict
from optigrade.loaders.course_bank_loader import build_course_bank_from_catalogs
from optigrade.loaders.student_loader import load_student_profile_from_dict
from optigrade.repositories.base import (
    AvailabilityPoolRepository,
    CourseBankRepository,
    DegreeCatalogRepository,
    ManualTagAuditRepository,
    SimulationHistoryRecord,
    SimulationHistoryRepository,
    StudentProfileRepository,
)


class JsonFileRepository:
    """Compatibility wrapper used by current API tests."""

    def __init__(self, root_dir: Path) -> None:
        self.root_dir = root_dir

    def load(self, key: str) -> dict[str, Any] | None:
        path = self.root_dir / f"{key}.json"
        if not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))


class LocalJsonStudentProfileRepository(StudentProfileRepository):
    def __init__(self, root_dir: Path) -> None:
        self._root_dir = root_dir

    def get(self, student_id: str) -> StudentProfile | None:
        payload = JsonFileRepository(self._root_dir).load(student_id)
        if payload is None:
            return None
        return load_student_profile_from_dict(payload)

    def save(self, profile: StudentProfile) -> None:
        raw_courses = []
        for course in profile.completed_courses:
            if course.status == CourseInstanceStatus.RECOGNIZED_FAILED:
                grade = "0"
            elif course.status == CourseInstanceStatus.RECOGNIZED_PASSED:
                grade = "pass"
            else:
                grade = ""
            raw_courses.append(
                {
                    "course_id": str(course.course_id),
                    "credits": float(course.credits),
                    "grade": grade,
                    "semester": str(course.term) if course.term else None,
                    "name": course.comment,
                }
            )
        payload = {
            "student_id": profile.student_id,
            "courses": raw_courses,
            "manual_tags": [
                {
                    "course_code": str(tag.course_code),
                    "credits": float(tag.credits),
                    "bucket_types": sorted(tag.bucket_types),
                    "comment": tag.comment,
                }
                for tag in profile.manual_tags
            ],
        }
        _write_json(self._root_dir / f"{profile.student_id}.json", payload)


class LocalJsonDegreeCatalogRepository(DegreeCatalogRepository):
    def __init__(self, root_dir: Path) -> None:
        self._root_dir = root_dir

    def get(self, degree_id: str, catalog_year: int) -> DegreeCatalog | None:
        payload = JsonFileRepository(self._root_dir).load(f"{degree_id}_{catalog_year}")
        if payload is None:
            return None
        return load_catalog_from_dict(payload, degree_id=degree_id)

    def list_for_degree(self, degree_id: str) -> list[tuple[int, DegreeCatalog]]:
        results: list[tuple[int, DegreeCatalog]] = []
        for path in sorted(self._root_dir.glob(f"{degree_id}_*.json")):
            year_text = path.stem.split("_")[-1]
            if not year_text.isdigit():
                continue
            year = int(year_text)
            payload = json.loads(path.read_text(encoding="utf-8"))
            results.append((year, load_catalog_from_dict(payload, degree_id=degree_id)))
        return sorted(results, key=lambda item: item[0])

    def save(self, catalog: DegreeCatalog) -> None:
        payload = {
            "academicYear": f"{catalog.academic_year}/{catalog.academic_year + 1}",
            "programName": catalog.program_name,
            "generalRules": {
                "totalCredits": catalog.total_credit_units / 2,
                "mustChooseCoreGroups": catalog.required_core_count,
                "mustTakeSpecialities": catalog.required_specialty_count,
                "enrichment": catalog.enrichment_min_credit_units / 2,
                "physicalEducation": catalog.sports_min_credit_units / 2,
                "malag": catalog.malag_min_credit_units / 2,
            },
            "mandatory": [{"code": cid} for cid in sorted(catalog.mandatory_course_ids)],
            "core": [{"code": cid} for cid in sorted(catalog.core_course_ids)],
            "facultyChoice": [{"code": cid} for cid in sorted(catalog.faculty_choice_course_ids)],
            "specialties": [
                {
                    "trackId": specialty.specialty_id,
                    "nameEn": specialty.name_en,
                    "nameHe": specialty.name_he,
                    "requirements": {
                        "mandatoryCourses": list(specialty.mandatory_courses),
                        "chooseOneOfGroups": [
                            {
                                "courses": list(group.courses),
                                "requiredCount": group.required_count,
                            }
                            for group in specialty.choose_groups
                        ],
                        "minimumTotalCourses": specialty.minimum_total_courses,
                    },
                    "courses": [{"code": cid} for cid in sorted(specialty.eligible_course_ids)],
                }
                for specialty in catalog.specialties.values()
            ],
        }
        _write_json(
            self._root_dir / f"{catalog.degree_id}_{catalog.academic_year}.json",
            payload,
        )


class LocalJsonAvailabilityPoolRepository(AvailabilityPoolRepository):
    def __init__(self, root_dir: Path) -> None:
        self._root_dir = root_dir

    def get(self, degree_id: str) -> FutureAvailabilityPool | None:
        payload = JsonFileRepository(self._root_dir).load(degree_id)
        if payload is None:
            return None
        return load_availability_pool_from_dict(payload)

    def save(self, degree_id: str, pool: FutureAvailabilityPool) -> None:
        payload = {
            "semesters": {
                semester: [
                    {
                        "code": str(offering.course_id),
                        "credits": float(offering.credits),
                        "nameEn": offering.name_en,
                        "nameHe": offering.name_he,
                        "metadata": offering.metadata,
                        "archived": offering.archived,
                    }
                    for offering in offerings
                ]
                for semester, offerings in pool.semesters.items()
            }
        }
        _write_json(self._root_dir / f"{degree_id}.json", payload)


class LocalJsonCourseBankRepository(CourseBankRepository):
    def __init__(self, file_path: Path) -> None:
        self._file_path = file_path

    def get_all(self) -> dict[tuple[str, str], CourseOffering]:
        if not self._file_path.exists():
            return {}
        payload = json.loads(self._file_path.read_text(encoding="utf-8"))
        return build_course_bank_from_catalogs(payload)

    def save_all(self, offerings: dict[tuple[str, str], CourseOffering]) -> None:
        payload = []
        for (_course_id, term), offering in sorted(offerings.items()):
            payload.append(
                {
                    "academicYear": term if "/" in term else f"{term}/{term}",
                    "mandatory": [{"code": str(offering.course_id), "credits": float(offering.credits)}],
                    "core": [],
                    "facultyChoice": [],
                    "specialties": [],
                }
            )
        _write_json(self._file_path, payload)


class LocalJsonManualTagAuditRepository(ManualTagAuditRepository):
    def __init__(self, file_path: Path) -> None:
        self._file_path = file_path

    def append(self, record: ManualTagAuditRecord) -> None:
        rows = _load_json_array(self._file_path)
        rows.append(
            {
                "student_id": record.student_id,
                "course_code": record.course_code,
                "credits": float(record.credits),
                "bucket_types": record.bucket_types,
                "comment": record.comment,
                "degree_id": record.degree_id,
                "catalog_year": record.catalog_year,
                "created_at": record.created_at.isoformat(),
                "used_in_successful_export": record.used_in_successful_export,
            }
        )
        _write_json(self._file_path, rows)

    def list_all(self) -> list[ManualTagAuditRecord]:
        rows = _load_json_array(self._file_path)
        records: list[ManualTagAuditRecord] = []
        for row in rows:
            records.append(
                ManualTagAuditRecord(
                    student_id=row["student_id"],
                    course_code=row["course_code"],
                    credits=row["credits"],
                    bucket_types=row["bucket_types"],
                    comment=row.get("comment"),
                    degree_id=row.get("degree_id"),
                    catalog_year=row.get("catalog_year"),
                    created_at=datetime.fromisoformat(row["created_at"]),
                    used_in_successful_export=bool(row.get("used_in_successful_export", False)),
                )
            )
        return records


class LocalJsonSimulationHistoryRepository(SimulationHistoryRepository):
    def __init__(self, file_path: Path) -> None:
        self._file_path = file_path

    def append(self, record: SimulationHistoryRecord) -> None:
        rows = _load_json_array(self._file_path)
        rows.append(
            {
                "student_id": record.student_id,
                "event_type": record.event_type,
                "status": record.status,
                "degree_id": record.degree_id,
                "catalog_year": record.catalog_year,
                "selected_specialties": record.selected_specialties,
                "diagnostics": record.diagnostics,
                "metadata": record.metadata,
                "created_at": record.created_at.isoformat(),
                "export_generated": record.export_generated,
            }
        )
        _write_json(self._file_path, rows)

    def list_for_student(self, student_id: str) -> list[SimulationHistoryRecord]:
        rows = _load_json_array(self._file_path)
        return [
            SimulationHistoryRecord(
                student_id=row["student_id"],
                event_type=row["event_type"],
                status=row["status"],
                degree_id=row.get("degree_id"),
                catalog_year=row.get("catalog_year"),
                selected_specialties=list(row.get("selected_specialties", [])),
                diagnostics=list(row.get("diagnostics", [])),
                metadata=dict(row.get("metadata", {})),
                created_at=datetime.fromisoformat(row["created_at"]),
                export_generated=bool(row.get("export_generated", False)),
            )
            for row in rows
            if row.get("student_id") == student_id
        ]


def _load_json_array(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    return []


def _write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

