"""
Student profile class definition.
"""

from dataclasses import dataclass, field
from typing import Set


@dataclass
class StudentProfile:
    """Represents a student's profile and academic history."""
    passed_course_ids: Set[str] = field(default_factory=set)
    waived_course_ids: Set[str] = field(default_factory=set) # These are courses the student got a pass for

