"""
Program and bucket definitions for different degree programs.

Each program defines its own set of requirement buckets with course mappings.
The same course can appear in different buckets for different programs.
"""

from typing import Set, Optional, List, Union
from dataclasses import dataclass
from enum import Enum
import re


class BucketType(Enum):
    """Type of requirement bucket."""
    MANDATORY = "mandatory"
    CORE = "core"
    SPECIALTY = "specialty"
    MALAG = "malag"
    SPORTSANDFUN="sports and fun"
    FREECHOICE="faculty chice"


@dataclass
class Program_bucket:
    """
    Represents a requirement bucket (e.g., Core Requirements, Track Requirements).
    
    Attributes:
        type_of_bucket: Type of bucket - either mandatory, core, or specialty
        name: Name of the bucket
        allowed_course_ids: The courses that may be part of this bucket
        mandatory_knowledge_ids: These courses/expressions will have to be allocated in the 
                                final solution, but not necessarily in this bucket.
                                Can be:
                                - Set[str]: Simple course IDs (all must be taken)
                                - List[str]: List of expressions, each can be:
                                  * Simple course ID: "046005"
                                  * OR expression: "046005 or 046237" (at least one must be taken)
                                  * AND expression: "044198 and 044202" (all must be taken)
                                  * Complex: "044198 and (044202 or 046200)"
        id: Optional unique identifier for the bucket
        min_courses_count: Minimum number of courses required in this bucket
        min_points_count: Minimum number of credit points required in this bucket
    """
    type_of_bucket: BucketType
    name: str
    allowed_course_ids: Set[str]
    mandatory_knowledge_ids: Optional[Union[Set[str], List[str]]] = None
    id: Optional[str] = None
    min_courses_count: Optional[int] = None
    min_points_count: Optional[int] = None
    
    def __post_init__(self):
        """Initialize default values."""
        if self.mandatory_knowledge_ids is None:
            self.mandatory_knowledge_ids = []
        elif isinstance(self.mandatory_knowledge_ids, set):
            # Convert set to list for consistency
            self.mandatory_knowledge_ids = list(self.mandatory_knowledge_ids)
