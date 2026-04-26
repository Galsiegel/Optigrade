from pathlib import Path

from optigrade.domain.student import CourseInstanceStatus
from optigrade.loaders.catalog_loader import load_catalog_from_path
from optigrade.loaders.student_loader import load_student_profile_from_path


FIXTURES_DIR = Path(__file__).resolve().parent.parent / "fixtures_dummy"


def test_all_tiny_catalog_fixtures_load() -> None:
    catalogs_dir = FIXTURES_DIR / "catalogs"
    for fixture_name in [
        "tiny_basic.json",
        "tiny_specialty.json",
        "tiny_sports_duplicates.json",
        "tiny_manual_tags.json",
        "tiny_infeasible.json",
    ]:
        catalog = load_catalog_from_path(
            catalogs_dir / fixture_name,
            degree_id=f"fixture_{fixture_name.replace('.json', '')}",
        )
        assert catalog.program_name
        assert catalog.total_credit_units >= 0


def test_tiny_specialty_fixture_shape() -> None:
    catalog = load_catalog_from_path(
        FIXTURES_DIR / "catalogs" / "tiny_specialty.json",
        degree_id="fixture_tiny_specialty",
    )
    assert catalog.required_specialty_count == 1
    specialty = catalog.specialties["specialty_ai"]
    assert specialty.minimum_total_courses == 2
    assert specialty.mandatory_courses == ("SPEC200",)
    assert specialty.choose_groups[0].courses == ("SPEC300", "SPEC301")


def test_sports_duplicate_fixture_keeps_both_instances() -> None:
    profile = load_student_profile_from_path(
        FIXTURES_DIR / "students" / "tiny_sports_duplicates_student.json"
    )
    assert len(profile.completed_courses) == 2
    assert all(
        course.status == CourseInstanceStatus.RECOGNIZED_PASSED
        for course in profile.completed_courses
    )


def test_non_sports_duplicate_fixture_marks_duplicates_ignored() -> None:
    profile = load_student_profile_from_path(
        FIXTURES_DIR / "students" / "tiny_non_sports_duplicates_student.json"
    )
    statuses = [course.status for course in profile.completed_courses]
    assert statuses[0] == CourseInstanceStatus.RECOGNIZED_FAILED
    assert statuses[1] == CourseInstanceStatus.RECOGNIZED_PASSED
    assert statuses[2] == CourseInstanceStatus.DUPLICATE_IGNORED
