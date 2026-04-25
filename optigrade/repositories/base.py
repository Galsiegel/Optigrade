"""Repository protocols and shared persistence models."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Protocol

from optigrade.domain.catalog import DegreeCatalog
from optigrade.domain.course import CourseOffering
from optigrade.domain.simulation import FutureAvailabilityPool
from optigrade.domain.student import StudentProfile
from optigrade.domain.transcript import ManualTagAuditRecord


class RepositoryError(RuntimeError):
    """Base repository-layer error."""


class RepositoryNotFoundError(RepositoryError):
    """Requested entity was not found."""


class RepositoryValidationError(RepositoryError):
    """Requested write payload is invalid."""


class RepositoryConflictError(RepositoryError):
    """Requested write conflicts with existing data."""


class RepositoryStorageError(RepositoryError):
    """Underlying storage operation failed."""


@dataclass(frozen=True)
class SimulationHistoryRecord:
    student_id: str
    event_type: str
    status: str
    degree_id: str | None = None
    catalog_year: int | None = None
    selected_specialties: list[str] = field(default_factory=list)
    diagnostics: list[dict[str, Any]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    export_generated: bool = False


class StudentProfileRepository(Protocol):
    def get(self, student_id: str) -> StudentProfile | None: ...

    def save(self, profile: StudentProfile) -> None: ...


class DegreeCatalogRepository(Protocol):
    def get(self, degree_id: str, catalog_year: int) -> DegreeCatalog | None: ...

    def list_for_degree(self, degree_id: str) -> list[tuple[int, DegreeCatalog]]: ...

    def save(self, catalog: DegreeCatalog) -> None: ...


class CourseBankRepository(Protocol):
    def get_all(self) -> dict[tuple[str, str], CourseOffering]: ...

    def save_all(self, offerings: dict[tuple[str, str], CourseOffering]) -> None: ...


class AvailabilityPoolRepository(Protocol):
    def get(self, degree_id: str) -> FutureAvailabilityPool | None: ...

    def save(self, degree_id: str, pool: FutureAvailabilityPool) -> None: ...


class SimulationHistoryRepository(Protocol):
    def append(self, record: SimulationHistoryRecord) -> None: ...

    def list_for_student(self, student_id: str) -> list[SimulationHistoryRecord]: ...


class ManualTagAuditRepository(Protocol):
    def append(self, record: ManualTagAuditRecord) -> None: ...

    def list_all(self) -> list[ManualTagAuditRecord]: ...

