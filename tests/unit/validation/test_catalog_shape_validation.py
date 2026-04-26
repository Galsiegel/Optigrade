from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
CATALOG_PATH = (
    ROOT
    / "data"
    / "carriculom"
    / "computer and software"
    / "B.Sc in Computer and Software Engineering_2022_2023 (2).json"
)


def test_catalog_has_core_required_sections() -> None:
    with CATALOG_PATH.open(encoding="utf-8") as fh:
        catalog = json.load(fh)

    assert "programName" in catalog
    assert "generalRules" in catalog
    assert "mandatory" in catalog
    assert isinstance(catalog["mandatory"], list)


def test_catalog_mandatory_course_codes_are_non_empty_strings() -> None:
    with CATALOG_PATH.open(encoding="utf-8") as fh:
        catalog = json.load(fh)

    mandatory = catalog["mandatory"]
    assert mandatory, "Mandatory section should not be empty in real fixture"
    for row in mandatory:
        assert isinstance(row["code"], str)
        assert row["code"].strip()


def test_catalog_general_rules_have_numeric_credit_targets() -> None:
    with CATALOG_PATH.open(encoding="utf-8") as fh:
        catalog = json.load(fh)

    rules = catalog["generalRules"]
    assert isinstance(rules["totalCredits"], (int, float))
    assert isinstance(rules["mandatoryCredits"], (int, float))
    assert isinstance(rules["mustChooseCoreGroups"], int)
