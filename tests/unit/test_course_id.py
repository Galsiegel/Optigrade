from optigrade.domain.course import validate_course_id


def test_course_id_preserves_leading_zero() -> None:
    assert validate_course_id("044101") == "044101"


def test_course_id_rejects_int() -> None:
    try:
        validate_course_id(44101)  # type: ignore[arg-type]
    except TypeError:
        pass
    else:
        raise AssertionError("Expected TypeError for int course id")


def test_course_id_rejects_empty_string() -> None:
    try:
        validate_course_id("   ")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for empty course id")
