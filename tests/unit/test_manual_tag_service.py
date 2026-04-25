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
