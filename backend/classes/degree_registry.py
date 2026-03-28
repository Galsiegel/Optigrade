"""
Degree registry - factory functions to create degrees with their buckets.
A class that is used for super admin
"""



# Example degree creation functions
# TODO: Replace these with actual degree definitions based on data

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