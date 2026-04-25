"""Repository protocols and local implementations."""

from .base import (
    AvailabilityPoolRepository,
    CourseBankRepository,
    DegreeCatalogRepository,
    ManualTagAuditRepository,
    SimulationHistoryRecord,
    SimulationHistoryRepository,
    StudentProfileRepository,
)
from .local_json import (
    JsonFileRepository,
    LocalJsonAvailabilityPoolRepository,
    LocalJsonCourseBankRepository,
    LocalJsonDegreeCatalogRepository,
    LocalJsonManualTagAuditRepository,
    LocalJsonSimulationHistoryRepository,
    LocalJsonStudentProfileRepository,
)

__all__ = [
    "AvailabilityPoolRepository",
    "CourseBankRepository",
    "DegreeCatalogRepository",
    "ManualTagAuditRepository",
    "SimulationHistoryRecord",
    "SimulationHistoryRepository",
    "StudentProfileRepository",
    "JsonFileRepository",
    "LocalJsonAvailabilityPoolRepository",
    "LocalJsonCourseBankRepository",
    "LocalJsonDegreeCatalogRepository",
    "LocalJsonManualTagAuditRepository",
    "LocalJsonSimulationHistoryRepository",
    "LocalJsonStudentProfileRepository",
]

