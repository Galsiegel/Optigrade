"""Manual tag application and audit logging service."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from typing import Protocol

from optigrade.domain.student import ManualCourseTag, StudentProfile
from optigrade.domain.transcript import ManualTagAuditRecord


class ManualTagAuditRepository(Protocol):
    def append(self, record: ManualTagAuditRecord) -> None:
        """Store manual-tag audit record."""

    def list_all(self) -> list[ManualTagAuditRecord]:
        """Return all manual-tag audit records."""


class InMemoryManualTagAuditRepository:
    def __init__(self) -> None:
        self._records: list[ManualTagAuditRecord] = []

    def append(self, record: ManualTagAuditRecord) -> None:
        self._records.append(record)

    def list_all(self) -> list[ManualTagAuditRecord]:
        return list(self._records)


def apply_manual_tag(
    student_profile: StudentProfile,
    *,
    course_code: str,
    credits,
    bucket_types: list[str],
    comment: str | None = None,
    audit_repository: ManualTagAuditRepository | None = None,
    degree_id: str | None = None,
    catalog_year: int | None = None,
) -> StudentProfile:
    manual_tag = ManualCourseTag(
        course_code=course_code,
        credits=credits,
        bucket_types=set(bucket_types),
        comment=comment,
    )
    updated_profile = replace(
        student_profile,
        manual_tags=[*student_profile.manual_tags, manual_tag],
    )
    if audit_repository is not None:
        audit_repository.append(
            ManualTagAuditRecord(
                student_id=student_profile.student_id,
                course_code=manual_tag.course_code,
                credits=manual_tag.credits,
                bucket_types=sorted(manual_tag.bucket_types),
                comment=manual_tag.comment,
                degree_id=degree_id,
                catalog_year=catalog_year,
                created_at=datetime.now(timezone.utc),
            )
        )
    return updated_profile
