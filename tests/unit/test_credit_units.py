from decimal import Decimal

from optigrade.domain.course import CreditValue


def test_credit_units_scaling_cases() -> None:
    assert CreditValue.from_credits(3).credit_units == 6
    assert CreditValue.from_credits(3.0).credit_units == 6
    assert CreditValue.from_credits(3.5).credit_units == 7
    assert CreditValue.from_credits(Decimal("159.5")).credit_units == 319


def test_credit_units_reject_quarter_values() -> None:
    try:
        CreditValue.from_credits("3.25")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for non .0/.5 credit increments")


def test_credit_units_reject_negative() -> None:
    try:
        CreditValue.from_credits("-0.5")
    except ValueError:
        pass
    else:
        raise AssertionError("Expected ValueError for negative credits")


def test_zero_credits_is_valid() -> None:
    credit_value = CreditValue.from_credits("0")
    assert credit_value.credits == Decimal("0")
    assert credit_value.credit_units == 0
