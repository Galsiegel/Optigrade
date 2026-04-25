import json
from pathlib import Path

from optigrade.loaders.catalog_loader import load_catalog_from_dict, load_catalog_from_path


def _sample_catalog() -> dict:
    return {
        "academicYear": "2022/2023",
        "programName": "B.Sc in Computer and Software Engineering",
        "generalRules": {
            "totalCredits": 159.5,
            "mustChooseCoreGroups": 1,
            "mustTakeSpecialities": 1,
            "enrichment": 6,
            "physicalEducation": 2,
        },
        "mandatory": [
            {"code": "044102", "credits": 0},
        ],
        "core": [
            {"code": "046267", "credits": 3},
        ],
        "specialties": [
            {
                "trackId": "specialty_ai",
                "nameEn": "AI",
                "nameHe": "AI",
                "requirements": {
                    "mandatoryCourses": ["046195"],
                    "chooseOneOfGroups": [
                        ["046203", "046204"],
                        {"courses": ["046205", "046206"], "requiredCount": 1},
                    ],
                    "minimumTotalCourses": 2,
                },
                "courses": [
                    {"code": "046195", "credits": 3.5},
                    {"code": "046203", "credits": 3},
                    {"code": "046204", "credits": 3},
                    {"code": "046205", "credits": 3},
                    {"code": "046206", "credits": 3},
                ],
            }
        ],
    }


def test_catalog_loader_parses_mandatory_core_specialties() -> None:
    catalog = load_catalog_from_dict(
        _sample_catalog(),
        degree_id="computer_software_engineering",
    )
    assert catalog.academic_year == 2022
    assert "044102" in catalog.mandatory_course_ids
    assert "046267" in catalog.core_course_ids
    assert catalog.total_credit_units == 319
    assert catalog.required_core_count == 1
    assert catalog.required_specialty_count == 1
    specialty = catalog.specialties["specialty_ai"]
    assert specialty.minimum_total_courses == 2
    assert len(specialty.choose_groups) == 2
    assert specialty.choose_groups[0].required_count == 1
    assert specialty.choose_groups[1].required_count == 1


def test_catalog_loader_supports_path_loading(tmp_path: Path) -> None:
    raw_catalog = _sample_catalog()
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(json.dumps(raw_catalog), encoding="utf-8")
    catalog = load_catalog_from_path(
        path=catalog_path,
        degree_id="computer_software_engineering",
    )
    assert catalog.program_name == "B.Sc in Computer and Software Engineering"


def test_catalog_loader_rejects_invalid_specialty_count() -> None:
    raw_catalog = _sample_catalog()
    raw_catalog["generalRules"]["mustTakeSpecialities"] = 5
    try:
        load_catalog_from_dict(raw_catalog, degree_id="computer_software_engineering")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for invalid specialty count")
