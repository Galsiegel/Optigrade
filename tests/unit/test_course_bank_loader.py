from optigrade.loaders.course_bank_loader import build_course_bank_from_catalogs


def _catalog(year: str, mandatory_entries: list[dict]) -> dict:
    return {
        "academicYear": year,
        "mandatory": mandatory_entries,
        "core": [],
        "facultyChoice": [],
        "specialties": [],
    }


def test_duplicate_same_credit_passes() -> None:
    raw_catalogs = [
        _catalog("2022/2023", [{"code": "046195", "credits": 3.5, "nameEn": "ML"}]),
        _catalog("2022/2023", [{"code": "046195", "credits": 3.5, "nameEn": "Machine Learning"}]),
    ]
    bank = build_course_bank_from_catalogs(raw_catalogs)
    assert ("046195", "2022_fall") in bank
    assert bank[("046195", "2022_fall")].credit_units == 7


def test_duplicate_conflicting_credit_fails() -> None:
    raw_catalogs = [
        _catalog("2022/2023", [{"code": "046195", "credits": 3.0}]),
        _catalog("2022/2023", [{"code": "046195", "credits": 3.5}]),
    ]
    try:
        build_course_bank_from_catalogs(raw_catalogs)
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for conflicting same-year credits")


def test_same_course_different_years_allowed() -> None:
    raw_catalogs = [
        _catalog("2021/2022", [{"code": "046195", "credits": 3.0}]),
        _catalog("2022/2023", [{"code": "046195", "credits": 3.5}]),
    ]
    bank = build_course_bank_from_catalogs(raw_catalogs)
    assert bank[("046195", "2021_fall")].credit_units == 6
    assert bank[("046195", "2022_fall")].credit_units == 7
