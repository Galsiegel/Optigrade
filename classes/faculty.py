"""
A faculty will be the ancestor class / struct.

It mainly needs to keep the data of optional degrees inside it.
Also, sometimes we have the full lists of courses that belong to Faculty 
and not per degree.
And also, may be relevant later for Admin permissions for adding / removing courses.
An admin will usually have control on Faculty.
Super admin (me) has control on everything.
"""

from dataclasses import dataclass, field
from typing import Optional, Set, List


@dataclass(frozen=True)
class Faculty:
    """
    Represents a faculty (e.g., Engineering, Science).
    
    Attributes:
        name: Name of the faculty
        degrees: List of degrees available in this faculty
        faculty_courses: Set of course IDs that belong to the faculty 
                         (not specific to any degree)
    """
    name: str
    
    faculty_courses: Optional[Set[str]] = None
    faculty_archived_courses: Optional[Set[str]] = None


    


