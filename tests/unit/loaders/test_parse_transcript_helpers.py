from __future__ import annotations

from student_loader.parse_transcript import (
    _is_course_id_line,
    _is_metadata,
    _parse_course_line,
    _parse_header,
    convert_pdf_course_id,
)


def test_convert_pdf_course_id_keeps_leading_zero_faculty_as_six_digits() -> None:
    assert convert_pdf_course_id("00440101") == "044101"


def test_convert_pdf_course_id_non_zero_faculty_as_seven_digits() -> None:
    assert convert_pdf_course_id("11040013") == "1040013"


def test_convert_pdf_course_id_invalid_value_returns_input() -> None:
    assert convert_pdf_course_id("ABC") == "ABC"


def test_parse_course_line_numeric_single_line() -> None:
    parsed = _parse_course_line("00440101 Intro To CS 3.0 95 2022-2023 Winter")
    assert parsed is not None
    assert parsed["raw_id"] == "00440101"
    assert parsed["name"] == "Intro To CS"
    assert parsed["credits"] == 3.0
    assert parsed["grade"] == "95"
    assert parsed["semester"] == "2022-2023 Winter"


def test_parse_course_line_pass_without_name_and_credits() -> None:
    parsed = _parse_course_line("00394800 Pass 2023-2024 Spring")
    assert parsed is not None
    assert parsed["raw_id"] == "00394800"
    assert parsed["name"] == ""
    assert parsed["credits"] is None
    assert parsed["grade"] == "Pass"


def test_parse_course_line_exemption_without_points() -> None:
    parsed = _parse_course_line(
        "00324123 Human Values Exemption without points 2022-2023 Summer"
    )
    assert parsed is not None
    assert parsed["grade"] == "Exemption without points"
    assert parsed["credits"] is None


def test_parse_header_extracts_student_and_credit_fields() -> None:
    lines = [
        "Transcript of Jane Doe ID: 123456789",
        "for the degree Computer and Software Engineering",
        "in the faculty of Electrical and Computer Engineering",
        "and accumulated 120.5 credit points out of 159.5 credit points with GPA of 87.5",
    ]
    parsed = _parse_header(lines)
    assert parsed["student_name"] == "Jane Doe"
    assert parsed["student_id"] == "123456789"
    assert parsed["degree"] == "Computer and Software Engineering"
    assert parsed["faculty"] == "Electrical and Computer Engineering"
    assert parsed["accumulated_credits"] == 120.5
    assert parsed["required_credits"] == 159.5
    assert parsed["gpa"] == 87.5


def test_metadata_and_course_id_line_detection() -> None:
    assert _is_metadata("Transcript of Someone ID: 123") is True
    assert _is_metadata("   ") is True
    assert _is_course_id_line("00440101 Intro 3.0 90 2022-2023 Winter") is True
    assert _is_course_id_line("Intro line only") is False
