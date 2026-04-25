from decimal import Decimal

from optigrade.domain.student import (
    CourseInstanceStatus,
    StudentCourseInstance,
    StudentProfile,
)
from optigrade.solver.candidates import build_finish_candidates


def _instance(
    *,
    instance_id: str,
    course_id: str,
    status: CourseInstanceStatus,
    eligible_bucket_ids: set[str],
    verified: bool = True,
) -> StudentCourseInstance:
    return StudentCourseInstance(
        course_instance_id=instance_id,
        course_id=course_id,
        term="2024_spring",
        credits=Decimal("3.0"),
        credit_units=6,
        status=status,
        source="transcript",
        verified=verified,
        eligible_bucket_ids=eligible_bucket_ids,
    )


def test_candidate_builder_excludes_failed_and_unresolved() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="i1",
                course_id="046195",
                status=CourseInstanceStatus.RECOGNIZED_FAILED,
                eligible_bucket_ids={"core"},
            ),
            _instance(
                instance_id="i2",
                course_id="046196",
                status=CourseInstanceStatus.UNKNOWN_UNRESOLVED,
                eligible_bucket_ids={"core"},
            ),
        ],
        manual_tags=[],
    )
    result = build_finish_candidates(profile)
    assert result.candidates == []


def test_candidate_builder_includes_unknown_student_tagged_unverified() -> None:
    tagged = _instance(
        instance_id="i3",
        course_id="999001",
        status=CourseInstanceStatus.UNKNOWN_STUDENT_TAGGED,
        eligible_bucket_ids={"enrichment"},
        verified=False,
    )
    profile = StudentProfile(
        student_id="s2",
        degree_start_year=2022,
        completed_courses=[tagged],
        manual_tags=[],
    )
    result = build_finish_candidates(profile)
    assert len(result.candidates) == 1
    assert result.candidates[0].course_id == "999001"
    assert result.candidates[0].verified is False


def test_candidate_builder_warns_and_counts_non_sports_duplicate_once() -> None:
    profile = StudentProfile(
        student_id="s3",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="i4",
                course_id="046195",
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                eligible_bucket_ids={"core"},
            ),
            _instance(
                instance_id="i5",
                course_id="046195",
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                eligible_bucket_ids={"core"},
            ),
        ],
        manual_tags=[],
    )
    result = build_finish_candidates(profile)
    assert len(result.candidates) == 1
    assert len(result.warnings) == 1


def test_candidate_builder_preserves_sports_duplicates() -> None:
    profile = StudentProfile(
        student_id="s4",
        degree_start_year=2022,
        completed_courses=[
            _instance(
                instance_id="i6",
                course_id="3940800",
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                eligible_bucket_ids={"sports"},
            ),
            _instance(
                instance_id="i7",
                course_id="3940800",
                status=CourseInstanceStatus.RECOGNIZED_PASSED,
                eligible_bucket_ids={"sports"},
            ),
        ],
        manual_tags=[],
    )
    result = build_finish_candidates(profile)
    assert len(result.candidates) == 2
    assert result.warnings == []
