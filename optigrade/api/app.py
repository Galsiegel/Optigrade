"""FastAPI app for milestone-8 backend contracts."""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException

from optigrade.api.schemas import (
    FinishSimulationRequest,
    FinishSimulationResponse,
    ManualTagRequest,
    ManualTagResponse,
    PlanningSimulationRequest,
    PlanningSimulationResponse,
    TranscriptParseRequest,
    TranscriptParseResponse,
)
from optigrade.domain.simulation import FinishSimulationInput, PlanningSimulationInput
from optigrade.loaders.availability_loader import load_availability_pool_from_dict
from optigrade.repositories.base import (
    AvailabilityPoolRepository,
    DegreeCatalogRepository,
    StudentProfileRepository,
)
from optigrade.repositories.local_json import (
    JsonFileRepository,
    LocalJsonAvailabilityPoolRepository,
    LocalJsonDegreeCatalogRepository,
    LocalJsonStudentProfileRepository,
)
from optigrade.services.manual_tag_service import (
    InMemoryManualTagAuditRepository,
    ManualTagAuditRepository,
    apply_manual_tag,
)
from optigrade.services.transcript_service import JsonTranscriptParser
from optigrade.solver.finish_solver import solve_finish_simulation
from optigrade.solver.planning_solver import solve_planning_simulation


def create_app(
    *,
    students_repo: StudentProfileRepository | JsonFileRepository | None = None,
    catalogs_repo: DegreeCatalogRepository | JsonFileRepository | None = None,
    availability_repo: AvailabilityPoolRepository | JsonFileRepository | None = None,
    audit_repository: ManualTagAuditRepository | None = None,
) -> FastAPI:
    app = FastAPI(title="OptiGrade API", version="0.1.0")
    base_data = Path("data")
    app.state.students_repo = _resolve_students_repo(students_repo, base_data)
    app.state.catalogs_repo = _resolve_catalogs_repo(catalogs_repo, base_data)
    app.state.availability_repo = _resolve_availability_repo(availability_repo, base_data)
    app.state.audit_repository = audit_repository or InMemoryManualTagAuditRepository()

    @app.post("/transcripts/parse", response_model=TranscriptParseResponse)
    def parse_transcript(request: TranscriptParseRequest) -> TranscriptParseResponse:
        parser = JsonTranscriptParser()
        parsed = parser.parse(request.model_dump_json().encode("utf-8"))
        return TranscriptParseResponse(
            student_name=parsed.student_name,
            student_id_number=parsed.student_id_number,
            courses=[
                {
                    "course_id": course.course_id,
                    "name": course.name,
                    "term": course.term,
                    "credits": float(course.credits) if course.credits is not None else None,
                    "grade": course.grade,
                    "parser_status": course.parser_status.value,
                }
                for course in parsed.courses
            ],
            warnings=parsed.warnings,
        )

    @app.post("/manual-tags", response_model=ManualTagResponse)
    def add_manual_tag(request: ManualTagRequest) -> ManualTagResponse:
        profile = app.state.students_repo.get(request.student_profile_id)
        if profile is None:
            raise HTTPException(status_code=404, detail="student profile not found")
        updated_profile = apply_manual_tag(
            profile,
            course_code=request.course_code,
            credits=request.credits,
            bucket_types=request.bucket_types,
            comment=request.comment,
            audit_repository=app.state.audit_repository,
            degree_id=request.degree_id,
            catalog_year=request.catalog_year,
        )
        app.state.students_repo.save(updated_profile)
        return ManualTagResponse(
            student_profile_id=request.student_profile_id,
            total_manual_tags=len(updated_profile.manual_tags),
        )

    @app.post("/simulations/finish-degree", response_model=FinishSimulationResponse)
    def finish_simulation(request: FinishSimulationRequest) -> FinishSimulationResponse:
        profile = _load_student_profile_or_404(app, request.student_profile_id)
        catalog_candidates = _load_catalog_candidates_or_404(
            app,
            degree_id=request.degree_id,
            selected_catalog_year=request.catalog_year,
            student_start_year=profile.degree_start_year,
            strategy=request.catalog_search_strategy,
        )
        best_result = None
        best_year = request.catalog_year
        valid_years: list[int] = []
        for year, catalog in catalog_candidates:
            result = solve_finish_simulation(
                FinishSimulationInput(
                    student_profile=profile,
                    degree_catalog=catalog,
                    selected_specialty_ids=set(request.selected_specialties) or None,
                    strategy=request.catalog_search_strategy,
                )
            )
            if result.status == "feasible":
                valid_years.append(year)
                if best_result is None:
                    best_result = result
                    best_year = year
        if best_result is None:
            best_year, catalog = catalog_candidates[0]
            best_result = solve_finish_simulation(
                FinishSimulationInput(
                    student_profile=profile,
                    degree_catalog=catalog,
                    selected_specialty_ids=set(request.selected_specialties) or None,
                    strategy=request.catalog_search_strategy,
                )
            )
        return _finish_response(best_result, best_year, valid_years)

    @app.post("/simulations/plan-degree", response_model=PlanningSimulationResponse)
    def plan_simulation(request: PlanningSimulationRequest) -> PlanningSimulationResponse:
        profile = _load_student_profile_or_404(app, request.student_profile_id)
        catalog = app.state.catalogs_repo.get(request.degree_id, request.catalog_year)
        if catalog is None:
            raise HTTPException(status_code=404, detail="catalog not found")
        availability_pool = app.state.availability_repo.get(request.degree_id)
        if availability_pool is None:
            availability_payload = {"semesters": {}}
        else:
            availability_payload = {
                "semesters": {
                    semester: [
                        {
                            "code": offering.course_id,
                            "credits": float(offering.credits),
                            "nameEn": offering.name_en,
                            "nameHe": offering.name_he,
                        }
                        for offering in offerings
                    ]
                    for semester, offerings in availability_pool.semesters.items()
                }
            }
        if request.future_semesters:
            semesters = availability_payload.get("semesters", {})
            availability_payload = {
                "semesters": {
                    semester: semesters.get(semester, []) for semester in request.future_semesters
                }
            }
        result = solve_planning_simulation(
            PlanningSimulationInput(
                student_profile=profile,
                degree_catalog=catalog,
                future_availability_pool=load_availability_pool_from_dict(availability_payload),
                selected_specialty_ids=set(request.selected_specialties) or None,
                locked_course_offering_ids=set(request.locked_course_offering_ids),
                blocked_course_ids=set(request.blocked_course_ids),
                num_plans=request.num_plans,
            )
        )
        return PlanningSimulationResponse(
            status=result.status,
            plans=[
                {
                    "rank": plan.rank,
                    "future_credit_units": plan.future_credit_units,
                    "future_course_count": plan.future_course_count,
                    "suggested_courses": [course.__dict__ for course in plan.suggested_courses],
                    "bucket_assignments": [assignment.__dict__ for assignment in plan.bucket_assignments],
                    "rule_statuses": [rule.__dict__ for rule in plan.rule_statuses],
                    "generic_missing_requirements": plan.generic_missing_requirements,
                    "warnings": plan.warnings,
                }
                for plan in result.plans
            ],
            diagnostics=[diagnostic.__dict__ for diagnostic in result.diagnostics],
            warnings=result.warnings,
        )

    return app


def _load_student_profile_or_404(app: FastAPI, student_profile_id: str):
    profile = app.state.students_repo.get(student_profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="student profile not found")
    return profile


def _load_catalog_candidates_or_404(
    app: FastAPI,
    *,
    degree_id: str,
    selected_catalog_year: int,
    student_start_year: int,
    strategy: str,
):
    years = [selected_catalog_year]
    if strategy == "try_all_from_start_to_current":
        years = list(range(student_start_year, selected_catalog_year + 1))
    candidates = []
    for year in years:
        catalog = app.state.catalogs_repo.get(degree_id, year)
        if catalog is None:
            continue
        candidates.append((year, catalog))
    if not candidates:
        raise HTTPException(status_code=404, detail="catalog not found")
    return candidates


def _resolve_students_repo(
    repo: StudentProfileRepository | JsonFileRepository | None,
    base_data: Path,
) -> StudentProfileRepository:
    if repo is None:
        return LocalJsonStudentProfileRepository(base_data / "students")
    if isinstance(repo, JsonFileRepository):
        return LocalJsonStudentProfileRepository(repo.root_dir)
    return repo


def _resolve_catalogs_repo(
    repo: DegreeCatalogRepository | JsonFileRepository | None,
    base_data: Path,
) -> DegreeCatalogRepository:
    if repo is None:
        return LocalJsonDegreeCatalogRepository(base_data / "catalogs")
    if isinstance(repo, JsonFileRepository):
        return LocalJsonDegreeCatalogRepository(repo.root_dir)
    return repo


def _resolve_availability_repo(
    repo: AvailabilityPoolRepository | JsonFileRepository | None,
    base_data: Path,
) -> AvailabilityPoolRepository:
    if repo is None:
        return LocalJsonAvailabilityPoolRepository(base_data / "availability")
    if isinstance(repo, JsonFileRepository):
        return LocalJsonAvailabilityPoolRepository(repo.root_dir)
    return repo


def _finish_response(result, catalog_year_used: int, valid_catalog_years: list[int]) -> FinishSimulationResponse:
    return FinishSimulationResponse(
        status=result.status,
        summary=result.summary.__dict__,
        bucket_assignments=[assignment.__dict__ for assignment in result.bucket_assignments],
        rule_statuses=[rule.__dict__ for rule in result.rule_statuses],
        extra_unused_courses=[course.__dict__ for course in result.extra_unused_courses],
        manual_unverified_courses=[course.__dict__ for course in result.manual_unverified_courses],
        warnings=result.warnings,
        diagnostics=[diagnostic.__dict__ for diagnostic in result.diagnostics],
        catalog_year_used=catalog_year_used,
        valid_catalog_years=valid_catalog_years,
    )
