from decimal import Decimal

from optigrade.domain.student import CourseInstanceStatus, StudentCourseInstance
from optigrade.solver.model_builder import FinishModelContext
from optigrade.solver.solution_extractor import extract_finish_result


def _instance(instance_id: str, course_id: str, verified: bool = True) -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=CourseInstanceStatus.RECOGNIZED_PASSED,
        source="transcript",
        verified=verified,
        eligible_bucket_ids={"core"},
    )


def test_finish_extraction_marks_manual_unverified_courses() -> None:
    candidates = [
        _instance("ci_1", "046195", verified=True),
        _instance("ci_2", "999001", verified=False),
    ]
    context = FinishModelContext(
        x_vars={"ci_1": "x_ci_1", "ci_2": "x_ci_2"},
        alloc_vars={("ci_1", "core"): "alloc_ci_1_core", ("ci_2", "core"): "alloc_ci_2_core"},
        constraints=[],
    )
    result = extract_finish_result(
        candidates=candidates,
        model_context=context,
        status="feasible",
        warnings=[],
        diagnostics=[],
    )
    assert len(result.manual_unverified_courses) == 1
    assert result.manual_unverified_courses[0].course_id == "999001"


def test_finish_extraction_builds_bucket_assignments() -> None:
    candidates = [_instance("ci_3", "046267")]
    context = FinishModelContext(
        x_vars={"ci_3": "x_ci_3"},
        alloc_vars={("ci_3", "core"): "alloc_ci_3_core"},
        constraints=[],
    )
    result = extract_finish_result(
        candidates=candidates,
        model_context=context,
        status="feasible",
        warnings=[],
        diagnostics=[],
    )
    assert len(result.bucket_assignments) == 1
    assert result.bucket_assignments[0].bucket_id == "core"


def test_finish_extraction_reports_extra_unused_courses() -> None:
    candidates = [
        _instance("ci_1", "046195"),
        _instance("ci_2", "046267"),
    ]
    context = FinishModelContext(
        x_vars={"ci_1": "x_ci_1", "ci_2": "x_ci_2"},
        alloc_vars={("ci_1", "core"): "alloc_ci_1_core"},
        constraints=[],
    )
    result = extract_finish_result(
        candidates=candidates,
        model_context=context,
        status="feasible",
        warnings=[],
        diagnostics=[],
        selected_instance_ids={"ci_1"},
    )
    assert len(result.extra_unused_courses) == 1
    assert result.extra_unused_courses[0].course_instance_id == "ci_2"


def test_course_cannot_be_counted_twice_across_buckets() -> None:
    candidates = [_instance("ci_dual", "046195")]
    context = FinishModelContext(
        x_vars={"ci_dual": "x_ci_dual"},
        alloc_vars={
            ("ci_dual", "core"): "alloc_ci_dual_core",
            ("ci_dual", "enrichment"): "alloc_ci_dual_enrichment",
        },
        constraints=[],
    )
    result = extract_finish_result(
        candidates=candidates,
        model_context=context,
        status="feasible",
        warnings=[],
        diagnostics=[],
        selected_instance_ids={"ci_dual"},
    )
    assignments = [a for a in result.bucket_assignments if a.course_instance_id == "ci_dual"]
    assert len(assignments) == 1
