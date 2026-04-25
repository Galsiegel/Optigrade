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
        total_credit_units=12,
        mandatory_course_ids={"046195"},
        core_course_ids={"046195", "046267"},
        required_core_count=1,
        required_specialty_count=0,
        specialties={},
        enrichment_min_credit_units=2,
        sports_min_credit_units=2,
        malag_min_credit_units=2,
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


def test_model_builder_adds_mandatory_core_and_total_credit_constraints() -> None:
    candidates = [
        _candidate(
            course_instance_id="ci_10",
            course_id="046195",
            eligible_bucket_ids={"core"},
        ),
        _candidate(
            course_instance_id="ci_11",
            course_id="046267",
            eligible_bucket_ids={"core"},
        ),
    ]
    context = build_finish_model(candidates=candidates, degree_catalog=_catalog())

    mandatory_constraints = [
        constraint for constraint in context.constraints if constraint.type == "mandatory_completion"
    ]
    assert len(mandatory_constraints) == 1
    mandatory_constraint = mandatory_constraints[0]
    assert mandatory_constraint.details["course_id"] == "046195"
    assert mandatory_constraint.details["x_vars"] == ["x_ci_10"]
    assert mandatory_constraint.details["min_selected"] == 1

    core_constraints = [
        constraint for constraint in context.constraints if constraint.type == "core_count_minimum"
    ]
    assert len(core_constraints) == 1
    core_constraint = core_constraints[0]
    assert set(core_constraint.details["alloc_vars"]) == {"alloc_ci_10_core", "alloc_ci_11_core"}
    assert core_constraint.details["required_core_count"] == 1

    total_credit_constraints = [
        constraint for constraint in context.constraints if constraint.type == "total_credit_minimum"
    ]
    assert len(total_credit_constraints) == 1
    total_credit_constraint = total_credit_constraints[0]
    assert total_credit_constraint.details["required_total_credit_units"] == 12
    assert len(total_credit_constraint.details["terms"]) == 2

    bucket_credit_constraints = [
        constraint for constraint in context.constraints if constraint.type == "bucket_credit_minimum"
    ]
    assert len(bucket_credit_constraints) == 3
    by_bucket_id = {
        str(constraint.details["bucket_id"]): constraint.details for constraint in bucket_credit_constraints
    }
    assert by_bucket_id["enrichment"]["required_credit_units"] == 2
    assert by_bucket_id["sports"]["required_credit_units"] == 2
    assert by_bucket_id["malag"]["required_credit_units"] == 2
