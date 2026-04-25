from __future__ import annotations

import json
from pathlib import Path

from classes.degree import Degree
from classes.faculty import Faculty
from classes.programs import BucketType, Program_bucket
from classes.student import StudentProfile


FIXTURES_ROOT = Path(__file__).resolve().parent.parent / "fixtures" / "scenarios"


def _load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def test_student_profile_roundtrip_scenario() -> None:
    scenario_dir = FIXTURES_ROOT / "student_profile_roundtrip"
    input_payload = _load_json(scenario_dir / "input.json")
    expected = _load_json(scenario_dir / "expected.json")

    profile = StudentProfile.from_dict(input_payload["student_profile"])

    assert profile.passed_course_ids == set(expected["passed_course_ids"])
    assert profile.to_dict() == expected["roundtrip_dict"]
    assert profile.course_credits == {
        (row["course_id"], row["semester"]): row["effective_credits"]
        for row in expected["course_credits"]
    }


def test_degree_bucket_assembly_scenario() -> None:
    scenario_dir = FIXTURES_ROOT / "degree_bucket_assembly"
    input_payload = _load_json(scenario_dir / "input.json")
    expected = _load_json(scenario_dir / "expected.json")

    faculty = Faculty(name=input_payload["faculty_name"])
    must = Program_bucket(
        type_of_bucket=BucketType.MANDATORY,
        name=input_payload["must"]["name"],
        allowed_course_ids=set(input_payload["must"]["allowed_course_ids"]),
    )
    core = Program_bucket(
        type_of_bucket=BucketType.CORE,
        name=input_payload["core"]["name"],
        allowed_course_ids=set(input_payload["core"]["allowed_course_ids"]),
    )
    specialties = [
        Program_bucket(
            type_of_bucket=BucketType.SPECIALTY,
            name=item["name"],
            allowed_course_ids=set(item["allowed_course_ids"]),
            mandatory_knowledge_ids=set(item["mandatory_knowledge_ids"]),
        )
        for item in input_payload["specialties"]
    ]

    degree = Degree(
        name=input_payload["degree_name"],
        faculty=faculty,
        must=must,
        core=core,
        possible_specialties=specialties,
    )

    assert [b.name for b in degree.get_buckets()] == expected["bucket_names_in_order"]
    assert [b.name for b in degree.get_specialties_bucket()] == expected["specialty_bucket_names"]
