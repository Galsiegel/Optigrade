"""
Course class definition.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class Course:
    """Represents a course."""
    id: str
    name: Optional[str]
    credits: float
    is_lab: bool
