"""Standard ABO/Rh blood groups used across matching, forms, and analytics."""

from __future__ import annotations

from typing import FrozenSet

STANDARD_BLOOD_GROUPS: tuple[str, ...] = (
    "O Positive",
    "O Negative",
    "A Positive",
    "A Negative",
    "B Positive",
    "B Negative",
    "AB Positive",
    "AB Negative",
)

STANDARD_BLOOD_GROUP_SET: FrozenSet[str] = frozenset(STANDARD_BLOOD_GROUPS)


def is_standard_blood_group(value: str | None) -> bool:
    if not value:
        return False
    return value.strip() in STANDARD_BLOOD_GROUP_SET
