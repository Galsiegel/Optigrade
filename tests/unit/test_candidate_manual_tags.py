from decimal import Decimal

from optigrade.domain.student import ManualCourseTag, StudentProfile
from optigrade.solver.candidates import build_finish_candidates


def test_build_finish_candidates_includes_manual_tags() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[],
        manual_tags=[
            ManualCourseTag(
                course_code="999001",
                credits=Decimal("2.0"),
                bucket_types={"enrichment"},
                comment="manual",
            )
        ],
    )
    result = build_finish_candidates(profile)
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.course_id == "999001"
    assert candidate.source == "manual_tag"
    assert candidate.verified is False
    assert candidate.is_solver_eligible is True
