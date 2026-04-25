"""Requirement bucket identifiers and helpers."""

from __future__ import annotations

import re

VALID_BUCKET_IDS = {
    "mandatory",
    "core",
    "faculty_choice",
    "enrichment",
    "sports",
    "malag",
    "project",
    "lab",
    "extra_unused",
}

_SPECIALTY_PATTERN = re.compile(r"^specialty:([a-zA-Z0-9_-]+)$")


def normalize_bucket_id(raw_bucket_id: str) -> str:
    """Normalize aliases and validate bucket identifiers."""
    if not isinstance(raw_bucket_id, str):
        raise TypeError("bucket_id must be a string")

    normalized = raw_bucket_id.strip().lower()
    if normalized == "free_choice":
        normalized = "enrichment"

    validate_bucket_id(normalized)
    return normalized


def validate_bucket_id(bucket_id: str) -> None:
    """Raise on invalid bucket ids."""
    if bucket_id in VALID_BUCKET_IDS:
        return
    if _SPECIALTY_PATTERN.fullmatch(bucket_id):
        return
    raise ValueError(f"invalid bucket_id: {bucket_id}")


def parse_specialty_bucket_id(bucket_id: str) -> str:
    """Extract specialty id from specialty:<id> bucket ids."""
    match = _SPECIALTY_PATTERN.fullmatch(bucket_id)
    if not match:
        raise ValueError("bucket_id is not a specialty bucket")
    return match.group(1)

