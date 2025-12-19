"""
Degree registry - factory functions to create degrees with their buckets.
"""

from typing import Dict, Callable
from .degree import Degree
from .faculty import Faculty
from .programs import Program_bucket, BucketType


# Registry of degree creation functions
DEGREE_REGISTRY: Dict[str, Callable[[], Degree]] = {}


def register_degree(degree_id: str):
    """Decorator to register a degree creation function."""
    def decorator(func):
        DEGREE_REGISTRY[degree_id] = func
        return func
    return decorator


def get_degree(degree_id: str) -> Degree:
    """
    Get a degree by its ID.
    
    Args:
        degree_id: The degree identifier
        
    Returns:
        Degree object
        
    Raises:
        KeyError: If degree_id is not found
    """
    if degree_id not in DEGREE_REGISTRY:
        available = ", ".join(sorted(DEGREE_REGISTRY.keys()))
        raise KeyError(
            f"Degree '{degree_id}' not found. Available degrees: {available}"
        )
    return DEGREE_REGISTRY[degree_id]()


# Example degree creation functions
# TODO: Replace these with actual degree definitions based on your data

@register_degree("ELECTRICAL_ENGINEERING")
def create_electrical_engineering() -> Degree:
    """Create Electrical Engineering degree."""
    faculty = Faculty(name="Engineering")
    
    must_bucket = Program_bucket(
        type_of_bucket=BucketType.MANDATORY,
        id="MUST_EE",
        name="Mandatory Requirements",
        allowed_course_ids={"046195", "044198"},
        min_courses_count=2
    )
    
    return Degree(
        name="Electrical Engineering",
        id="ELECTRICAL_ENGINEERING",
        faculty=faculty,
        must=must_bucket
    )