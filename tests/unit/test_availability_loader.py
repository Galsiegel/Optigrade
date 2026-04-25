import json
from pathlib import Path

from optigrade.loaders.availability_loader import (
    load_availability_pool_from_dict,
    load_availability_pool_from_path,
)


def _availability_payload() -> dict:
    return {
        "semesters": {
            "2026_winter": [
                {"code": "046195", "nameEn": "Machine Learning", "credits": 3.5},
                {"code": "046267", "nameEn": "Computer Architecture", "credits": 3.0, "archived": True},
            ],
            "2026_spring": [
                {"code": "046209", "nameEn": "OS", "credits": 3.5},
                {"code": "046210", "nameEn": "OS Lab", "credits": 1.0},
            ],
        }
    }


def test_load_availability_pool_multiple_semesters() -> None:
    pool = load_availability_pool_from_dict(_availability_payload())
    assert set(pool.semesters.keys()) == {"2026_winter", "2026_spring"}
    assert len(pool.semesters["2026_winter"]) == 1
    assert len(pool.semesters["2026_spring"]) == 2


def test_availability_pool_union_of_offerings() -> None:
    pool = load_availability_pool_from_dict(_availability_payload())
    all_codes = {offering.course_id for offering in pool.all_offerings()}
    assert all_codes == {"046195", "046209", "046210"}


def test_availability_pool_path_loading(tmp_path: Path) -> None:
    payload = _availability_payload()
    path = tmp_path / "availability.json"
    path.write_text(json.dumps(payload), encoding="utf-8")
    pool = load_availability_pool_from_path(path)
    assert "2026_winter" in pool.semesters
