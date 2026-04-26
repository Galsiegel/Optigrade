from __future__ import annotations

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.simulation import FinishSimulationResult
from optigrade.domain.student import StudentProfile


def assert_valid_finish_result(
    result: FinishSimulationResult,
    catalog: DegreeCatalog,
    student_profile: StudentProfile,
    selected_specialty_ids: set[str] | None = None,
) -> None:
    """Assert generic invariants every feasible finish-degree result must satisfy."""
    assert result.status == "feasible"

    assigned_instance_ids = [item.course_instance_id for item in result.bucket_assignments]
    assert len(assigned_instance_ids) == len(set(assigned_instance_ids))
    assert result.summary.total_selected_courses == len(result.bucket_assignments)

    assigned_course_ids = {item.course_id for item in result.bucket_assignments}
    assert catalog.mandatory_course_ids <= assigned_course_ids

    active_specialty_ids = selected_specialty_ids or set(catalog.specialties)
    for specialty_id in active_specialty_ids:
        specialty = catalog.specialties[specialty_id]
        assert set(specialty.mandatory_courses) <= assigned_course_ids
        for group in specialty.choose_groups:
            if group.required_count == 0:
                continue
            selected_from_group = assigned_course_ids.intersection(group.courses)
            assert len(selected_from_group) >= group.required_count

        visible_specialty_courses = [
            item
            for item in result.bucket_assignments
            if item.bucket_id == f"specialty:{specialty_id}"
            and item.course_id in specialty.eligible_course_ids
        ]
        assert len(visible_specialty_courses) >= specialty.minimum_total_courses

    assert result.summary.total_selected_credit_units >= catalog.total_credit_units

    unused_instance_ids = {item.course_instance_id for item in result.extra_unused_courses}
    assert unused_instance_ids.isdisjoint(assigned_instance_ids)

    completed_by_instance_id = {
        course.course_instance_id: course for course in student_profile.completed_courses
    }
    for manual_course in result.manual_unverified_courses:
        source = completed_by_instance_id[manual_course.course_instance_id]
        assert manual_course.verified is False
        assert source.verified is False
