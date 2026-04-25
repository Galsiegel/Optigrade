from pathlib import Path

from optigrade.loaders.catalog_loader import load_catalog_from_path
from optigrade.loaders.course_bank_loader import load_course_bank_from_paths


REPO_ROOT = Path(__file__).resolve().parents[2]
REAL_CATALOG_2022 = (
    REPO_ROOT
    / "data"
    / "carriculom"
    / "computer and software"
    / "B.Sc in Computer and Software Engineering_2022_2023 (2).json"
)
REAL_CATALOG_2023 = (
    REPO_ROOT
    / "data"
    / "carriculom"
    / "computer and software"
    / "B.Sc in Computer and Software Engineering_2023_2024 (1).json"
)


def test_real_catalog_2022_loads_with_expected_shape() -> None:
    catalog = load_catalog_from_path(
        path=REAL_CATALOG_2022,
        degree_id="computer_software_engineering",
    )
    assert catalog.academic_year == 2022
    assert catalog.total_credit_units == 319
    assert "044102" in catalog.mandatory_course_ids
    assert "specialty_1" in catalog.specialties
    assert catalog.required_specialty_count == 2


def test_real_catalog_2023_loads_and_has_specialties() -> None:
    catalog = load_catalog_from_path(
        path=REAL_CATALOG_2023,
        degree_id="computer_software_engineering",
    )
    assert catalog.academic_year == 2023
    assert catalog.total_credit_units > 0
    assert len(catalog.specialties) > 0
    assert catalog.required_specialty_count <= len(catalog.specialties)


def test_real_catalogs_build_course_bank_without_credit_conflicts() -> None:
    bank = load_course_bank_from_paths([REAL_CATALOG_2022, REAL_CATALOG_2023])
    assert len(bank) > 100
    assert ("044102", "2022_fall") in bank
    assert ("044102", "2023_fall") in bank
