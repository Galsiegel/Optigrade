"""Pydantic schemas for OptiGrade API contracts."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

CourseIdText = Annotated[str, StringConstraints(pattern=r"^\d{6,8}$")]
TermIdText = Annotated[str, StringConstraints(pattern=r"^\d{4}_(winter|spring|summer|fall)$")]


class TranscriptCoursePayload(BaseModel):
    course_id: str
    name: str | None = None
    term: str | None = None
    credits: float | None = None
    grade: str | int | None = None
    status: str | None = None


class TranscriptParseRequest(BaseModel):
    student_name: str | None = None
    student_id_number: str | None = None
    courses: list[TranscriptCoursePayload] = Field(default_factory=list)


class TranscriptParseCourseResponse(BaseModel):
    course_id: str
    name: str | None = None
    term: str | None = None
    credits: float | None = None
    grade: str | int | None = None
    parser_status: str


class TranscriptParseResponse(BaseModel):
    student_name: str | None = None
    student_id_number: str | None = None
    courses: list[TranscriptParseCourseResponse] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ManualTagRequest(BaseModel):
    student_profile_id: str
    course_code: CourseIdText
    credits: float
    bucket_types: list[str] = Field(min_length=1)
    comment: str | None = None
    degree_id: str | None = None
    catalog_year: int | None = None


class ManualTagResponse(BaseModel):
    student_profile_id: str
    total_manual_tags: int


class FinishSimulationRequest(BaseModel):
    student_profile_id: str
    degree_id: str
    catalog_year: int
    selected_specialties: list[str] = Field(default_factory=list)
    catalog_search_strategy: Literal["selected_only", "try_all_from_start_to_current"] = (
        "selected_only"
    )


class PlanningSimulationRequest(BaseModel):
    student_profile_id: str
    degree_id: str
    catalog_year: int
    selected_specialties: list[str] = Field(default_factory=list)
    locked_course_offering_ids: list[str] = Field(default_factory=list)
    blocked_course_ids: list[CourseIdText] = Field(default_factory=list)
    future_semesters: list[TermIdText] = Field(default_factory=list)
    num_plans: int = 2


class CreditSummaryResponse(BaseModel):
    total_selected_credit_units: int
    total_selected_courses: int


class BucketAssignmentResponse(BaseModel):
    course_instance_id: str
    course_id: str
    bucket_id: str
    reason_codes: list[str] = Field(default_factory=list)


class CourseResultResponse(BaseModel):
    course_instance_id: str
    course_id: str
    verified: bool
    reason_codes: list[str] = Field(default_factory=list)


class RuleStatusResponse(BaseModel):
    rule_id: str
    rule_type: str
    status: Literal["satisfied", "unsatisfied", "not_applicable"]
    required: int | float | str | None
    actual: int | float | str | None
    message_en: str
    message_he: str | None = None


class DiagnosticResponse(BaseModel):
    type: str
    severity: str
    related_course_ids: list[str]
    related_bucket_ids: list[str]
    message_en: str
    message_he: str | None = None


class PlanningSuggestedCourseResponse(BaseModel):
    course_instance_id: str
    course_id: str
    term: str
    credit_units: int
    locked_by_student: bool = False


class PlanningPlanResponse(BaseModel):
    rank: int
    future_credit_units: int
    future_course_count: int
    suggested_courses: list[PlanningSuggestedCourseResponse] = Field(default_factory=list)
    bucket_assignments: list[BucketAssignmentResponse] = Field(default_factory=list)
    rule_statuses: list[RuleStatusResponse] = Field(default_factory=list)
    generic_missing_requirements: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class FinishSimulationResponse(BaseModel):
    status: Literal["feasible", "infeasible"]
    degree_id: str
    catalog_year: int
    selected_specialty_ids: list[str] = Field(default_factory=list)
    summary: CreditSummaryResponse
    bucket_assignments: list[BucketAssignmentResponse] = Field(default_factory=list)
    rule_statuses: list[RuleStatusResponse] = Field(default_factory=list)
    extra_unused_courses: list[CourseResultResponse] = Field(default_factory=list)
    manual_unverified_courses: list[CourseResultResponse] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    diagnostics: list[DiagnosticResponse] = Field(default_factory=list)
    valid_catalog_years: list[int] = Field(default_factory=list)


class PlanningSimulationResponse(BaseModel):
    status: str
    plans: list[PlanningPlanResponse] = Field(default_factory=list)
    diagnostics: list[DiagnosticResponse] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
