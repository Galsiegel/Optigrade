from decimal import Decimal

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance
from optigrade.solver.model_builder import build_finish_model


def _candidate(
    *,
    course_instance_id: str,
    course_id: str,
    eligible_bucket_ids: set[str],
) -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=course_instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=True,
        eligible_bucket_ids=eligible_bucket_ids,
    )


def _catalog() -> DegreeCatalog:
    return DegreeCatalog(
        degree_id="tiny",
        academic_year=2024,
        program_name="tiny",
        total_credit_units=6,
        mandatory_course_ids=set(),
        core_course_ids=set(),
        required_core_count=0,
        required_specialty_count=0,
        specialties={},
    )


def test_model_builder_creates_x_and_alloc_variables() -> None:
    candidates = [
        _candidate(
            course_instance_id="ci_1",
            course_id="046195",
            eligible_bucket_ids={"core", "enrichment"},
        ),
        _candidate(
            course_instance_id="ci_2",
            course_id="046267",
            eligible_bucket_ids={"core"},
        ),
    ]
    context = build_finish_model(candidates=candidates, degree_catalog=_catalog())
    assert set(context.x_vars.keys()) == {"ci_1", "ci_2"}
    assert set(context.alloc_vars.keys()) == {
        ("ci_1", "core"),
        ("ci_1", "enrichment"),
        ("ci_2", "core"),
    }


def test_model_builder_enforces_single_visible_bucket() -> None:
    candidate = _candidate(
        course_instance_id="ci_3",
        course_id="046195",
        eligible_bucket_ids={"core", "enrichment"},
    )
    context = build_finish_model(candidates=[candidate], degree_catalog=_catalog())
    one_bucket_constraints = [
        constraint
        for constraint in context.constraints
        if constraint.type == "one_visible_bucket"
    ]
    assert len(one_bucket_constraints) == 1
    one_bucket_constraint = one_bucket_constraints[0]
    assert one_bucket_constraint.details["course_instance_id"] == "ci_3"
    assert one_bucket_constraint.details["max_visible_buckets"] == 1
    assert set(one_bucket_constraint.details["alloc_vars"]) == {
        "alloc_ci_3_core",
        "alloc_ci_3_enrichment",
    }
