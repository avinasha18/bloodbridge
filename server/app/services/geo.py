"""Geographic helpers (haversine, etc.)."""

import math
from typing import Optional


def haversine_km(
    lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]
) -> float:
    """Great-circle distance in km. Returns +inf for missing coordinates."""
    if None in (lat1, lon1, lat2, lon2):
        return float("inf")

    r = 6371.0
    p1 = math.radians(float(lat1))
    p2 = math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lon2) - float(lon1))

    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c
