"""
Manual transcript parser harness for local PDF checks.

This script is intentionally outside pytest collection because it depends on
local PDF fixtures and legacy parser behavior.

Usage:
    python scripts/manual_parser_all_pdfs.py
"""

import json
import traceback
from collections import Counter
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from student_loader.parse_transcript import parse_transcript_pdf

GRADES_DIR = Path("data/dummy_exampleJSON/grades")
DEGREE_PATH = Path("data/dummy_exampleJSON/dummy_degree.json")


def load_degree_ids(degree_path):
    """Collect all explicit course IDs from the degree JSON."""
    with open(degree_path, "r", encoding="utf-8") as f:
        degree = json.load(f)

    degree_ids = set()
    for bank in degree["course_banks"]:
        cl = bank.get("course_list", [])
        if isinstance(cl, list):
            degree_ids.update(cl)
        for chain in bank.get("chains", []):
            degree_ids.update(chain)
        for g in bank.get("groups_list", []):
            degree_ids.update(g.get("course_list", []))
            for m in (g.get("mandatory") or []):
                degree_ids.update(m)
    return degree, degree_ids


def classify_wildcard(cid, degree_ids):
    """Classify a course ID into a wildcard bank, or None if truly unmatched."""
    if cid.startswith("394"):
        return "Sport"
    if cid.startswith("324"):
        return "Malag"
    if cid.startswith("325") or cid.startswith("045"):
        return "Free Elective / List B"
    if cid.startswith("114") and cid not in degree_ids:
        return "Enrichment / Free Elective"
    return None


def test_single_pdf(pdf_path, degree_ids):
    """Parse a single PDF and return a result dict."""
    result = {
        "file": pdf_path.name,
        "success": False,
        "error": None,
        "student_name": "",
        "degree": "",
        "faculty": "",
        "total_courses": 0,
        "unique_courses": 0,
        "duplicates": 0,
        "credits_accumulated": 0.0,
        "credits_required": 0.0,
        "gpa": 0.0,
        "matched_explicit": 0,
        "matched_wildcard": 0,
        "truly_unmatched": 0,
        "unmatched_list": [],
        "empty_names": 0,
        "grade_types": {},
        "semesters": [],
        "warnings": [],
    }

    try:
        data = parse_transcript_pdf(str(pdf_path))
        result["success"] = True
        result["student_name"] = data.student_name
        result["degree"] = data.degree
        result["faculty"] = data.faculty
        result["total_courses"] = len(data.courses)
        result["unique_courses"] = len(data.get_passed_course_ids())
        result["duplicates"] = len(data.courses) - len(data.get_passed_course_ids())
        result["credits_accumulated"] = data.accumulated_credits
        result["credits_required"] = data.required_credits
        result["gpa"] = data.gpa

        grade_types = {}
        for c in data.courses:
            gt = "Numeric" if c.grade.isdigit() else c.grade
            grade_types[gt] = grade_types.get(gt, 0) + 1
        result["grade_types"] = grade_types

        result["semesters"] = sorted(set(c.semester for c in data.courses))

        empty_name_courses = [c for c in data.courses if not c.name.strip()]
        result["empty_names"] = len(empty_name_courses)

        if not data.student_name:
            result["warnings"].append("MISSING student name")
        if not data.degree:
            result["warnings"].append("MISSING degree")
        if not data.faculty:
            result["warnings"].append("MISSING faculty")
        if data.accumulated_credits == 0.0:
            result["warnings"].append("Credits accumulated = 0 (missing header?)")
        if empty_name_courses:
            result["warnings"].append(f"{len(empty_name_courses)} courses with empty names")

        student_ids = data.get_passed_course_ids()
        matched_explicit = student_ids & degree_ids
        unmatched = student_ids - degree_ids
        matched_wildcard = []
        truly_unmatched = []

        for cid in sorted(unmatched):
            wc = classify_wildcard(cid, degree_ids)
            if wc:
                matched_wildcard.append((cid, wc))
            else:
                truly_unmatched.append(cid)

        result["matched_explicit"] = len(matched_explicit)
        result["matched_wildcard"] = len(matched_wildcard)
        result["truly_unmatched"] = len(truly_unmatched)
        result["unmatched_list"] = truly_unmatched

        course_credits_sum = sum(
            c.credits for c in data.courses if c.credits is not None and c.grade != "Exemption without points"
        )
        if abs(course_credits_sum - data.accumulated_credits) > 1.0:
            diff = course_credits_sum - data.accumulated_credits
            result["warnings"].append(
                f"Credit mismatch: sum={course_credits_sum:.1f} "
                f"vs reported={data.accumulated_credits} (diff={diff:+.1f})"
            )

        result["_data"] = data
        result["_matched_wildcard"] = matched_wildcard

    except Exception as e:
        result["error"] = str(e)
        result["warnings"].append(f"PARSE ERROR: {e}")
        result["_traceback"] = traceback.format_exc()

    return result


def print_result(r):
    """Print detailed results for a single PDF."""
    print(f"\n{'=' * 100}")
    print(f"FILE: {r['file']}")
    print(f"{'=' * 100}")

    if not r["success"]:
        print("  *** PARSE ERROR ***")
        print(f"  {r.get('_traceback', r['error'])}")
        return

    data = r.get("_data")
    print(f"  Student : {r['student_name']}  (ID: {data.student_id if data else '?'})")
    print(f"  Degree  : {r['degree']}")
    print(f"  Faculty : {r['faculty']}")
    print(f"  Credits : {r['credits_accumulated']} / {r['credits_required']}")
    print(f"  GPA     : {r['gpa']}")
    print(f"  Courses : {r['total_courses']} total, {r['unique_courses']} unique")
    print(f"  Grade types: {r['grade_types']}")
    print(f"  Semesters ({len(r['semesters'])}): {', '.join(r['semesters'])}")

    if r["empty_names"] > 0 and data:
        for c in data.courses:
            if not c.name.strip():
                print(
                    f"    WARNING: Empty name for {c.course_id} (raw: {c.raw_pdf_id}) "
                    f"grade={c.grade} credits={c.credits} sem={c.semester}"
                )

    print("\n  --- Degree Matching ---")
    print(f"  Matched (explicit bank lists): {r['matched_explicit']}")
    print(f"  Matched (wildcard banks):      {r['matched_wildcard']}")
    for cid, wc in r.get("_matched_wildcard", []):
        if data:
            c = [x for x in data.courses if x.course_id == cid][0]
            print(f"    {cid}: {c.name} -> {wc}")
    print(f"  Truly unmatched:               {r['truly_unmatched']}")
    for cid in r["unmatched_list"]:
        if data:
            c = [x for x in data.courses if x.course_id == cid][0]
            print(f"    *** {cid}: {c.name} ({c.credits} pts, grade={c.grade})")

    if r["duplicates"] > 0 and data:
        id_counts = Counter(c.course_id for c in data.courses)
        dups = {k: v for k, v in id_counts.items() if v > 1}
        print("\n  --- Duplicates ---")
        for cid, count in dups.items():
            instances = [c for c in data.courses if c.course_id == cid]
            sems = [c.semester for c in instances]
            print(f"    {cid}: taken {count}x in {sems}")

    if r["warnings"]:
        print("\n  --- WARNINGS ---")
        for w in r["warnings"]:
            print(f"    WARNING: {w}")

    if data:
        course_credits_sum = sum(
            c.credits for c in data.courses if c.credits is not None and c.grade != "Exemption without points"
        )
        print(f"\n  Credit sum from courses: {course_credits_sum:.1f}")
        print(f"  Reported accumulated:    {r['credits_accumulated']}")


def main():
    _degree, degree_ids = load_degree_ids(DEGREE_PATH)

    pdf_files = sorted(GRADES_DIR.glob("*.pdf"))
    print(f"Found {len(pdf_files)} PDF files in {GRADES_DIR}\n")
    print("=" * 100)

    all_results = []
    for pdf_path in pdf_files:
        r = test_single_pdf(pdf_path, degree_ids)
        print_result(r)
        all_results.append(r)

    print(f"\n\n{'=' * 100}")
    print("SUMMARY")
    print(f"{'=' * 100}")
    header = (
        f"{'File':<40} {'OK':>3} {'Courses':>8} {'Unique':>7} {'Dups':>5} "
        f"{'Explicit':>9} {'Wildcard':>9} {'Unmatched':>10} {'Empty':>6} {'Warnings':>9}"
    )
    print(header)
    print("-" * len(header))
    for r in all_results:
        ok = "YES" if r["success"] else "NO"
        print(
            f"{r['file']:<40} {ok:>3} {r['total_courses']:>8} {r['unique_courses']:>7} "
            f"{r['duplicates']:>5} {r['matched_explicit']:>9} {r['matched_wildcard']:>9} "
            f"{r['truly_unmatched']:>10} {r['empty_names']:>6} {len(r['warnings']):>9}"
        )

    print(f"\n{'=' * 100}")
    print("CONCLUSIONS")
    print(f"{'=' * 100}")

    total_files = len(all_results)
    successful = sum(1 for r in all_results if r["success"])
    failed = total_files - successful
    total_warnings = sum(len(r["warnings"]) for r in all_results)
    total_unmatched = sum(r["truly_unmatched"] for r in all_results)
    total_empty_names = sum(r["empty_names"] for r in all_results)

    print(f"  Total PDFs tested:     {total_files}")
    print(f"  Successful parses:     {successful}")
    print(f"  Failed parses:         {failed}")
    print(f"  Total warnings:        {total_warnings}")
    print(f"  Total truly unmatched: {total_unmatched}")
    print(f"  Total empty names:     {total_empty_names}")

    if failed > 0:
        print("\n  FAILED FILES:")
        for r in all_results:
            if not r["success"]:
                print(f"    - {r['file']}: {r['error']}")

    if total_unmatched > 0:
        print("\n  ALL TRULY UNMATCHED COURSES (not in any bank):")
        for r in all_results:
            for cid in r["unmatched_list"]:
                print(f"    - {r['file']}: {cid}")

    if total_empty_names > 0:
        print(f"\n  NOTE: {total_empty_names} courses across all PDFs had empty names")
        print("         (multi-line name parsing may need improvement)")


if __name__ == "__main__":
    main()
