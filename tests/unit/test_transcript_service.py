import json

from optigrade.domain.student import CourseInstanceStatus
from optigrade.services.transcript_service import CsvTranscriptParser, JsonTranscriptParser


def test_json_transcript_parser_parses_courses_and_warnings() -> None:
    parser = JsonTranscriptParser()
    payload = {
        "student_name": "Jane Student",
        "student_id_number": "12345",
        "warnings": ["source warning"],
        "courses": [
            {"course_id": "046195", "name": "Algorithms", "term": "2024_winter", "credits": 3.0},
            {"course_id": "", "name": "skip me"},
        ],
    }
    parsed = parser.parse(json.dumps(payload).encode("utf-8"))
    assert parsed.student_name == "Jane Student"
    assert parsed.student_id_number == "12345"
    assert len(parsed.courses) == 1
    assert parsed.courses[0].course_id == "046195"
    assert parsed.warnings == ["source warning", "Course entry 2 skipped: missing course_id"]


def test_csv_transcript_parser_parses_status_values() -> None:
    parser = CsvTranscriptParser()
    raw = "\n".join(
        [
            "course_id,name,term,credits,grade,status",
            "046195,Algorithms,2024_winter,3.0,95,recognized_passed",
            "046200,Unknown,2024_spring,2.0,,bad-status",
        ]
    )
    parsed = parser.parse(raw.encode("utf-8"))
    assert len(parsed.courses) == 2
    assert parsed.courses[0].parser_status == CourseInstanceStatus.RECOGNIZED_PASSED
    assert parsed.courses[1].parser_status == CourseInstanceStatus.UNKNOWN_UNRESOLVED
