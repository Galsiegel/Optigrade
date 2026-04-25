from optigrade.domain.bucket import (
    normalize_bucket_id,
    parse_specialty_bucket_id,
    validate_bucket_id,
)


def test_validate_bucket_id_accepts_known_buckets() -> None:
    validate_bucket_id("mandatory")
    validate_bucket_id("specialty:specialty_3")


def test_validate_bucket_id_rejects_unknown() -> None:
    try:
        validate_bucket_id("free_choice")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for invalid bucket")


def test_normalize_bucket_id_maps_free_choice_to_enrichment() -> None:
    assert normalize_bucket_id("free_choice") == "enrichment"


def test_parse_specialty_bucket_id() -> None:
    assert parse_specialty_bucket_id("specialty:ai") == "ai"
