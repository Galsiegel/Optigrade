from decimal import Decimal

from optigrade.domain.student import StudentProfile
from optigrade.services.manual_tag_service import (
    InMemoryManualTagAuditRepository,
    apply_manual_tag,
)


def test_apply_manual_tag_appends_tag_and_audit_record() -> None:
    profile = StudentProfile(
        student_id="s1",
        degree_start_year=2022,
        completed_courses=[],
        manual_tags=[],
    )
    audit_repo = InMemoryManualTagAuditRepository()
    updated = apply_manual_tag(
        profile,
        course_code="999001",
        credits=Decimal("2.0"),
        bucket_types=["enrichment", "core"],
        comment="manual correction",
        audit_repository=audit_repo,
        degree_id="software_eng",
        catalog_year=2022,
    )

    assert len(updated.manual_tags) == 1
    assert updated.manual_tags[0].course_code == "999001"
    records = audit_repo.list_all()
    assert len(records) == 1
    assert records[0].student_id == "s1"
    assert records[0].course_code == "999001"
    assert records[0].bucket_types == ["core", "enrichment"]


def test_apply_manual_tag_does_not_mutate_original_profile_and_sets_audit_defaults() -> None:
    profile = StudentProfile(
        student_id="s2",
        degree_start_year=2021,
        completed_courses=[],
        manual_tags=[],
    )
    audit_repo = InMemoryManualTagAuditRepository()

    updated = apply_manual_tag(
        profile,
        course_code="123456",
        credits=Decimal("1.5"),
        bucket_types=["sports"],
        comment=None,
        audit_repository=audit_repo,
    )

    assert profile.manual_tags == []
    assert len(updated.manual_tags) == 1
    record = audit_repo.list_all()[0]
    assert record.used_in_successful_export is False
    assert record.created_at is not None
