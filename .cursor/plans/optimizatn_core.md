INPUTS:
  mode = finish_degree | plan_degree
  degree_catalog
  student_profile
  selected_specialties optional
  future_available_courses only in planning mode
  locked_future_courses only in planning mode
  blocked_future_courses only in planning mode

BUILD COURSE SET:
  passed_courses = valid passed + valid manually-tagged passed courses
  ignore failed / unresolved / ignored courses

  if course is non-sports duplicate:
      count it once and warn user

  if course is sports duplicate:
      allow repeated course instances

  if mode == planning:
      future_courses = courses from future availability pool
      remove blocked future courses or hard assign them to 0

VARIABLES:
  x[i] = course instance i is selected in the simulation

  For every passed course:
      x[i] = 1

  For every future course:
      if locked:
          x[i] = 1
      else:
          x[i] is decision variable

  alloc[i,b] = course i is assigned to bucket b

  active_specialty[s] = specialty s is active

BUCKETS:
  real visible buckets:
      mandatory
      core
      specialty:<id>
      faculty_choice
      enrichment
      sports
      malag


  extra bucket:
      extra_unused

  Every selected course must be assigned to exactly one bucket:
      sum over all buckets alloc[i,b] == x[i]

  extra_unused means:
      course exists in student record / completed courses
      but does not satisfy a specific visible bucket rule


CONSTRAINTS:

1. Allocation implies selection:
      alloc[i,b] <= x[i]

2. Mandatory courses:
      for every mandatory course cid:
          at least one selected course with course_id == cid

3. Core:
      number of courses assigned to core >= required_core_count

4. Specialty activation:
      if student selected specialties:
          selected specialties are active

      number of active specialties == required_specialty_count

      if student selected fewer than required:
          solver may choose the remaining specialties

5. Specialty logical rules:
      for each active specialty:
          all mandatory specialty courses must be selected somewhere
          each required choose-one group must be satisfied somewhere

      Important:
          these check x[i], not alloc[i, specialty]
5.b.Lab/project are logical degree rules, not buckets.
            A lab/project course is assigned to its normal visible bucket, e.g. mandatory or faculty_choice, but also counts toward the lab/project minimum required by the degree.

6. Specialty visible minimum:
      for each active specialty:
          number of courses assigned to specialty:<id>
          >= specialty.minimumTotalCourses

      Important:
          course assigned to core can satisfy specialty mandatory rule,
          but does not count toward specialty visible minimum

7. Credit-based buckets:
      credits assigned to sports >= required sports credits
      credits assigned to malag >= required malag credits
      credits assigned to enrichment >= required enrichment credits
      credits assigned to faculty_choice >= required faculty choice credits, if relevant

8. Total credits:
      total credits of all selected courses
      plus generic missing planning credits if used
      >= total degree credits

PLANNING-SPECIFIC LOGIC:

  blocked courses:
      blocked future course => cannot be selected
      already-passed course is not affected by block

  locked courses:
      locked future course => must be selected
      if locked course cannot count anywhere, reject before solving

  generic requirements:
      for sports / malag / broad enrichment:
          planner should return "student needs X credits"
          instead of suggesting specific courses (to make solving easier)

          OBJECTIVE:

  finish_degree:
      find any feasible valid assignment

  plan_degree:
      minimize future credits
      tie-breaker: minimize number of future courses

  top 2 plans:
      solve best plan
      record selected future course set
      forbid the exact same future course set
      solve again

RESULT EXTRACTION:

  if solver found solution:
      output bucket assignment from actual alloc values
      output active specialties from actual active_specialty values
      compute rule statuses from actual x / alloc / active_specialty values
      mark manual courses as unverified
      show extra_unused courses separately

  if infeasible:
      do not invent bucket assignments
      return diagnostics only

KEY PRINCIPLES:

  passed courses are always selected
  future courses are chosen by optimizer
  each selected course has exactly one visible assignment
  bucket assignment and rule satisfaction are separate
  specialty mandatory rules check selected courses
  specialty minimumTotalCourses checks visible specialty assignment
  rule statuses must come from solved assignment, not from candidate availability