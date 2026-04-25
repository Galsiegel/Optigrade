# Optigrade Backend Implementation Plan — Backend-First v1

## Goal

Build the Optigrade backend thoroughly before connecting it to the frontend.

The backend should be correct, testable, explainable, and stable enough that the frontend can later integrate against clear API contracts instead of chasing changing logic.

This plan focuses on the backend implementation order, engineering tasks, invariants, test strategy, and done criteria.

---

## Core Strategy

Do **not** start with the frontend.

Do **not** start with Firebase.

Do **not** start with transcript PDF parsing.

First build a correct local backend engine:

```text
1. Domain models
2. Catalog/course-bank loaders
3. Validation
4. Tiny synthetic fixtures
5. Finish-degree solver
6. Planning solver
7. Explainable result objects
8. Diagnostics
9. FastAPI contracts
10. Persistence/auth later
```

The solver and domain rules are the hardest part. Everything else should wrap around them.

---

## High-Level Milestones

```text
Milestone 0 — Repository cleanup and test infrastructure
Milestone 1 — Domain primitives and invariants
Milestone 2 — Catalog/course-bank/availability loaders
Milestone 3 — Synthetic fixture suite
Milestone 4 — Finish-degree feasibility solver
Milestone 5 — Planning solver with top-2 plans
Milestone 6 — Result explanation, rule statuses, diagnostics
Milestone 7 — Transcript/manual-tag domain flow
Milestone 8 — FastAPI backend contracts
Milestone 9 — Export-ready finish-degree report payload
Milestone 10 — Storage abstraction and local persistence
Milestone 11 — Admin data services
Milestone 12 — Firebase integration
Milestone 13 — Advanced scheduling/prerequisites
```

Frontend integration should start only after Milestone 8 or 9.

---

# Milestone 0 — Repository Cleanup and Test Infrastructure

## Objective

Prepare the codebase so backend development can proceed cleanly and safely.

## Tasks

### 0.1 Create backend package structure

Recommended structure:

```text
optigrade/
  domain/
    course.py
    student.py
    catalog.py
    bucket.py
    rules.py
    simulation.py
  loaders/
    course_bank_loader.py
    catalog_loader.py
    availability_loader.py
    student_loader.py
  validation/
    catalog_validator.py
    course_bank_validator.py
    student_validator.py
  solver/
    model_builder.py
    finish_solver.py
    planning_solver.py
    solution_extractor.py
    diagnostics.py
  services/
    simulation_service.py
    transcript_service.py
    manual_tag_service.py
    catalog_service.py
  repositories/
    base.py
    local_json.py
    firestore.py
  api/
    main.py
    schemas.py
    routes_transcripts.py
    routes_simulations.py
  tests/
    unit/
    scenarios/
    fixtures/
```

Existing files can be gradually migrated instead of moved all at once, but the target architecture should be clear.

### 0.2 Add testing setup

Use:

```text
pytest
pytest-cov
ruff or flake8
mypy optional but recommended
```

### 0.3 Add minimal CI command script

Create a local command that always runs:

```bash
pytest
```

Later:

```bash
ruff check .
pytest --cov=optigrade
```

## Done Criteria

- Tests can run locally.
- Empty placeholder test passes.
- Backend package structure exists.
- Old broken imports are either fixed or isolated from the new backend path.

---

# Milestone 1 — Domain Primitives and Invariants

## Objective

Define the core backend objects before writing solver logic.

The domain layer should be independent of FastAPI, Firebase, and OR-Tools.

---

## 1.1 Course ID and Term Types

### Files

```text
optigrade/domain/course.py
optigrade/tests/unit/test_course_id.py
```

### Models

```python
CourseId = NewType("CourseId", str)
TermId = NewType("TermId", str)
```

Or simple validated dataclasses/Pydantic models.

### Invariants

- Course IDs are strings.
- Leading zeroes must be preserved.
- Course IDs must never be converted to int.
- Term IDs are normalized strings such as:

```text
2022_winter
2023_spring
```

### Tests

- `"044101"` remains `"044101"`.
- Integer course IDs are rejected.
- Empty course IDs are rejected.
- Invalid term strings are rejected or normalized consistently.

---

## 1.2 Credit Units

### Files

```text
optigrade/domain/course.py
optigrade/tests/unit/test_credit_units.py
```

### Model

```python
@dataclass(frozen=True)
class CreditValue:
    credits: Decimal
    credit_units: int
```

### Rules

Credits are internally multiplied by 2 for CP-SAT.

```text
3.0 -> 6
3.5 -> 7
159.5 -> 319
```

Only `.0` and `.5` credit values are valid unless future data proves otherwise.

### Tests

- `3 -> 6`
- `3.0 -> 6`
- `3.5 -> 7`
- `159.5 -> 319`
- `3.25` raises validation error.
- Negative credits raise validation error.
- Zero credits are valid.

---

## 1.3 Course Offering

### Files

```text
optigrade/domain/course.py
optigrade/tests/unit/test_course_offering.py
```

### Model

```python
@dataclass(frozen=True)
class CourseOffering:
    course_id: str
    term: str
    credits: Decimal
    credit_units: int
    name_en: str | None = None
    name_he: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    archived: bool = False
```

### Invariants

- Identity for credit/version purposes is `course_id + term`.
- Same `course_id + term` cannot have conflicting credits.
- Course name may differ in formatting, but credit conflict is invalid.

### Tests

- Offering with valid ID and credits is accepted.
- Conflicting same course/term credits fail in validator.
- Archived courses can exist and can be counted if already passed.

---

## 1.4 Student Course Instance

### Files

```text
optigrade/domain/student.py
optigrade/tests/unit/test_student_course_instance.py
```

### Model

```python
class CourseInstanceStatus(str, Enum):
    RECOGNIZED_PASSED = "recognized_passed"
    RECOGNIZED_FAILED = "recognized_failed"
    UNKNOWN_UNRESOLVED = "unknown_unresolved"
    UNKNOWN_STUDENT_TAGGED = "unknown_student_tagged"
    DUPLICATE_IGNORED = "duplicate_ignored"
    IGNORED = "ignored"
```

```python
@dataclass(frozen=True)
class StudentCourseInstance:
    course_instance_id: str
    course_id: str
    term: str | None
    credits: Decimal
    credit_units: int
    status: CourseInstanceStatus
    source: str
    verified: bool
    eligible_bucket_ids: set[str]
    comment: str | None = None
```

### Invariants

- Passed recognized courses may be used by solver.
- Failed courses are shown but ignored by solver.
- Unknown unresolved courses cannot be used.
- Unknown student-tagged courses may be used but are unverified.
- Non-sports duplicate course IDs count once.
- Sports course instances may repeat and count multiple times.

### Tests

- Failed course is excluded from solver candidates.
- Unknown unresolved course is excluded.
- Unknown tagged course is included and marked unverified.
- Duplicate non-sports attempts produce warning and one counted instance.
- Duplicate sports instances are both allowed.

---

## 1.5 Bucket IDs and Bucket Types

### Files

```text
optigrade/domain/bucket.py
optigrade/tests/unit/test_bucket.py
```

### Formal bucket IDs

```text
mandatory
core
specialty:<specialty_id>
faculty_choice
enrichment
sports
malag
project
lab
extra_unused
```

### Model

```python
@dataclass(frozen=True)
class Bucket:
    bucket_id: str
    display_name_en: str
    display_name_he: str | None
    requirement_type: Literal["count", "credits", "none"]
    min_count: int | None = None
    min_credit_units: int | None = None
```

### Invariants

- `free_choice` is not an internal bucket. Use `enrichment`.
- Specialty buckets are specific: `specialty:specialty_3`, not generic `specialty`.
- `extra_unused` is not counted toward requirements.

### Tests

- Valid bucket IDs pass.
- Invalid bucket IDs fail.
- Specialty bucket parser extracts specialty ID.
- `free_choice` is rejected or normalized to `enrichment` at input boundary.

---

## 1.6 Specialty Rule

### Files

```text
optigrade/domain/rules.py
optigrade/tests/unit/test_specialty_rule.py
```

### Model

```python
@dataclass(frozen=True)
class ChooseGroupRule:
    courses: tuple[str, ...]
    required_count: int
```

```python
@dataclass(frozen=True)
class SpecialtyRule:
    specialty_id: str
    name_en: str
    name_he: str | None
    mandatory_courses: tuple[str, ...]
    choose_groups: tuple[ChooseGroupRule, ...]
    minimum_total_courses: int
    eligible_course_ids: set[str]
```

### Rules

For each active specialty:

- Mandatory specialty courses must be selected/completed somewhere.
- Choose groups with `required_count > 0` must be satisfied somewhere.
- `minimum_total_courses` must be visibly assigned to that specific specialty bucket.

### Tests

- `required_count = 0` group is not enforced.
- Mandatory course can satisfy logical rule even if assigned to core.
- Course assigned to core does not count toward visible specialty minimum.

---

## 1.7 Degree Catalog

### Files

```text
optigrade/domain/catalog.py
optigrade/tests/unit/test_degree_catalog.py
```

### Model

```python
@dataclass(frozen=True)
class DegreeCatalog:
    degree_id: str
    academic_year: int
    program_name: str
    total_credit_units: int
    mandatory_course_ids: set[str]
    core_course_ids: set[str]
    required_core_count: int
    required_specialty_count: int
    specialties: dict[str, SpecialtyRule]
    faculty_choice_course_ids: set[str]
    enrichment_min_credit_units: int
    sports_min_credit_units: int
    malag_min_credit_units: int
    project_rules: list[Any]
    lab_rules: list[Any]
```

### Invariants

- Mandatory completion is based on course IDs, not only credit sum.
- `mandatoryCredits` is a sanity check, not the primary rule.
- Zero-credit mandatory courses are required.
- Degree rules are yearly.

### Tests

- Catalog with zero-credit mandatory course is valid.
- Missing mandatory course is detected by solver later.
- Catalog with required specialty count greater than available specialties fails validation.

---

## 1.8 Student Profile

### Files

```text
optigrade/domain/student.py
optigrade/tests/unit/test_student_profile.py
```

### Model

```python
@dataclass
class StudentProfile:
    student_id: str
    degree_start_year: int
    completed_courses: list[StudentCourseInstance]
    manual_tags: list[ManualCourseTag]
```

### Invariants

- Student profile stores confirmed parsed/manual courses.
- Manual tags are scoped to one student.
- Manual tags do not modify global course bank.

### Tests

- Profile returns solver-eligible passed courses.
- Profile returns warnings for duplicate non-sports attempts.
- Profile preserves manual comments.

---

## Milestone 1 Done Criteria

- Domain classes exist and pass unit tests.
- No solver code depends on raw JSON structure.
- No API/Firebase dependency exists in domain layer.
- Course IDs, credits, terms, buckets, specialties, and student instances are validated.

---

# Milestone 2 — Loaders and Validators

## Objective

Convert current JSON syllabus/course data into clean internal domain objects.

---

## 2.1 Catalog Loader

### Files

```text
optigrade/loaders/catalog_loader.py
optigrade/tests/unit/test_catalog_loader.py
```

### Input

Current syllabus JSON structure with:

```text
academicYear
generalRules
mandatory
core
specialties
```

### Output

`DegreeCatalog`

### Responsibilities

- Parse academic year.
- Parse total credits.
- Parse mandatory course IDs.
- Parse core course IDs.
- Parse specialty rules.
- Parse `chooseOneOfGroups` that may appear as either list or object.
- Normalize bucket names.
- Preserve Hebrew and English names.

### Tests

- Loads sample Computer and Software Engineering catalog.
- Parses mandatory courses.
- Parses core courses.
- Parses specialties.
- Handles `chooseOneOfGroups` formats:
  - `[["046005", "046237"]]`
  - `{ "courses": [...], "requiredCount": 1 }`
- Converts credit values to credit units.

---

## 2.2 Course Bank Builder

### Files

```text
optigrade/loaders/course_bank_loader.py
optigrade/tests/unit/test_course_bank_loader.py
```

### Goal

Build a course bank from historical JSON catalogs during bootstrapping.

### Output

```python
dict[tuple[str, str], CourseOffering]
```

where key is:

```text
(course_id, term_or_academic_year)
```

### Validation

- Same course in same term/year must not have conflicting credits.
- Same course in same term/year should have consistent names or produce non-fatal warning.
- Missing course IDs fail.
- Missing credits fail unless explicitly allowed for special cases.

### Tests

- Duplicate same credit passes.
- Duplicate conflicting credit fails.
- Same course across different years may have different credits.

---

## 2.3 Availability Pool Loader

### Files

```text
optigrade/loaders/availability_loader.py
optigrade/tests/unit/test_availability_loader.py
```

### Model

```python
@dataclass(frozen=True)
class FutureAvailabilityPool:
    semesters: dict[str, list[CourseOffering]]
```

### Rules

- Planning mode may suggest only courses from the future availability pool.
- Finish-degree mode does not need this pool.
- Sports, MALAG, and broad enrichment may be represented as generic missing credits rather than concrete course suggestions.

### Tests

- Loads multiple future semesters.
- Returns union of eligible future offerings.
- Does not include archived/unavailable courses for planning.

---

## 2.4 Student Loader

### Files

```text
optigrade/loaders/student_loader.py
optigrade/tests/unit/test_student_loader.py
```

### Responsibilities

- Load confirmed parsed student profile.
- Load manual tags.
- Convert credits to units.
- Mark unverified entries.
- Apply duplicate non-sports policy.
- Preserve repeated sports instances.

---

## 2.5 Validators

### Files

```text
optigrade/validation/catalog_validator.py
optigrade/validation/course_bank_validator.py
optigrade/validation/student_validator.py
```

### Required Validations

Catalog:

- Required specialty count is possible.
- Specialty course references exist in course bank or catalog import.
- Mandatory/core course references exist.
- No invalid bucket IDs.
- Zero-credit mandatory courses allowed.

Course bank:

- No conflicting credits for same course + term.
- Credits are valid `.0` or `.5`.
- Course IDs are strings.

Student:

- Passed courses have credits.
- Manual tags have course code, credits, bucket types, comment optional.
- Unknown unresolved courses not used by solver.

---

## Milestone 2 Done Criteria

- Current JSON catalog can be loaded into internal models.
- Course bank can be built from JSON data.
- Validators catch bad data early.
- Fixtures exist for valid and invalid catalogs.

---

# Milestone 3 — Synthetic Fixture Suite

## Objective

Create tiny catalogs that isolate solver behavior.

Do this before solving real Technion-sized catalogs.

---

## 3.1 Fixture Catalogs

Create fixture files:

```text
tests/fixtures/catalogs/tiny_basic.json
tests/fixtures/catalogs/tiny_specialty.json
tests/fixtures/catalogs/tiny_sports_duplicates.json
tests/fixtures/catalogs/tiny_manual_tags.json
tests/fixtures/catalogs/tiny_infeasible.json
```

---

## 3.2 Tiny Basic Catalog

Rules:

```text
total credits: 10
mandatory: A, B
core: choose 1 from C, D
sports: 1 credit
```

Tests:

- Missing A fails.
- Zero-credit mandatory still required.
- One core course required.
- Sports credit required.

---

## 3.3 Tiny Specialty Catalog

Rules:

```text
total credits: 15
mandatory: A
core: choose 1 from B, C
specialties required: 1
specialty AI:
  mandatoryCourses: B
  choose group: D or E
  minimumTotalCourses: 2
  eligible: B, D, E, F
```

Important test:

- B assigned to core satisfies AI mandatory rule.
- B assigned to core does not count toward AI minimumTotalCourses.
- Need two courses visibly assigned to `specialty:AI`.

---

## 3.4 Sports Duplicate Fixture

Rules:

```text
sports required: 2 credits
```

Student:

```text
SPORT101 winter
SPORT101 spring
```

Expected:

- Both count because sports allows repeated course codes by instance.

---

## 3.5 Non-Sports Duplicate Fixture

Student:

```text
A failed in winter
A passed in spring
A passed again later
```

Expected:

- Count A once.
- Return duplicate warning.

---

## Milestone 3 Done Criteria

- Synthetic fixture suite exists.
- Fixture data is small enough to debug manually.
- Every important rule has an isolated scenario.

---

# Milestone 4 — Finish-Degree Feasibility Solver

## Objective

Given a selected catalog and passed courses, decide if the student can finish the degree and produce a bucket assignment.

This milestone should not optimize future courses.

---

## 4.1 Solver Input Object

### Files

```text
optigrade/domain/simulation.py
```

### Model

```python
@dataclass(frozen=True)
class FinishSimulationInput:
    student_profile: StudentProfile
    degree_catalog: DegreeCatalog
    selected_specialty_ids: set[str] | None
    strategy: Literal["selected_only", "try_all_from_start_to_current"] = "selected_only"
```

---

## 4.2 Candidate Course Builder

### Files

```text
optigrade/solver/candidates.py
optigrade/tests/unit/test_candidate_builder.py
```

### Responsibilities

- Include recognized passed courses.
- Include unknown student-tagged passed courses.
- Exclude failed/ignored/unresolved courses.
- Apply duplicate policy:
  - sports duplicates allowed by instance.
  - non-sports duplicates counted once with warning.
- Determine eligible buckets for each course instance.

### Tests

- Candidate list excludes failed course.
- Manual tagged course included and marked unverified.
- Non-sports duplicate warning generated.
- Sports duplicate preserved.

---

## 4.3 CP-SAT Model Builder: Variables

### Files

```text
optigrade/solver/model_builder.py
optigrade/tests/unit/test_model_variables.py
```

### Variables

```text
x[i]              course instance selected/counted
alloc[i,b]        course instance visibly assigned to bucket b
active_specialty[s]
```

### Finish Mode Behavior

For finish mode, passed courses are available, but the solver may choose a subset if the student has extra courses.

So:

```text
x[i] is decision variable for eligible passed courses
```

not always fixed to 1.

Reason: student may have 180 credits but only 160 count.

---

## 4.4 CP-SAT Model Builder: Core Constraints

### Constraints

1. Allocation implies selected:

```text
alloc[i,b] <= x[i]
```

2. One visible counted bucket:

```text
sum_b alloc[i,b] <= 1
```

3. Mandatory completion:

```text
for each mandatory course cid:
  sum(x[i] for i.course_id == cid) >= 1
```

4. Core count:

```text
sum(alloc[i, core]) >= required_core_count
```

5. Required active specialties:

```text
sum(active_specialty[s]) == required_specialty_count
```

If selected specialties are provided:

```text
active_specialty[s] = 1 for selected
active_specialty[s] = 0 for non-selected
```

6. Specialty mandatory rules:

```text
sum(x[i] for i.course_id == required_cid) >= active_specialty[s]
```

7. Specialty choose groups:

```text
sum(x[i] for i.course_id in group) >= required_count * active_specialty[s]
```

8. Specialty visible minimum:

```text
sum(alloc[i, specialty:s]) >= minimum_total_courses[s] * active_specialty[s]
```

9. Credit bucket minima:

```text
sum(credit_units[i] * alloc[i,b]) >= required_credit_units[b]
```

for sports, malag, enrichment, etc.

10. Total credits:

```text
sum(credit_units[i] * x[i]) >= total_required_credit_units
```

---

## 4.5 Finish Solver Service

### Files

```text
optigrade/solver/finish_solver.py
optigrade/tests/scenarios/test_finish_solver.py
```

### Behavior

- Build candidate list.
- Build CP-SAT model.
- Solve feasibility.
- Extract assignment if feasible.
- Run diagnostics if infeasible.

### Tests

- Feasible basic catalog succeeds.
- Missing mandatory course infeasible.
- Missing core count infeasible.
- Selected specialty enforced.
- Specialty mandatory can be assigned to core.
- Specialty visible minimum requires specialty bucket assignment.
- Zero-credit mandatory required.
- Extra passed courses appear as unused.

---

## 4.6 Finish Result Extraction

### Files

```text
optigrade/solver/solution_extractor.py
optigrade/tests/unit/test_finish_extraction.py
```

### Output

```python
@dataclass
class FinishSimulationResult:
    status: Literal["feasible", "infeasible"]
    degree_id: str
    catalog_year: int
    selected_specialty_ids: list[str]
    summary: CreditSummary
    bucket_assignments: list[BucketAssignment]
    rule_statuses: list[RuleStatus]
    extra_unused_courses: list[CourseResult]
    manual_unverified_courses: list[CourseResult]
    warnings: list[SimulationWarning]
    diagnostics: list[Diagnostic]
```

### Tests

- Every counted course appears in exactly one bucket.
- Unused passed courses appear in `extra_unused_courses`.
- Manual unverified courses are flagged.
- Hebrew and English names preserved.

---

## Milestone 4 Done Criteria

- Finish-degree feasibility works on synthetic fixtures.
- Result is explainable.
- Infeasible cases produce useful diagnostics.
- No API required yet.

---

# Milestone 5 — Planning Solver with Top-2 Plans

## Objective

Suggest future courses that complete the degree while minimizing future credits and then number of future courses.

---

## 5.1 Planning Input Object

### Files

```text
optigrade/domain/simulation.py
```

### Model

```python
@dataclass(frozen=True)
class PlanningSimulationInput:
    student_profile: StudentProfile
    degree_catalog: DegreeCatalog
    future_availability_pool: FutureAvailabilityPool
    selected_specialty_ids: set[str] | None
    locked_course_offering_ids: set[str]
    blocked_course_ids: set[str]
    num_plans: int = 2
```

---

## 5.2 Planning Candidate Builder

### Responsibilities

- Include passed courses as available completed courses.
- Include future offerings from availability pool.
- Exclude blocked future course IDs.
- Include locked offerings and force select them.
- Do not create concrete suggestions for sports/MALAG/enrichment if configured as generic missing credits.

---

## 5.3 Planning Constraints

Use same core constraints as finish mode, with additions:

```text
locked future offering -> x[i] = 1
blocked future course_id -> x[i] = 0
```

Passed courses should be available as completed. Usually set:

```text
x[i] = 1 for passed courses that must be counted?
```

But because extra passed courses can be unused, better model:

```text
passed candidate x[i] is decision variable
future candidate x[i] is decision variable
```

Then objective only penalizes future courses.

---

## 5.4 Planning Objective

Primary objective:

```text
minimize sum(future_credit_units[i] * x[i])
```

Tie-breaker:

```text
minimize sum(x[i] for future i)
```

Implementation options:

1. Weighted combined objective:

```text
minimize BIG * future_credit_units_sum + future_course_count
```

where `BIG` is larger than maximum possible future course count.

2. Two-pass optimization:

```text
pass 1: minimize credits
pass 2: constrain credits == optimal and minimize course count
```

Recommended: two-pass for clarity and correctness.

---

## 5.5 Top-2 Distinct Plans

### Rule

Top-2 plans must be distinct by future course set.

Different bucket assignment with the same selected future courses does not count as a different plan.

### Algorithm

1. Solve best plan.
2. Extract selected future course IDs/offering IDs.
3. Add exclusion constraint:

```text
sum(selected_vars from plan_1) <= len(plan_1) - 1
```

4. Solve again.
5. Return second plan if feasible.

### Tests

- Returns two distinct future course sets.
- Does not return same course set with different bucket assignment.
- If no second plan exists, returns one plan plus warning.

---

## 5.6 Planning Result

### Output

```python
@dataclass
class PlanningSimulationResult:
    status: Literal["optimal", "infeasible"]
    plans: list[PlanningPlan]
    diagnostics: list[Diagnostic]
```

Each plan includes:

```text
rank
future_credits
future_course_count
suggested_courses
bucket_assignments
rule_statuses
generic_missing_requirements
warnings
```

---

## Milestone 5 Done Criteria

- Planner returns best and alternative plan.
- Objective minimizes future credits, then future course count.
- Locked/blocked behavior works.
- Generic missing sports/MALAG/enrichment credits are returned correctly.

---

# Milestone 6 — Rule Statuses, Reason Codes, and Diagnostics

## Objective

Make every solver result understandable.

---

## 6.1 Rule Status Model

### Files

```text
optigrade/domain/simulation.py
```

### Model

```python
@dataclass(frozen=True)
class RuleStatus:
    rule_id: str
    rule_type: str
    status: Literal["satisfied", "unsatisfied", "not_applicable"]
    required: int | float | str | None
    actual: int | float | str | None
    message_en: str
    message_he: str | None = None
```

### Required Rule Statuses

- Total credits.
- Mandatory courses.
- Core course count.
- Specialty count.
- Each active specialty mandatory rule.
- Each active specialty choose group.
- Each active specialty visible minimum.
- Sports credits.
- MALAG credits.
- Enrichment credits.
- Project rules if defined.
- Lab rules if defined.

---

## 6.2 Course Reason Codes

### Examples

```text
completed_from_transcript
manual_unverified
assigned_to_mandatory
assigned_to_core
assigned_to_active_specialty
satisfies_specialty_mandatory_rule
satisfies_choose_group
counts_toward_total_credits
extra_unused
future_locked_by_student
future_selected_by_optimizer
```

### Tests

- Manual tagged courses include `manual_unverified`.
- Specialty mandatory assigned to core includes both:
  - `assigned_to_core`
  - `satisfies_specialty_mandatory_rule`
- Unused courses include `extra_unused`.

---

## 6.3 Infeasibility Diagnostics

### Files

```text
optigrade/solver/diagnostics.py
optigrade/tests/unit/test_diagnostics.py
```

### Best-Effort Diagnostics

After infeasible solve, compute likely missing rules:

- Missing mandatory courses.
- Missing core count.
- Missing selected specialty requirements.
- Missing visible specialty course count.
- Missing total credits.
- Missing sports credits.
- Missing MALAG credits.
- Missing enrichment credits.
- Locked course cannot count.
- Manual tag required for unknown unresolved course.

### Output

```python
@dataclass(frozen=True)
class Diagnostic:
    type: str
    severity: Literal["error", "warning", "info"]
    related_course_ids: list[str]
    related_bucket_ids: list[str]
    message_en: str
    message_he: str | None = None
```

---

## Milestone 6 Done Criteria

- Feasible and infeasible results include rule statuses.
- Diagnostics are structured and human-readable.
- Course reason codes exist.
- UI can theoretically render result without understanding solver internals.

---

# Milestone 7 — Transcript and Manual Tag Domain Flow

## Objective

Prepare transcript parsing and manual correction as backend services, without needing perfect PDF parsing yet.

---

## 7.1 Transcript Parse Service Boundary

### Files

```text
optigrade/services/transcript_service.py
```

### Interface

```python
class TranscriptParser(Protocol):
    def parse(self, file_bytes: bytes) -> ParsedTranscript:
        ...
```

### Temporary Implementation

Before real PDF parsing, support JSON/CSV mock parsed transcript input.

This allows backend flow to be tested without OCR/PDF complexity.

---

## 7.2 Parsed Transcript Model

### Model

```python
@dataclass
class ParsedTranscript:
    student_name: str | None
    student_id_number: str | None
    courses: list[ParsedTranscriptCourse]
    warnings: list[str]
```

```python
@dataclass
class ParsedTranscriptCourse:
    course_id: str
    name: str | None
    term: str | None
    credits: Decimal | None
    grade: str | int | None
    parser_status: CourseInstanceStatus
```

---

## 7.3 Manual Tag Service

### Files

```text
optigrade/services/manual_tag_service.py
```

### Responsibilities

- Accept manual tag from student.
- Validate fields.
- Attach to student profile.
- Append audit log record.
- Preserve comment.

### Manual Tag Fields

```text
course_code
credits
bucket_types
comment
```

No bucket restrictions in MVP.

---

## 7.4 Audit Log

### Model

```python
@dataclass
class ManualTagAuditRecord:
    student_id: str
    course_code: str
    credits: Decimal
    bucket_types: list[str]
    comment: str | None
    degree_id: str | None
    catalog_year: int | None
    created_at: datetime
    used_in_successful_export: bool = False
```

---

## Milestone 7 Done Criteria

- Mock parsed transcript can become student profile.
- Manual tags flow into solver.
- Manual tags appear in result and audit logs.
- Real PDF parsing can be added later behind same interface.

---

# Milestone 8 — FastAPI Backend Contracts

## Objective

Expose stable backend endpoints only after local solver is correct.

---

## 8.1 API Schemas

### Files

```text
optigrade/api/schemas.py
```

Use Pydantic models for:

- Transcript parse request/response.
- Manual tag request/response.
- Finish simulation request/response.
- Planning simulation request/response.
- Rule statuses.
- Diagnostics.
- Course result.
- Bucket assignment.

---

## 8.2 Endpoints

### Transcript Parse

```http
POST /transcripts/parse
```

MVP may accept mock JSON or file upload depending on implementation stage.

---

### Finish Degree Simulation

```http
POST /simulations/finish-degree
```

Request:

```json
{
  "student_profile_id": "student_123",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "selected_specialties": ["specialty_3", "specialty_8"],
  "catalog_search_strategy": "selected_only"
}
```

---

### Planning Simulation

```http
POST /simulations/plan-degree
```

Request:

```json
{
  "student_profile_id": "student_123",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "selected_specialties": ["specialty_3", "specialty_8"],
  "locked_course_offering_ids": [],
  "blocked_course_ids": [],
  "future_semesters": ["2026_winter", "2027_spring"],
  "num_plans": 2
}
```

---

## 8.3 Catalog Search Strategy

For finish mode:

```text
selected_only
try_all_from_start_to_current
```

If multiple catalogs work:

- Recommend earliest valid catalog.
- Return all valid alternatives.

If no catalog works:

- Return diagnostics for selected catalog.
- If full search was requested, also return closest catalog diagnostics.

---

## 8.4 API Tests

Use FastAPI TestClient.

Tests:

- Finish feasible request returns 200 and feasible status.
- Finish infeasible request returns 200 and infeasible status with diagnostics.
- Planning request returns top 2 plans.
- Invalid course ID returns 422.
- Missing student profile returns 404.
- Invalid catalog year returns 404 or 400.

---

## Milestone 8 Done Criteria

- API works with local JSON-backed repositories.
- API contract is stable enough for frontend mock integration.
- No Firebase required yet.
- OpenAPI docs generated automatically.

---

# Milestone 9 — Export-Ready Finish Result

## Objective

Create backend output that can later become a PDF/report.

Do not implement pretty PDF first. First make the data complete.

---

## Required Export Sections

1. Student info.
2. Degree and catalog year.
3. Full course assignment by bucket.
4. Manual/unverified course tags and comments.
5. Catalog alternatives tested, if relevant.
6. Unofficial simulation disclaimer.
7. Extra unused courses.
8. Rule statuses.

---

## Export Payload Model

```python
@dataclass
class FinishExportPayload:
    student_info: StudentExportInfo
    degree_info: DegreeExportInfo
    summary: CreditSummary
    bucket_sections: list[BucketExportSection]
    manual_unverified_section: list[CourseResult]
    unused_courses_section: list[CourseResult]
    catalog_alternatives: list[CatalogAlternative]
    rule_statuses: list[RuleStatus]
    disclaimer: str
```

---

## Required Disclaimer

```text
This document is an unofficial degree-completion simulation generated by Optigrade. It is not an official Technion approval. Manual or unverified course assignments are marked and require secretary review.
```

---

## Milestone 9 Done Criteria

- Finish result can be converted to export payload.
- Manual tags are clearly marked.
- Catalog alternatives are included.
- PDF generation can be added later without changing solver logic.

---

# Milestone 10 — Repository Abstraction and Local Persistence

## Objective

Separate business logic from storage.

Firebase should be easy to add later.

---

## 10.1 Repository Interfaces

### Files

```text
optigrade/repositories/base.py
```

Interfaces:

```python
class StudentProfileRepository(Protocol): ...
class DegreeCatalogRepository(Protocol): ...
class CourseBankRepository(Protocol): ...
class AvailabilityPoolRepository(Protocol): ...
class SimulationHistoryRepository(Protocol): ...
class ManualTagAuditRepository(Protocol): ...
```

---

## 10.2 Local JSON Implementations

### Files

```text
optigrade/repositories/local_json.py
```

Used for backend development before Firebase.

---

## 10.3 Simulation History

Store:

- Simulation input metadata.
- Result status.
- Catalog year.
- Selected specialties.
- Diagnostics.
- Created timestamp.
- Export generated flag.

---

## Milestone 10 Done Criteria

- API services use repository interfaces.
- Local JSON persistence works.
- Firebase can replace repositories later.

---

# Milestone 11 — Admin Data Services

## Objective

Support backend data maintenance before building admin UI.

Admin UI is not part of this milestone.

---

## Services

```text
CourseBankService
DegreeCatalogService
AvailabilityPoolService
ManualTagReviewService
ValidationService
```

---

## Required Capabilities

- Import catalog JSON.
- Export catalog JSON.
- Validate catalog.
- Add/update course offering.
- Add/update availability pool.
- Archive course offering.
- List manual tag logs.

---

## Done Criteria

- Admin-owned data can be changed through service layer.
- All changes run validation.
- No frontend/admin UI required.

---

# Milestone 12 — Firebase Integration

## Objective

Move from local JSON repositories to authenticated persistent backend.

---

## Tasks

- Add Firebase Admin SDK.
- Verify Firebase ID tokens.
- Implement Firestore repositories.
- Persist:
  - student profiles
  - degree catalogs
  - course bank
  - availability pools
  - manual tag logs
  - simulation history
- Keep local JSON repositories for tests/dev.

---

## Done Criteria

- API can run with local or Firestore backend.
- Authenticated student sees only their profile/simulations.
- Admin routes are protected.
- Solver code remains storage-agnostic.

---

# Milestone 13 — Advanced Planning

## Objective

Add real semester planning and richer optimization.

---

## Future Features

- Semester-by-semester schedule generation.
- Prerequisite constraints.
- Course offering constraints by semester.
- Workload balancing per semester.
- Difficulty preferences.
- Better top-K diversity.
- Manual tag approval workflow.
- Official-style PDF generation.

---

# Testing Strategy

## Test Layers

### Unit Tests

For pure functions and models:

- Credit conversion.
- Course ID validation.
- Bucket validation.
- Specialty rule parsing.
- Catalog loading.
- Duplicate handling.

### Scenario Tests

For solver behavior:

- Finish-degree feasible.
- Finish-degree infeasible.
- Planning optimal.
- Top-2 alternatives.
- Manual tags.
- Sports duplicates.

### API Contract Tests

For FastAPI:

- Request validation.
- Response shape.
- Error statuses.
- Diagnostics structure.

### Regression Tests

For real catalog imports:

- Load Computer and Software Engineering 2022/2023 JSON.
- Validate no conflicting course credits.
- Validate mandatory/core/specialty parsing.
- Run known synthetic student cases.

---

## Essential Solver Tests

These tests must exist before trusting the backend:

```text
test_credit_scaling_half_points
test_course_id_preserves_leading_zero
test_zero_credit_mandatory_required
test_missing_mandatory_infeasible
test_core_requires_minimum_course_count
test_specialty_mandatory_can_be_assigned_to_core
test_specialty_minimum_requires_visible_specialty_assignment
test_choose_one_group_required_count
test_choose_group_required_zero_is_optional
test_course_cannot_be_counted_twice_across_buckets
test_extra_passed_course_marked_unused
test_sports_duplicate_instances_count_twice
test_non_sports_duplicate_warns_and_counts_once
test_planning_minimizes_future_credits
test_planning_tiebreak_minimizes_course_count
test_locked_future_course_forced
test_blocked_future_course_excluded
test_top2_plans_have_distinct_future_course_sets
test_manual_tag_used_and_marked_unverified
test_infeasible_returns_missing_rules
```

---

# Recommended PR / Cursor Task Breakdown

## PR 1 — Domain Primitives

Files:

```text
optigrade/domain/course.py
optigrade/domain/bucket.py
optigrade/domain/student.py
```

Done when:

- Course IDs validated.
- Credit scaling works.
- Buckets normalized.
- Student course instances modeled.
- Unit tests pass.

---

## PR 2 — Catalog and Course Bank Loaders

Files:

```text
optigrade/domain/catalog.py
optigrade/domain/rules.py
optigrade/loaders/catalog_loader.py
optigrade/loaders/course_bank_loader.py
optigrade/validation/*.py
```

Done when:

- Current JSON catalog loads.
- Specialties parse correctly.
- Conflicting credits fail validation.
- Unit tests pass.

---

## PR 3 — Synthetic Fixtures

Files:

```text
tests/fixtures/catalogs/*.json
tests/fixtures/students/*.json
```

Done when:

- Tiny catalogs exist.
- Expected outcomes documented.
- Fixture loading tests pass.

---

## PR 4 — Finish Solver

Files:

```text
optigrade/solver/candidates.py
optigrade/solver/model_builder.py
optigrade/solver/finish_solver.py
optigrade/solver/solution_extractor.py
```

Done when:

- Finish solver passes all synthetic scenario tests.
- Bucket assignment is explainable.
- Extra unused courses are returned.

---

## PR 5 — Planning Solver

Files:

```text
optigrade/solver/planning_solver.py
optigrade/loaders/availability_loader.py
```

Done when:

- Planning minimizes credits.
- Tie-breaker works.
- Locked/blocked works.
- Top-2 distinct plans work.

---

## PR 6 — Diagnostics and Rule Statuses

Files:

```text
optigrade/solver/diagnostics.py
optigrade/domain/simulation.py
```

Done when:

- Every result includes rule statuses.
- Infeasible results include useful missing rules.
- Course reason codes are populated.

---

## PR 7 — Transcript/Manual Domain Flow

Files:

```text
optigrade/services/transcript_service.py
optigrade/services/manual_tag_service.py
```

Done when:

- Mock transcript parse works.
- Manual tags feed solver.
- Audit logs created.

---

## PR 8 — FastAPI Contracts

Files:

```text
optigrade/api/main.py
optigrade/api/schemas.py
optigrade/api/routes_simulations.py
optigrade/api/routes_transcripts.py
```

Done when:

- Endpoints work with local repositories.
- OpenAPI generated.
- API tests pass.

---

## PR 9 — Export Payload

Files:

```text
optigrade/services/export_service.py
```

Done when:

- Finish result converts to export-ready payload.
- Disclaimer included.
- Manual tags and unused courses included.

---

# Backend Readiness Before Frontend

The backend is ready for frontend integration only when:

```text
1. Domain model tests pass.
2. Catalog loader validates real sample catalog.
3. Finish solver works on synthetic and real-ish fixtures.
4. Planning solver returns top-2 plans.
5. Results include bucket assignments and rule statuses.
6. Infeasible cases return diagnostics.
7. API schemas are stable.
8. OpenAPI docs are available.
9. Local JSON storage works.
10. Manual tags are represented and auditable.
```

Until then, frontend work should use mock JSON examples only.

---

# Development Rules

1. Never write solver logic directly against raw JSON.
2. Never use floats inside CP-SAT.
3. Never convert course IDs to integers.
4. Every new rule must have a test.
5. Every solver result must be explainable.
6. Manual tags must never silently look official.
7. Catalog validation should fail fast on inconsistent data.
8. Keep storage separate from solver logic.
9. Keep API separate from domain logic.
10. Prefer tiny fixtures before real catalogs.

---

# First Immediate Task

Start with PR 1.

Implement:

```text
CourseId / TermId validation
CreditValue scaling
CourseOffering
StudentCourseInstance
ManualCourseTag
BucketId validation
Specialty bucket parsing
```

Add tests:

```text
test_course_id_preserves_leading_z