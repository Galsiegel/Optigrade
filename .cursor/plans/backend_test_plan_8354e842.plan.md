---
name: backend test plan
overview: Create a thorough backend QA/test plan for Optigrade that maps product requirements and backend-first implementation phases into unit, module, scenario, API, regression, and CI coverage.
todos:
  - id: create-test-layout
    content: Create the pytest directory structure, fixture folders, markers, scenario input/expected pairs, and baseline quality commands.
    status: pending
  - id: domain-unit-suite
    content: Implement domain unit tests for IDs, credits, offerings, student instances, buckets, rules, and result objects.
    status: pending
  - id: loader-validator-suite
    content: Implement loader and strict validation tests, including conflict and real-catalog smoke coverage.
    status: pending
  - id: solver-scenario-suite
    content: Build finish-degree and planning solver scenario fixtures with expected outputs, invariant assertions, negative cheat-prevention cases, and solver-status handling.
    status: pending
  - id: service-api-suite
    content: Add transcript/manual-tag service tests and FastAPI contract tests for all endpoint outcomes.
    status: pending
  - id: regression-ci-gates
    content: Add real-catalog regression smoke tests, scoped snapshot checks, deterministic ordering checks, coverage reporting, CI/local quality gates, and later performance smoke tests.
    status: pending
isProject: false
---

# Optigrade Backend QA Test Plan

## Source Scope

This test plan is based on:

- [.cursor/plans/optigrade_backend_real_spec_v_1.md](.cursor/plans/optigrade_backend_real_spec_v_1.md)
- [.cursor/plans/optigrade_backend_implementation_plan_backend_first.md](.cursor/plans/optigrade_backend_implementation_plan_backend_first.md)

Primary product risks to validate:

- Finish-degree and planning modes have different objectives, inputs, diagnostics, and success criteria.
- Course IDs must remain strings, including leading zeroes.
- Credits must be scaled to integer `credit_units` internally and converted back at API boundaries.
- A counted course instance may have exactly one visible bucket assignment, while separately satisfying logical rules.
- Specialty, core, sports, MALAG, enrichment, project, and lab rules have distinct semantics.
- Manual tags must be auditable, unverified, scoped to the student, and visible in exports/results.
- Planning must minimize future credits first, then future course count, and return distinct top plans by future course set.

## Test Strategy

Use a layered pyramid with small deterministic fixtures at the bottom and real-catalog regression suites at the top.

- Unit tests validate pure domain primitives, rule calculations, validators, candidate generation, diagnostics helpers, and serializers without OR-Tools, FastAPI, or persistence.
- Module tests validate one backend module at a time with realistic fixture objects and minimal mocking.
- Solver scenario tests validate end-to-end model behavior on tiny catalogs with known feasible, infeasible, and optimal results.
- API contract tests validate FastAPI schemas, status codes, error bodies, and response shapes using mocked or local JSON repositories.
- Regression tests validate real imported CSE catalog data and known student stories.
- CI quality gates run formatting/linting, unit/module/scenario suites, selected regression smoke tests, and coverage reporting.

Recommended test layout:

- `tests/unit/domain/`
- `tests/unit/loaders/`
- `tests/unit/validation/`
- `tests/unit/solver/`
- `tests/unit/services/`
- `tests/module/`
- `tests/scenarios/finish_degree/`
- `tests/scenarios/planning/`
- `tests/api/`
- `tests/regression/`
- `tests/fixtures/catalogs/`
- `tests/fixtures/course_banks/`
- `tests/fixtures/students/`
- `tests/fixtures/availability/`
- `tests/fixtures/transcripts/`

## Unit Test Coverage

### Domain Models

Cover `optigrade/domain/course.py`, `student.py`, `catalog.py`, `bucket.py`, `rules.py`, and `simulation.py`.

Required unit tests:

- Course IDs preserve leading zeroes and reject integer coercion.
- Credit conversion maps `3.0 -> 6`, `3.5 -> 7`, `159.5 -> 319`, and round-trips back to display credits.
- Course offering identity is `course_id + term`, not course ID alone.
- Student course instances keep `course_instance_id`, `course_id`, `term`, `credits`, `status`, `source`, and `verified` intact.
- Non-sports duplicate course codes are represented as duplicate attempts and counted once.
- Sports duplicates count only when represented as separate course instances.
- Bucket names normalize to the formal backend set: `mandatory`, `core`, `specialty:<id>`, `faculty_choice`, `enrichment`, `sports`, `malag`, `project`, `lab`, `extra_unused`.
- `free_choice` is not accepted as an internal formal bucket, except through an explicit aliasing/display layer if implemented.
- Rule-status objects distinguish logical satisfaction from visible bucket assignment.
- Manual-tagged courses are always `verified=false` and preserve comments/eligible bucket metadata.

### Loaders

Cover catalog, course-bank, availability, and student loaders.

Required unit tests:

- Catalog JSON normalizes denormalized syllabus data into canonical internal degree/catalog objects.
- Course bank credit versions resolve the correct credit value for a requested term.
- Availability loader keeps `offering_id`, `course_id`, `semester_id`, `credits`, `allowed_for_planning`, and `source`.
- Student loader preserves completed course instances without collapsing sports repeats.
- Loader errors include useful file/record context for malformed JSON, missing required fields, unknown bucket names, invalid specialty structures, and bad term identifiers.
- Real CSE 2022/2023 catalog import has at least a smoke test that loads successfully and produces expected high-level counts.

### Validators

Cover strict catalog, course-bank, availability, and student validation.

Required unit tests:

- Conflicting credits for the same course in the same term fail validation across sections of one catalog.
- Conflicting credits fail across course bank versus imported catalog data.
- Unknown course IDs referenced by mandatory/core/specialty/faculty-choice/project/lab rules fail validation unless intentionally allowed by a manual tag path.
- Specialty `requiredCount = 0` groups are optional and not hard failures.
- Specialty `requiredCount > len(group)` fails validation.
- Degree `mustTakeSpecialities` cannot exceed the number of available specialties.
- Mandatory credit totals are treated as sanity checks, while mandatory course completion remains the primary rule.
- Lab eligibility is validated from the selected catalog context, not assumed global metadata.
- Planning availability rejects offerings with invalid IDs, missing credits, or `allowed_for_planning=false` when used as candidates.

### Solver Internals

Cover candidates, model builder, solution extraction, diagnostics, and reason-code generation.

Required unit tests:

- Candidate generation excludes failed courses and unresolved unknown courses.
- Candidate generation includes `recognized_passed` and passing `unknown_student_tagged` courses.
- Blocked course IDs only exclude future suggestions and do not remove already-passed courses.
- Locked future offerings are forced selected and invalid locked offerings are rejected before solving.
- Allocation variables are created only for valid `(course_instance, bucket)` pairs.
- One visible bucket per counted course is enforced by model-builder tests or extracted solution assertions.
- Mandatory, core, specialty logical, specialty visible-minimum, credit-bucket, and total-credit constraints are each covered by one focused tiny fixture.
- Finish-degree mode is feasibility-only and does not rely on optimization tie-breaks for correctness.
- Planning objective minimizes future credit units before minimizing number of future courses.
- Top-2 exclusion forbids the same future course set, not merely the same bucket assignment.
- Solution extraction reports bucket assignments, extra unused courses, manual unverified courses, warnings, and reason codes consistently.
- Diagnostics produce structured missing requirements for mandatory, core, specialty, total credits, sports, MALAG, enrichment, duplicates, manual assumptions, and locked-course issues.

## Module-Specific Test Suites

### Catalog and Course Data Module

Validate the import, normalization, and strict validation pipeline as one module.

Test cases:

- Valid tiny catalog loads and validates.
- Real CSE catalog loads and validates under known constraints.
- Course credit conflict across catalog sections fails.
- Course credit conflict between course bank and catalog fails.
- Archived past courses remain valid for finish mode.
- Future planning only uses the availability pool.
- Exporting a normalized catalog back to JSON preserves IDs, rule structure, and credit units/credits correctly.

### Student Profile and Transcript Module

Validate parse classification, confirmation, duplicate handling, and manual tagging.

Test cases:

- Transcript parse returns `recognized_passed`, `recognized_failed`, `unknown_unresolved`, `duplicate_attempt`, and `ignored` groups.
- Failed courses appear in parse output but are excluded from solver candidates.
- Duplicate non-sports attempts count once and produce a warning.
- Duplicate sports instances can both count when credits and terms support them.
- Unknown courses become usable only after student tagging and passing status confirmation.
- Manual tags are scoped to one student and never update global course bank data.
- Manual tag audit logs include student, course, credits, bucket hints, comment, degree, catalog, timestamp, and successful export usage when relevant.

### Finish-Degree Simulation Module

Validate feasibility behavior, selected catalog behavior, selected specialties, diagnostics, and explainable output.

Test cases:

- Feasible student returns `status=feasible`, summary credits, bucket assignments, rule statuses, extra unused courses, and warnings.
- Missing mandatory course returns infeasible diagnostics.
- Zero-credit mandatory course is still required.
- Core minimum is based on visible `core` assignments.
- Specialty mandatory course may satisfy a logical specialty rule while visibly assigned to another eligible bucket.
- Specialty `minimumTotalCourses` counts only visible `specialty:<id>` assignments.
- Selected specialties are hard constraints.
- Finish mode does not try unselected specialties unless that future behavior is explicitly added.
- `selected_only` searches only the selected catalog.
- `try_all_from_start_to_current` returns the earliest valid catalog and all valid alternatives, or selected/closest diagnostics when none work.
- Extra courses are marked unused and do not inflate bucket-specific rules incorrectly.
- Manual/unverified courses appear in result warnings and manual course lists.

### Planning Simulation Module

Validate optimization, future pool usage, locks, blocks, top-2 plans, and generic missing requirements.

Test cases:

- Planner suggests only future offerings from requested semesters and `allowed_for_planning=true` offerings.
- Already-passed courses remain available even if their course ID is blocked for future suggestions.
- Locked offerings are hard selected.
- Locked offerings that cannot count toward the selected catalog return a structured rejection.
- Selected specialties are hard constraints.
- If no specialties are selected, optimizer may choose valid specialties matching degree requirements.
- Primary objective chooses lower future credits even if it uses more courses.
- Tie-breaker chooses fewer future courses when future credits are equal.
- Top 2 plans have distinct future course sets.
- If a second distinct plan is infeasible, response returns only one plan with clear status.
- Sports, MALAG, and broad enrichment needs can be returned as generic missing-credit requirements instead of concrete course suggestions.
- Plan outputs include `rank`, `future_credits`, `future_course_count`, `suggested_courses`, `bucket_assignments`, `rule_statuses`, and `generic_missing_requirements` where applicable.

### API Module

Validate `POST /transcripts/parse`, `POST /simulations/finish-degree`, and `POST /simulations/plan-degree` using FastAPI `TestClient`.

Test cases:

- Valid parse request returns recognized, failed, unknown, duplicate, and ignored groups.
- Valid finish-degree request returns 200 for both feasible and infeasible simulation outcomes, with structured body status.
- Valid plan-degree request returns 200 with ranked plans or structured infeasible/invalid-lock response.
- Missing student profile returns 404.
- Missing degree/catalog returns 404.
- Invalid schema fields return 422.
- Invalid catalog search strategy returns 422 or 400 according to schema design.
- Invalid locked course offering returns 400 with explanatory error.
- API responses expose display credits, not internal `credit_units`, unless a debug/internal field is explicitly documented.
- OpenAPI generation includes all three endpoints and stable request/response schemas.

### Repository and Persistence Module

Validate repository protocols and local JSON storage first; Firebase later.

Test cases:

- Domain and solver services depend on repository protocols, not concrete storage.
- Local JSON repository can read/write student profiles, catalogs, course bank, availability pools, manual tags, and simulation history.
- Repository errors distinguish not found, validation failure, conflict, and storage failure.
- Simulation history records parse, manual tag, finish simulation, try-all-catalogs, plan run, block, lock, and export events when those features exist.
- Firestore repository contract tests reuse the same protocol-level behavior as local JSON when Firebase integration begins.

### Export Module

Validate export-ready finish payloads before pretty PDF generation.

Test cases:

- Export payload includes student info, degree, catalog year, full bucket assignment, manual/unverified comments, catalog alternatives, and unofficial disclaimer.
- Manual tags and unverified assumptions are clearly marked.
- Courses not counted are clearly marked.
- The required disclaimer text is present exactly or covered by a stable snapshot assertion.
- Export uses the same assignment/result object as finish-degree response, avoiding divergent calculations.

### Admin Data Services Module

Validate service-layer admin data operations when implemented.

Test cases:

- Catalog CRUD validates before saving.
- Course bank CRUD rejects conflicting term credit versions.
- Availability pool CRUD rejects invalid offering IDs and invalid planning flags.
- Validation endpoint returns structured errors grouped by catalog, course bank, availability, and cross-source conflicts.
- Import/export round trip preserves normalized catalog semantics.
- Archived courses can remain countable for finish-degree but excluded from future planning unless offered.

## Scenario and Fixture Plan

Create tiny catalogs where each fixture isolates one behavior. Each scenario should include expected solver status, expected selected future set where applicable, expected bucket assignment shape, and expected diagnostics.

Required finish-degree fixtures:

- `basic_feasible_catalog.json`: mandatory + total credits only.
- `missing_mandatory_catalog.json`: infeasible mandatory diagnostic.
- `zero_credit_mandatory_catalog.json`: zero-credit requirement still enforced.
- `core_visible_min_catalog.json`: core visible bucket count.
- `specialty_logical_vs_visible_catalog.json`: specialty mandatory satisfied separately from visible minimum.
- `choose_group_required_catalog.json`: positive `requiredCount` enforced.
- `choose_group_optional_catalog.json`: `requiredCount=0` not enforced.
- `sports_repeat_catalog.json`: repeated sports instances count.
- `non_sports_duplicate_catalog.json`: duplicate non-sports warning/count-once.
- `manual_tag_catalog.json`: unverified manual tag affects feasibility and appears in output.
- `try_all_catalogs_catalogs/`: multiple years with earliest valid recommendation.

Required planning fixtures:

- `planning_min_future_credits.json`: objective prefers lower future credits.
- `planning_tiebreak_course_count.json`: same credits, fewer courses wins.
- `planning_top_two_distinct.json`: second plan differs by future course set.
- `planning_blocked_future_only.json`: blocked course does not remove passed course.
- `planning_locked_valid.json`: locked offering selected.
- `planning_locked_invalid.json`: locked offering rejected.
- `planning_generic_sports.json`: generic sports missing credits.
- `planning_auto_specialty_choice.json`: optimizer chooses specialties when none selected.

Regression fixtures:

- Real CSE 2022/2023 catalog import smoke test.
- At least three known student stories: clearly feasible, clearly infeasible, and planning-needed.
- Golden snapshots for API response shape on one finish-degree success, one finish-degree infeasible response, and one planning response.

## Coverage and Quality Gates

Recommended commands once tooling exists:

```powershell
python -m pytest tests/unit
python -m pytest tests/module
python -m pytest tests/scenarios
python -m pytest tests/api
python -m pytest tests/regression -m smoke
python -m pytest --cov=optigrade --cov-report=term-missing
python -m ruff check .
python -m mypy optigrade
```

Coverage expectations:

- Domain, validators, and services: high line and branch coverage because they are deterministic.
- Solver: scenario coverage is more important than raw branch coverage; every rule type needs at least one feasible and one failing/edge case where practical.
- API: every endpoint needs success, validation error, missing resource, and domain rejection tests.
- Regression: keep real-catalog tests selective and mark slower tests separately.

Suggested markers:

- `unit`
- `module`
- `scenario`
- `api`
- `regression`
- `slow`
- `firebase`
- `snapshot`

## Milestone Acceptance Gates

### Milestone 0: Test Infrastructure

Acceptance criteria:

- Pytest layout exists.
- Shared fixture factories exist for courses, catalogs, students, availability, and manual tags.
- CI or local quality script runs unit tests and linting.
- Coverage reporting is configured.

### Milestone 1: Domain Primitives

Acceptance criteria:

- Unit coverage exists for course IDs, credit units, offerings, student course instances, bucket names, rule objects, and result objects.
- Tests prove no integer coercion of course IDs and no float math inside solver-facing credit units.

### Milestone 2: Loaders and Validators

Acceptance criteria:

- Tiny catalog/course-bank/student/availability fixtures load successfully.
- Invalid fixtures fail with structured validation errors.
- Real CSE catalog import has a smoke test.

### Milestone 3: Synthetic Fixture Suite

Acceptance criteria:

- Every core rule has at least one tiny fixture.
- Fixture naming documents the behavior under test.
- Expected outputs are deterministic and reviewable.

### Milestone 4: Finish-Degree Solver

Acceptance criteria:

- Feasible and infeasible finish-degree scenario suites pass.
- Mandatory, core, specialty, sports, MALAG/enrichment, project/lab, total-credit, duplicate, manual-tag, and catalog-search behaviors are covered.
- Outputs prove one visible bucket per counted course.

### Milestone 5: Planning Solver

Acceptance criteria:

- Planning objective and tie-breaker are tested.
- Locks, blocks, future pool filtering, automatic specialty selection, top-2 distinct plans, and generic missing requirements are covered.

### Milestone 6: Results, Diagnostics, and Reason Codes

Acceptance criteria:

- Rule statuses align with solver assignments.
- Diagnostics are structured and actionable for each supported missing requirement type.
- Reason codes explain why courses were assigned or left unused.

### Milestone 7: Transcript and Manual Tag Services

Acceptance criteria:

- Mock transcript parsing classification is tested.
- Manual tag flow updates student profile, creates audit logs, marks unverified assumptions, and affects simulation.

### Milestone 8: FastAPI Contracts

Acceptance criteria:

- All three endpoint suites pass with FastAPI `TestClient`.
- Request/response schemas are validated, including 422/404/400 behavior.
- OpenAPI generation is tested as a smoke check.

### Milestone 9: Export-Ready Payload

Acceptance criteria:

- Export payload includes assignments, manual/unverified comments, alternatives, unused courses, and required unofficial disclaimer.
- Export tests reuse finish-degree results rather than recalculating rules.

### Milestone 10+: Persistence, Admin, Firebase

Acceptance criteria:

- Repository contract tests pass against local JSON first.
- Admin data service tests cover validation before save and import/export round trips.
- Firebase/Firestore tests reuse repository contract tests and are isolated behind a marker.

## QA Operating Rules

- Every new rule, bucket type, diagnostic type, or API field must add or update a test in the same milestone.
- Prefer tiny deterministic fixtures before testing full real catalogs.
- Keep OR-Tools tests deterministic with known optimal solutions and clear tie-break cases.
- Do not test frontend, Firebase auth, PDF parsing, semester scheduling, substitutions, or admin UI until their milestone starts.
- When a milestone is completed, make a git commit for that milestone per project rule.
- Treat test failures in domain, validation, and solver scenario suites as release blockers for backend readiness.