"""Transcript parser protocol and mock parsers."""

from __future__ import annotations

import csv
import json
from io import StringIO
from typing import Any, Protocol

from optigrade.domain.transcript import ParsedTranscript, ParsedTranscriptCourse
from optigrade.domain.student import CourseInstanceStatus


class TranscriptParser(Protocol):
    def parse(self, file_bytes: bytes) -> ParsedTranscript:
        """Parse transcript payload into normalized domain model."""


class JsonTranscriptParser:
    """Temporary parser for JSON transcript payloads."""

    def parse(self, file_bytes: bytes) -> ParsedTranscript:
        payload = json.loads(file_bytes.decode("utf-8"))
        return _parsed_transcript_from_mapping(payload)


class CsvTranscriptParser:
    """Temporary parser for CSV transcript payloads."""

    def parse(self, file_bytes: bytes) -> ParsedTranscript:
        text = file_bytes.decode("utf-8")
        reader = csv.DictReader(StringIO(text))
        courses: list[ParsedTranscriptCourse] = []
        warnings: list[str] = []
        for index, row in enumerate(reader):
            course_id = str(row.get("course_id", "")).strip()
            if not course_id:
                warnings.append(f"Row {index + 1} skipped: missing course_id")
                continue
            courses.append(
                ParsedTranscriptCourse(
                    course_id=course_id,
                    name=_optional_text(row.get("name")),
                    term=_optional_text(row.get("term")),
                    credits=_optional_number(row.get("credits")),
                    grade=row.get("grade"),
                    parser_status=_status_from_value(row.get("status")),
                )
            )
        return ParsedTranscript(
            student_name=None,
            student_id_number=None,
            courses=courses,
            warnings=warnings,
        )


def _parsed_transcript_from_mapping(payload: dict[str, Any]) -> ParsedTranscript:
    raw_courses = payload.get("courses", [])
    courses: list[ParsedTranscriptCourse] = []
    warnings: list[str] = []
    for index, raw_course in enumerate(raw_courses):
        course_id = str(raw_course.get("course_id", "")).strip()
        if not course_id:
            warnings.append(f"Course entry {index + 1} skipped: missing course_id")
            continue
        courses.append(
            ParsedTranscriptCourse(
                course_id=course_id,
                name=_optional_text(raw_course.get("name")),
                term=_optional_text(raw_course.get("term")),
                credits=_optional_number(raw_course.get("credits")),
                grade=raw_course.get("grade"),
                parser_status=_status_from_value(raw_course.get("status")),
            )
        )
    return ParsedTranscript(
        student_name=_optional_text(payload.get("student_name")),
        student_id_number=_optional_text(payload.get("student_id_number")),
        courses=courses,
        warnings=[*payload.get("warnings", []), *warnings],
    )


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _optional_number(value: Any):
    if value is None or value == "":
        return None
    return value


def _status_from_value(value: Any) -> CourseInstanceStatus:
    text = str(value or "").strip()
    if not text:
        return CourseInstanceStatus.RECOGNIZED_PASSED
    try:
        return CourseInstanceStatus(text)
    except ValueError:
        return CourseInstanceStatus.UNKNOWN_UNRESOLVED
