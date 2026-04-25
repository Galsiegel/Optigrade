"""
Student profile class definition.

A StudentProfile is built from a scanned transcript PDF. It holds every course
the student completed together with credits, grade, and semester -- everything
the optimizer needs.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
import string
from typing import Dict, List, Optional, Set


# ---------------------------------------------------------------------------
# Per-course record (what the PDF gives us for each row)
# ---------------------------------------------------------------------------

@dataclass
class StudentCourse:
    """One course from the student transcript."""
    course_id: str                  # Standard Technion ID (e.g. "044101")
    credits: Optional[float]        # Credit points (None for exemptions w/o points), this may override the master course (if it changed) but should be flagged somewhere
    grade: str                      # Numeric string, "Pass", "Exemption with points",
                                    #   or "Exemption without points"
    semester: str                   # e.g. "2022-2023 Spring"

    # --- Convenience helpers ------------------------------------------------

    @property
    def is_numeric_grade(self) -> bool:
        return self.grade.isdigit()

    @property
    def numeric_grade(self) -> Optional[int]:
        return int(self.grade) if self.is_numeric_grade else None

    @property
    def is_pass(self) -> bool:
        return self.grade == "Pass"

    @property
    def is_exemption(self) -> bool:
        return "Exemption" in self.grade

    @property
    def effective_credits(self) -> float:
        """Credits that count toward the degree. 0 for exemptions w/o points."""
        if self.grade == "Exemption without points":
            return 0.0
        return self.credits if self.credits is not None else 0.0

    def to_dict(self) -> dict:
        return {
            "course_id": self.course_id,
            # "name": self.name, this will be an attribute elswhere
            "credits": self.credits,
            "grade": self.grade,
            "semester": self.semester,
        }

    @classmethod
    def from_dict(cls, d: dict) -> StudentCourse:
        return cls(
            course_id=d["course_id"],
            name=d.get("name", ""),
            credits=d.get("credits"),
            grade=d.get("grade", ""),
            semester=d.get("semester", ""),
        )


# ---------------------------------------------------------------------------
# Student profile
# ---------------------------------------------------------------------------

@dataclass
class StudentProfile:
    """
    Represents a student full academic profile, built from a transcript PDF.

    Primary constructor: StudentProfile.from_transcript_pdf(path)
    """
    student_name: str = ""
    student_id: str = "" # Save this encrypted? maybe not at all
    degree_name: str = "" # this is critical for the degree rules
    faculty_name: str = ""
    accumulated_credits: float = 0.0
    required_credits: float = 0.0
    gpa: float = 0.0
    courses: List[StudentCourse] = field(default_factory=list)

    # --- Convenience properties for the optimizer ---------------------------

    @property
    def passed_course_ids(self) -> Set[str]:
        """Set of all course IDs the student completed (any grade type)."""
        return {c.course_id for c in self.courses}

    # Currently we are allowing duplicate courses , mainly for sports courses done more than once,
    # Because we are adding the extre semester field which is usually redundant,
    # test performance difference later. may need a better solution.
    @property
    def course_credits(self) -> Dict[tuple, float]:
        """Map (course_id, semester) -> effective credits for the optimizer.

        Courses taken more than once (e.g. sports) appear as separate
        entries, keyed by (course_id, semester).
        """
        return {
            (c.course_id, c.semester): c.effective_credits for c in self.courses
        }

    def get_course(self, course_id: str) -> Optional[StudentCourse]:
        """Look up a specific course by ID. Returns None if not found."""
        for c in self.courses:
            if c.course_id == course_id:
                return c
        return None

    # --- Serialization ------------------------------------------------------

    def to_dict(self) -> dict:
        return {
            "student_name": self.student_name,
            "student_id": self.student_id,
            "degree_name": self.degree_name,
            "faculty_name": self.faculty_name,
            "accumulated_credits": self.accumulated_credits,
            "required_credits": self.required_credits,
            "gpa": self.gpa,
            "courses": [c.to_dict() for c in self.courses],
        }

    def save_json(self, path: str) -> None:
        """Write the profile to a JSON file."""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=2, ensure_ascii=False)

    @classmethod
    def from_dict(cls, d: dict) -> StudentProfile:
        return cls(
            student_name=d.get("student_name", ""),
            student_id=d.get("student_id", ""),
            degree_name=d.get("degree_name", ""),
            faculty_name=d.get("faculty_name", ""),
            accumulated_credits=d.get("accumulated_credits", 0.0),
            required_credits=d.get("required_credits", 0.0),
            gpa=d.get("gpa", 0.0),
            courses=[StudentCourse.from_dict(c) for c in d.get("courses", [])],
        )


    @classmethod
    def load_json(cls, path: str) -> StudentProfile:
        """Load a profile from a JSON file."""
        with open(path, encoding="utf-8") as f:
            return cls.from_dict(json.load(f))

    # --- Build from PDF (the main entry point) ------------------------------

    @classmethod
    def from_transcript_pdf(cls, pdf_path: str) -> StudentProfile:
        """
        Parse a Technion transcript PDF and build a StudentProfile.

        This is the primary way students input their data.
        """
        # Import here to avoid circular / heavy import at module level
        from tools.parse_transcript import parse_transcript_pdf

        data = parse_transcript_pdf(pdf_path)

        courses = [
            StudentCourse(
                course_id=cr.course_id,
                name=cr.name,
                credits=cr.credits,
                grade=cr.grade,
                semester=cr.semester,
            )
            for cr in data.courses
        ]

        return cls(
            student_name=data.student_name,
            student_id=data.student_id,
            degree_name=data.degree,
            faculty_name=data.faculty,
            accumulated_credits=data.accumulated_credits,
            required_credits=data.required_credits,
            gpa=data.gpa,
            courses=courses,
        )
