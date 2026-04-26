from __future__ import annotations

from classes.degree import Degree
from classes.faculty import Faculty
from classes.programs import BucketType, Program_bucket


def test_program_bucket_defaults_mandatory_knowledge_to_empty_list() -> None:
    bucket = Program_bucket(
        type_of_bucket=BucketType.MANDATORY,
        name="Mandatory",
        allowed_course_ids={"044101"},
    )
    assert bucket.mandatory_knowledge_ids == []


def test_program_bucket_normalizes_set_to_list() -> None:
    bucket = Program_bucket(
        type_of_bucket=BucketType.SPECIALTY,
        name="AI",
        allowed_course_ids={"046195", "046200"},
        mandatory_knowledge_ids={"046195"},
    )
    assert bucket.mandatory_knowledge_ids == ["046195"]


def test_degree_bucket_accessors_and_order() -> None:
    faculty = Faculty(name="Engineering")
    must = Program_bucket(
        type_of_bucket=BucketType.MANDATORY,
        name="Must",
        allowed_course_ids={"044101"},
    )
    core = Program_bucket(
        type_of_bucket=BucketType.CORE,
        name="Core",
        allowed_course_ids={"044102"},
    )
    specialty = Program_bucket(
        type_of_bucket=BucketType.SPECIALTY,
        name="AI",
        allowed_course_ids={"046195"},
    )

    degree = Degree(
        name="CS",
        faculty=faculty,
        must=must,
        core=core,
        possible_specialties=[specialty],
    )

    assert degree.get_mandatory_bucket() is must
    assert degree.get_core_bucket() is core
    assert degree.get_specialties_bucket() == [specialty]
    assert degree.get_buckets() == [must, core, specialty]
