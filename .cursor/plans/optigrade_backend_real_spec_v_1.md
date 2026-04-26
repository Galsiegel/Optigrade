# Optigrade Backend Specification v1

## 1. Purpose

Optigrade is a backend system for degree-completion simulation and planning.

It serves two main student-facing use cases:

1. **Finish Degree Simulation**  
   Check whether a student's already-completed courses can satisfy the rules of a selected degree curriculum/catalog.

2. **Degree Planning**  
   Given the student's completed courses and preferences, suggest the minimum set of additional courses needed to complete the degree.

A future admin-facing system will allow faculty secretaries/admins to maintain degree catalogs, course banks, semester availability pools, manual-tag review logs, and student simulation records.

The backend is not only an optimization engine. It is also an **auditable degree-closing assignment engine**: it must explain which courses were assigned to which buckets, which rules were satisfied, which courses were ignored, and which assumptions/manual tags were used.

---

## 2. High-Level Product Modes

### 2.1 Finish Degree Simulation Mode

Goal: determine whether a student's completed courses can be assigned to degree buckets in a way that satisfies all selected curriculum rules.

Flow:

1. Student logs in. Login is not MVP.
2. Student selects a degree.
3. Student selects a curriculum/catalog year. The student may choose any yearly catalog from their starting academic year onward.
4. Student optionally selects specialties.
5. Student uploads a grade sheet/transcript.
6. Backend parses the grade sheet.
7. Backend returns recognized courses, failed/ignored courses, duplicate courses, and unknown courses.
8. Student manually tags unknown courses if needed.
9. Student chooses **Finish Degree Simulation**.
10. Backend runs the solver using only completed/passed courses plus manually tagged courses.
11. If feasible:
    - Return success.
    - Return full bucket assignment.
    - Return satisfied rule statuses.
    - Return extra unused courses.
    - Allow export of an unofficial completion report.
12. If infeasible:
    - Return structured missing-rule diagnostics.
    - If the user requests it, backend may try all catalogs from the student's starting academic year through the current academic year.
    - If any catalog works, return the earliest valid catalog as recommended and list all valid alternatives.
    - If no catalog works, return diagnostics for the selected catalog and closest catalog.

Important: if the student selected specialties in finish mode, those specialties are hard constraints. Trying all possible specialties should only happen after the user explicitly asks.

---

### 2.2 Degree Planning Mode

Goal: suggest additional future courses needed to finish the degree.

Flow:

1. Student selects degree.
2. Student selects catalog year.
3. Student optionally selects specialties.
4. Backend loads the selected catalog rules.
5. Backend loads the student's confirmed passed courses.
6. Backend loads the future available course pool from several future semesters.
7. Student may mark courses to avoid.
8. Student may lock courses they want included.
9. Backend runs optimization.
10. Backend returns the top 2 distinct plans.
11. Student may block/lock courses and rerun.

MVP does **not** need semester-by-semester scheduling. It only needs to return which additional courses should be taken.

Planning mode uses:

- Selected catalog rules.
- Passed courses from the student profile.
- Future candidate courses from the admin-maintained available course pool.
- Locked courses as hard constraints.
- Blocked courses as hard exclusions.

If the student selects specialties, they are hard constraints. If the student does not select specialties, the optimizer may choose a valid specialty combination.

---

## 3. Backend API Direction

Production APIs should be based on identifiers and stored backend data, not raw frontend-supplied degree JSON.

### 3.1 Main Endpoints

Eventually expose separate endpoints:

```http
POST /simulations/finish-degree
POST /simulations/plan-degree
```

These are separate because they have different objectives, solver behavior, diagnostics, and output expectations.

---

### 3.2 Transcript Parsing Endpoint

Transcript parsing is a separate step from optimization.

```http
POST /transcripts/parse
```

The parser returns:

- Recognized passed courses.
- Recognized failed courses.
- Unknown unresolved courses.
- Duplicate attempts.
- Ignored courses.

The student then confirms the parsed data and manually tags unknown courses if needed. Confirmed data is saved to the student profile.

---

### 3.3 Finish Degree Request

Example:

```json
{
  "student_profile_id": "student_123",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "selected_specialties": ["specialty_3", "specialty_8"],
  "catalog_search_strategy": "selected_only"
}
```

Supported `catalog_search_strategy` values:

- `selected_only`
- `try_all_from_start_to_current`

The second option should only be used when the user explicitly asks to try other catalogs.

---

### 3.4 Plan Degree Request

Example:

```json
{
  "student_profile_id": "student_123",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "selected_specialties": ["specialty_3", "specialty_8"],
  "locked_course_offering_ids": ["046195__2026_winter"],
  "blocked_course_ids": ["046203"],
  "future_semesters": ["2026_winter", "2027_spring", "2027_winter"],
  "num_plans": 2
}
```

Blocked courses apply only to future suggestions. Already-passed courses remain available for finish-degree assignment.

Locked courses are hard constraints. If a locked course cannot count toward the selected degree/curriculum, the backend should reject the request and explain the issue.

---

## 4. Core Concepts

### 4.1 Course ID

Course IDs are always strings.

Examples:

```text
"044101"
"046195"
```

They must never be represented as integers, because leading zeroes are meaningful.

---

### 4.2 Course Offering / Version

A course can change credits over time. Therefore, credit identity is based on:

```text
course_id + term
```

Example:

```json
{
  "course_id": "046195",
  "term": "2024_spring",
  "credits": 3.5
}
```

Rules:

- In finish-degree mode, completed courses use the credits from the term in which the student took the course.
- In planning mode, future suggested courses use the credits from the available offering/version.
- The syllabus JSON is treated as ground truth for past semesters during initial infrastructure bootstrapping.
- Future admin-maintained data should become the better ground truth over time.
- The system should still support exporting degree/catalog specifications back to JSON.

---

### 4.3 Internal Credit Scaling

OR-Tools CP-SAT works with integers, while Technion credits can be fractional.

Internally, all credits should be scaled by 2:

```text
3.0 credits  -> 6 credit_units
3.5 credits  -> 7 credit_units
159.5 credits -> 319 credit_units
```

All solver constraints operate on `credit_units`.

API responses convert values back to regular credits.

---

### 4.4 Student Course Instance

The solver should distinguish between course code and course instance.

A completed course instance should include:

```json
{
  "course_instance_id": "044101__2022_winter__attempt_1",
  "course_id": "044101",
  "term": "2022_winter",
  "credits": 3,
  "status": "passed",
  "source": "transcript",
  "verified": true
}
```

This is important for sports, because the same sports course code may be taken and counted more than once.

For non-sports courses, the same course code should not count twice. If duplicate non-sports attempts exist, the backend should count the course once and notify the user.

---

## 5. Bucket Model

### 5.1 Formal Bucket Types

The system uses the following visible bucket types:

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

Notes:

- `free_choice` should not be used as a formal internal bucket. The correct internal bucket is `enrichment`.
- The UI may display aliases if needed, but the backend should use normalized bucket names.
- Specialties must be represented as specific buckets, not a generic `specialty` bucket.

Example:

```text
specialty:specialty_3
specialty:specialty_8
```

---

### 5.2 Bucket Assignment Rule

Each counted course instance is assigned to exactly one visible bucket.

Each unused course is assigned to `extra_unused` or returned in a separate unused section.

Formal rule:

```text
For every course instance i:
  sum(alloc[i, b] for b in visible_buckets) <= 1
```

If the course is counted toward the degree:

```text
sum(alloc[i, b] for b in visible_buckets excluding extra_unused) = 1
```

If the course is not counted:

```text
alloc[i, extra_unused] = 1
```

or it appears in an explicit `extra_unused_courses` list.

---

### 5.3 Bucket Assignment vs Rule Satisfaction

Bucket assignment and rule satisfaction are separate.

A course has one visible bucket assignment, but it may also satisfy logical rules.

Example:

```text
Course 046195 may be assigned to core.
The same course may also satisfy the rule "AI specialty requires 046195".
```

However, if a specialty requires `minimumTotalCourses = 3`, only courses visibly assigned to that specialty bucket count toward that minimum.

So:

```text
specialty mandatory requirement checks selected/completed course existence.
specialty minimumTotalCourses checks visible allocation to specialty:<specialty_id>.
```

---

## 6. Degree Rules

Degree rules are stored in yearly catalogs.

A degree catalog includes:

- Degree ID.
- Program name.
- Academic year.
- General rules.
- Mandatory course list.
- Core course list.
- Specialty definitions.
- Faculty choice pool.
- Enrichment rules.
- Sports rules.
- MALAG rules.
- Project rules.
- Lab rules.

---

### 6.1 Catalog Versioning

Degree rules are versioned yearly.

Example:

```text
computer_software_engineering_2021
computer_software_engineering_2022
computer_software_engineering_2023
```

Course availability for future planning is versioned by semester, not only by catalog year.

---

### 6.2 Mandatory Courses

Mandatory courses are courses the student must complete as part of the degree program.

Primary rule:

```text
Student must complete all mandatory courses in the selected catalog.
```

`mandatoryCredits` may exist in the catalog and should be used as a validation/sanity check, but the primary rule is completion of all mandatory courses.

Zero-credit mandatory courses must still be required.

Example:

```text
Safety course: 0 credits, still mandatory.
```

---

### 6.3 Core Courses

Core courses are constrained by number of courses.

Example:

```text
mustChooseCoreGroups = 4
```

Means:

```text
At least 4 courses must be visibly assigned to the core bucket.
```

A core course may also appear in specialty lists or other pools. A course can be eligible for multiple rule pools, but it still has only one visible bucket assignment.

If a student completed more core courses than needed, the solver may assign the extra ones to another eligible bucket, such as `faculty_choice` or `enrichment`.

---

### 6.4 Specialties

Each specialty has:

- `trackId`
- Hebrew and English names
- `mandatoryCourses`
- `chooseOneOfGroups`
- `minimumTotalCourses`
- Course list

A degree may require a fixed number of active specialties.

Example:

```text
mustTakeSpecialities = 2
```

The solver should use binary variables:

```text
active_specialty[specialty_id] ∈ {0,1}
```

Rules:

- If the student selected specialties, those specialties are hard constraints.
- If the student did not select specialties in planning mode, the optimizer may choose valid specialties.
- In finish-degree mode, selected specialties are hard constraints. Trying all specialties requires a separate user request.
- Sum of active specialties must equal the degree requirement.

Formal rule:

```text
sum(active_specialty[s] for s in all_specialties) == required_specialty_count
```

For each active specialty:

1. All `mandatoryCourses` must be selected/completed somewhere.
2. Every positive `chooseOneOfGroups` requirement must be satisfied.
3. At least `minimumTotalCourses` must be visibly assigned to `specialty:<specialty_id>`.

Important distinction:

- A specialty mandatory course may be assigned visually to `core`, `mandatory`, or another eligible bucket and still satisfy the specialty mandatory-course rule.
- But it does not count toward `minimumTotalCourses` unless visibly assigned to that specialty bucket.

---

### 6.5 Choose-One Groups

Specialty rules may include groups like:

```json
{
  "courses": ["046202", "046203"],
  "requiredCount": 1
}
```

Meaning:

```text
At least 1 course from this group must be selected/completed.
```

If `requiredCount = 0`, the group is optional and should not be enforced as a hard requirement. It may still be displayed as a known optional sub-rule.

---

### 6.6 Faculty Choice

Faculty choice is both:

1. A pool of eligible faculty-approved courses.
2. A visible bucket that can absorb valid extra courses needed to reach total degree credits.

Rules:

- A course may be assigned to `faculty_choice` only if it appears in the faculty choice pool or is otherwise marked as eligible.
- If a non-selected specialty course appears in the faculty choice pool, it may be assigned to `faculty_choice`.
- If it does not appear in faculty choice, fallback may be `enrichment` if eligible.

Future implementation may include explicit min/max constraints for faculty choice.

---

### 6.7 Enrichment

`enrichment` is the formal internal bucket for what may be casually called free choice.

It is constrained by minimum credits where relevant.

The planner should not suggest specific enrichment courses if the pool is broad or external. Instead, it may return:

```text
Student needs X enrichment credits.
```

---

### 6.8 Sports

Sports is a special bucket because the same course code may be taken and counted multiple times.

Rules:

- Sports requirements are credit-based.
- Sports course instances may repeat by term.
- Same course code can count multiple times only for sports.
- Planning mode should not suggest a specific sports course. It should return the amount of sports credits still needed.

Example:

```text
Student needs 2 sports credits.
```

---

### 6.9 MALAG

`malag` is a visible bucket.

It is constrained by minimum credits.

Planning mode may return a generic missing-credit message rather than suggesting a specific MALAG course, depending on available data.

Example:

```text
Student needs 3 MALAG credits.
```

---

### 6.10 Project

Project may be represented as a rule and/or visible bucket.

The degree catalog should define exactly which courses satisfy project requirements.

Project courses may also be mandatory depending on the degree.

The solver should enforce the project rule if defined, and the output should show project-assigned courses clearly.

---

### 6.11 Lab

Lab may be degree-specific.

A course may be:

- A lab in one degree.
- Mandatory but not lab in another degree.
- Eligible for a lab bucket/rule depending on the selected catalog.

Therefore, lab status should not be treated as globally fixed only by course metadata. It can depend on the degree catalog.

The degree catalog should define whether lab is:

- A visible bucket.
- A rule based on course flags.
- Both.

---

### 6.12 Total Credits

The degree has a total credit requirement.

Example:

```text
totalCredits = 159.5
```

The solver should enforce:

```text
sum(credits of counted course instances) >= totalCredits
```

The objective in planning mode minimizes future credits, so the result should stay as close as possible to the required total.

Future implementation may add maximum bucket constraints, such as elective path maximums. For now, maximum constraints are out of scope unless explicitly encoded later.

---

## 7. Data Storage and Loading

### 7.1 Course Bank

The system should maintain a central course bank.

The course bank stores:

- Course ID.
- Hebrew name.
- English name.
- Credit versions by term.
- Metadata.
- Archived status.
- Known replacements/substitutions in later phases.

Example:

```json
{
  "course_id": "046195",
  "name_en": "Machine Learning",
  "name_he": "מערכות לומדות",
  "credit_versions": [
    {
      "from_term": "2022_winter",
      "to_term": "2024_spring",
      "credits": 3.5
    },
    {
      "from_term": "2024_winter",
      "to_term": null,
      "credits": 3
    }
  ]
}
```

---

### 7.2 Degree Catalog JSON

The current syllabus JSONs are treated as ground truth for historical catalogs during initial infrastructure setup.

They may be denormalized and include embedded course metadata.

The backend loader should normalize them into canonical internal objects.

Long-term target:

- Course metadata lives in course bank.
- Degree catalog stores course IDs and rules.
- Admin interface can export the current specification back to JSON.

---

### 7.3 Validation Rules

Validation should be strict.

A course should not have conflicting credits in the same term.

This should be tested across:

- Different sections of the same degree catalog.
- Different degrees in the same term/year.
- Course bank versus imported JSON.

If a conflict is found, validation should fail.

Examples of invalid data:

```text
046195 has 3.5 credits in one 2022 catalog section
046195 has 3.0 credits in another 2022 catalog section
```

This should not be silently allowed.

---

### 7.4 Future Available Course Pool

Future planning uses an admin-maintained availability pool across several future semesters.

Example:

```json
{
  "semester_id": "2026_winter",
  "courses": [
    {
      "course_id": "046195",
      "offering_id": "046195__2026_winter",
      "credits": 3.5,
      "allowed_for_planning": true,
      "source": "secretary"
    }
  ]
}
```

Rules:

- Planning mode may suggest only courses from the available future pool.
- Finish-degree mode may count already-passed archived/unavailable courses.
- Mandatory/core courses may be stable, but specialty offerings may change more frequently.

---

## 8. Student Profile

The student profile stores confirmed parsed/manual courses.

Example:

```json
{
  "student_id": "student_123",
  "degree_start_year": 2021,
  "completed_courses": [
    {
      "course_instance_id": "044101__2021_winter__attempt_1",
      "course_id": "044101",
      "term": "2021_winter",
      "credits": 3,
      "status": "passed",
      "source": "transcript",
      "verified": true
    },
    {
      "course_instance_id": "999999__manual__1",
      "course_id": "999999",
      "term": "unknown",
      "credits": 3,
      "status": "passed",
      "source": "manual_student_tag",
      "verified": false,
      "eligible_bucket_types": ["specialty:specialty_8"],
      "comment": "Student-provided mapping"
    }
  ]
}
```

---

## 9. Transcript Parsing Statuses

Parsed transcript courses should be classified as:

```text
recognized_passed
recognized_failed
unknown_unresolved
unknown_student_tagged
duplicate_attempt
ignored
```

MVP solver uses:

- `recognized_passed`
- `unknown_student_tagged` with passing status

Failed courses are shown to the student but ignored by the solver.

Duplicate non-sports courses should be counted once and reported to the user.

---

## 10. Manual Course Tagging

If a course parsed from the transcript is not found in the database, the student may manually tag it.

MVP manual tag fields:

```json
{
  "course_code": "999999",
  "credits": 3,
  "bucket_types": ["specialty:specialty_8"],
  "comment": "Approved by secretary according to student"
}
```

Manual tags are not restricted by bucket type in MVP.

Rules:

- Manual tags are scoped to the student profile.
- Manual tags do not modify the global course bank.
- Manual tags affect simulation immediately.
- Manual tags must be marked as unverified.
- If an exported finish-degree report uses manual tags, they must appear in comments.
- Admin logs should capture manual tags for later review.

---

### 10.1 Manual Tag Audit Log

Suggested log record:

```json
{
  "student_id": "student_123",
  "course_code": "999999",
  "credits": 3,
  "bucket_types": ["specialty:specialty_8"],
  "comment": "Student-provided mapping",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "created_at": "2026-04-25T12:00:00Z",
  "used_in_successful_export": true
}
```

Future admin tools may review these logs and add official mappings to the course bank.

---

## 11. Solver Model

### 11.1 Variables

The solver should use course instances, not just course IDs.

#### Course selection variable

```text
x[i] ∈ {0,1}
```

Meaning:

```text
course instance i is counted/selected in the simulation
```

For finish-degree mode:

- All valid passed courses are fixed as selected.
- Valid manual-tagged passed courses are fixed as selected.
- Failed, ignored, and unresolved courses are excluded.
- The solver does not choose a subset of passed courses; it chooses their bucket assignment.
- Passed courses that do not fit a real requirement bucket are returned as extra/unused/unassigned courses.

For planning mode:

- All valid passed courses are fixed as selected/completed.
- Future candidate courses are decision variables.
- Locked courses are fixed to selected.
- Blocked courses are fixed to not selected.

Important policy for selected passed courses:

- A selected course satisfies bucket-specific rules only if it is assigned to that bucket via `alloc[i,b]`.
- Courses assigned to extra buckets such as `extra_unused`/`extra_unassigned` do not satisfy core count, specialty visible minimum, sports, MALAG, project, or lab rules.
- According to MVP policy, these extra courses may still contribute to total completed credits.

---

#### Bucket allocation variable

```text
alloc[i, b] ∈ {0,1}
```

Meaning:

```text
course instance i is visibly assigned to bucket b
```

Created only for valid `(course_instance, bucket)` pairs.

Sparse allocation is important.

---

#### Active specialty variable

```text
active_specialty[s] ∈ {0,1}
```

Meaning:

```text
specialty s is one of the active specialties used for the simulation
```

---

### 11.2 Core Constraints

#### Allocation implies selection

```text
alloc[i, b] <= x[i]
```

A course can only be assigned to a bucket if it is counted.

---

#### One visible bucket per counted course

```text
sum(alloc[i, b] for b in visible_buckets) <= 1
```

A course cannot be counted twice across visible buckets.

Sports is the only exception where repeated instances of the same course code may count multiple times. This is handled by separate course instances, not by assigning one instance twice.

---

#### Mandatory completion

For every mandatory course ID `cid` in the selected catalog:

```text
sum(x[i] for i where course_id(i) == cid and status/pass/selected) >= 1
```

Zero-credit mandatory courses still require completion.

---

#### Core requirement

If the catalog requires `K` core courses:

```text
sum(alloc[i, core] for eligible core course instances i) >= K
```

---

#### Specialty count requirement

If the degree requires `R` specialties:

```text
sum(active_specialty[s] for s in specialties) == R
```

If the student selected specialties:

```text
active_specialty[s] = 1 for selected specialties
active_specialty[s] = 0 for non-selected specialties
```

In planning mode, if the student did not select specialties, the optimizer may choose the active specialties.

---

#### Specialty logical requirements

For each active specialty `s`:

Mandatory specialty courses:

```text
x[course_required] >= active_specialty[s]
```

For each choose-one group with `requiredCount = k`:

```text
sum(x[i] for i in group_courses) >= k * active_specialty[s]
```

These requirements check course selection/completion, not visible bucket assignment.

---

#### Specialty visible minimum

For each active specialty `s` with `minimumTotalCourses = N`:

```text
sum(alloc[i, specialty:s] for i eligible for specialty s) >= N * active_specialty[s]
```

Only courses visibly assigned to that specialty bucket count toward this rule.

---

#### Credit-based bucket requirements

For credit-based buckets such as sports, MALAG, enrichment, and possibly faculty choice:

```text
sum(credit_units[i] * alloc[i, bucket]) >= required_credit_units[bucket]
```

---

#### Total degree credits

```text
sum(credit_units[i] * x[i]) >= total_required_credit_units
```

Future implementation may restrict this to counted non-extra courses explicitly.

---

### 11.3 Planning Objective

Planning mode minimizes future credits.

Primary objective:

```text
minimize sum(credit_units[i] * x[i] for future course instances i)
```

Tie-breaker:

```text
minimize number of future courses
```

This keeps the plan as close as possible to the total required credits while also preferring fewer courses when credit totals are equal.

---

### 11.4 Finish Degree Objective

Finish-degree mode is mainly feasibility.

The solver only needs to find a valid assignment.

No optimality search is required for MVP.

Optional future tie-breakers:

- Prefer verified transcript courses over manual/unverified courses.
- Prefer fewer manual assumptions.
- Prefer clearer secretary-facing assignments.

---

### 11.5 Top-2 Plans

Planning mode should return the top 2 distinct plans.

Distinct means different future course set.

The following should **not** count as different plans:

```text
same future courses, different bucket assignment
```

The following should count as different:

```text
Plan 1: {A, B, C}
Plan 2: {A, B, D}
```

Implementation approach:

1. Solve best plan.
2. Record selected future course set.
3. Add exclusion constraint forbidding exactly that same future course set.
4. Solve again.
5. Return second plan if feasible.

---

## 12. Infeasibility Diagnostics

Exact CP-SAT infeasibility explanations are hard.

MVP may use best-effort diagnostics after failure.

Diagnostics should include structured JSON and human-readable explanations.

Possible diagnostics:

- Missing mandatory courses.
- Missing core course count.
- Missing active specialty requirements.
- Missing specialty visible course count.
- Missing total credits.
- Missing sports credits.
- Missing MALAG credits.
- Missing enrichment credits.
- Manual/unverified course assumptions.
- Duplicate non-sports courses ignored.
- Locked course cannot count.

Example:

```json
{
  "status": "infeasible",
  "missing_requirements": [
    {
      "type": "mandatory_course",
      "course_id": "044101",
      "message": "Mandatory course 044101 is missing."
    },
    {
      "type": "core_count",
      "required": 4,
      "actual": 3,
      "missing": 1,
      "message": "One additional core course is required."
    }
  ]
}
```

---

## 13. Finish Degree Result

Finish-degree success response should include:

```json
{
  "status": "feasible",
  "degree_id": "computer_software_engineering",
  "catalog_year": 2022,
  "selected_specialties": ["specialty_3", "specialty_8"],
  "summary": {
    "total_required_credits": 159.5,
    "counted_credits": 160.0,
    "extra_unused_credits": 6.0
  },
  "bucket_assignments": [
    {
      "bucket": "mandatory",
      "courses": []
    },
    {
      "bucket": "core",
      "courses": []
    },
    {
      "bucket": "specialty:specialty_8",
      "courses": []
    }
  ],
  "rule_statuses": [],
  "extra_unused_courses": [],
  "manual_unverified_courses": [],
  "warnings": []
}
```

Each course should include:

```json
{
  "course_id": "046195",
  "term": "2024_spring",
  "credits": 3.5,
  "name_en": "Machine Learning",
  "name_he": "מערכות לומדות",
  "assigned_bucket": "specialty:specialty_8",
  "source": "transcript",
  "verified": true,
  "manual_comment": null,
  "reason_codes": [
    "assigned_to_active_specialty",
    "counts_toward_specialty_minimum"
  ]
}
```

---

## 14. Planning Result

Planning response should include top 2 plans.

Example:

```json
{
  "status": "optimal",
  "plans": [
    {
      "rank": 1,
      "future_credits": 12,
      "future_course_count": 4,
      "suggested_courses": [],
      "bucket_assignments": [],
      "rule_statuses": [],
      "generic_missing_requirements": [
        {
          "bucket": "sports",
          "missing_credits": 2,
          "message": "Complete 2 sports credits."
        }
      ]
    },
    {
      "rank": 2,
      "future_credits": 15,
      "future_course_count": 5,
      "suggested_courses": [],
      "bucket_assignments": [],
      "rule_statuses": []
    }
  ]
}
```

Planning mode should not suggest specific sports, MALAG, or broad enrichment courses when those are better represented as generic missing credit requirements.

---

## 15. Exported Finish-Degree Report

Export is only required for finish-degree mode.

The export should include:

1. Student info.
2. Degree and catalog year.
3. Full course assignment by bucket.
4. Manual/unverified course tags and comments.
5. Catalog alternatives tested, if relevant.
6. Unofficial simulation disclaimer.

It should clearly mark:

- Manual student-provided tags.
- Unverified assumptions.
- Courses that were not counted.
- Alternative catalogs that also worked.

Required disclaimer:

```text
This document is an unofficial degree-completion simulation generated by Optigrade. It is not an official Technion approval. Manual or unverified course assignments are marked and require secretary review.
```

---

## 16. Simulation History

Simulation results should eventually be persisted.

Useful events:

- Student parsed transcript.
- Student manually tagged courses.
- Student ran finish-degree simulation.
- Student tried all catalogs.
- Student ran planning mode.
- Student blocked a course.
- Student locked a course.
- Student exported a report.

Firebase/Firestore persistence is a later phase.

---

## 17. Phased Development Plan

### Phase 1 — Core Data Model and Local Solver MVP

Goal: working local/backend solver using JSON data.

Deliverables:

1. Normalize degree catalog JSON into internal models.
2. Build course bank loader with versioned credits.
3. Implement student profile model.
4. Implement course instance model.
5. Implement bucket model.
6. Implement finish-degree solver feasibility.
7. Implement planning solver optimization.
8. Support credit scaling by 2.
9. Return structured bucket assignment and rule statuses.
10. Return top 2 planning results.
11. Add validation tests for duplicate/conflicting credits.

Out of scope:

- Firebase auth.
- Admin UI.
- PDF transcript parsing.
- Semester scheduling.
- Substitutions/replacements.

---

### Phase 2 — Transcript Parsing and Student Corrections

Deliverables:

1. `POST /transcripts/parse` endpoint.
2. Parse grade-sheet PDF into course records.
3. Classify parsed courses by status.
4. Allow manual tagging of unknown courses.
5. Store manual tags in student profile.
6. Log manual tags for admin review.
7. Mark unverified courses in simulation results.
8. Export comments for manual tags.

Also include:

- Basic replacements/substitutions support.
- Duplicate attempt handling.
- User warnings for duplicate non-sports courses.

---

### Phase 3 — API Layer

Deliverables:

1. FastAPI application.
2. `POST /simulations/finish-degree`.
3. `POST /simulations/plan-degree`.
4. Request/response Pydantic models.
5. Structured infeasibility diagnostics.
6. Top-2 plan enumeration.
7. Export-ready result format.
8. Local JSON-backed storage.

---

### Phase 4 — Admin Data Management

Admin UI is a separate conversation, but backend should support admin-owned data.

Deliverables:

1. Course bank CRUD.
2. Degree catalog CRUD.
3. Future available course pool CRUD.
4. Manual tag logs.
5. Validation endpoints.
6. JSON import/export for catalogs.
7. Archived course handling.

---

### Phase 5 — Firebase Integration

Deliverables:

1. Firebase Admin SDK.
2. Firebase Auth token verification.
3. Firestore persistence.
4. Student profiles.
5. Simulation history.
6. Degree catalogs.
7. Course bank.
8. Availability pools.
9. Manual tag logs.

---

### Phase 6 — Advanced Planning

Deliverables:

1. Semester-by-semester scheduling.
2. Prerequisite-aware planning.
3. Course offering constraints by semester.
4. Alternative plans with meaningful difference metrics.
5. Better objective preferences.
6. Course difficulty/preferences.
7. Admin approval workflow for manual tags.
8. Official-style report generation.

---

## 18. Important Future Topics

The following topics are intentionally deferred but should remain in the plan:

1. Bucket maximum constraints.
2. Elective-in-path min/max rules.
3. Full prerequisite scheduling.
4. Course substitutions/equivalencies.
5. Secretary approval workflow.
6. Multi-degree shared course-bank validation.
7. Admin UI.
8. Report/PDF generation.
9. Hebrew/English UI formatting.
10. Better diagnostics for infeasible CP-SAT models.

---

## 19. Key Engineering Principles

1. **Course IDs are strings.**
2. **Credits are integer-scaled internally.**
3. **Course identity for credits is course_id + term.**
4. **Bucket assignment is separate from rule satisfaction.**
5. **Every counted course has one visible bucket assignment.**
6. **Sports can count repeated course codes via separate instances.**
7. **Manual tags are allowed but must be auditable.**
8. **Finish-degree mode is feasibility-first.**
9. **Planning mode minimizes future credits, then number of future courses.**
10. **Results must be explainable enough for students and secretaries.**

