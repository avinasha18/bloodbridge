"""Resolve a navigable donation location when a request has no map pin.

Priority:
  1. Blood request's own hospital_lat / hospital_lon
  2. Nearest hospital from recent requests in DB (with coordinates)
  3. Nearest verified blood collection center for the donor's city
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from sqlalchemy.orm import Session

from app.db.models import BloodRequest, Donor
from app.services.geo import haversine_km

# Major Hyderabad blood banks / hospitals used by Blood Warriors volunteers.
COLLECTION_CENTERS: List[dict] = [
    {
        "name": "Indian Red Cross Blood Bank, Hyderabad",
        "lat": 17.4065,
        "lon": 78.4772,
        "city": "Hyderabad",
    },
    {
        "name": "NIMS Blood Bank (NTR Blood Bank)",
        "lat": 17.4219,
        "lon": 78.4089,
        "city": "Hyderabad",
    },
    {
        "name": "Gandhi Hospital Blood Bank",
        "lat": 17.4254,
        "lon": 78.5072,
        "city": "Hyderabad",
    },
    {
        "name": "Osmania General Hospital Blood Bank",
        "lat": 17.3725,
        "lon": 78.4788,
        "city": "Hyderabad",
    },
    {
        "name": "Apollo Hospitals Jubilee Hills",
        "lat": 17.4126,
        "lon": 78.4071,
        "city": "Hyderabad",
    },
    {
        "name": "Yashoda Hospitals, Secunderabad",
        "lat": 17.4399,
        "lon": 78.4983,
        "city": "Hyderabad",
    },
    {
        "name": "KIMS Hospital Blood Bank, Secunderabad",
        "lat": 17.4394,
        "lon": 78.4981,
        "city": "Secunderabad",
    },
]

# Default when donor has no location at all (Hyderabad — Blood Warriors base).
DEFAULT_CENTER = COLLECTION_CENTERS[0]


@dataclass
class DonationSite:
    display_name: str
    lat: float
    lon: float
    source: str  # request | db_hospital | collection_center
    patient_hospital: Optional[str] = None

    @property
    def maps_url(self) -> str:
        return f"https://www.google.com/maps/search/?api=1&query={self.lat},{self.lon}"

    @property
    def used_fallback(self) -> bool:
        return self.source != "request"


def _donor_coords(donor: Donor) -> tuple[Optional[float], Optional[float]]:
    lat = float(donor.latitude) if donor.latitude is not None else None
    lon = float(donor.longitude) if donor.longitude is not None else None
    return lat, lon


def _nearest_from_list(
    items: List[dict],
    *,
    lat: Optional[float],
    lon: Optional[float],
    city: Optional[str] = None,
) -> dict:
    if not items:
        return DEFAULT_CENTER

    pool = items
    if city:
        city_l = city.strip().lower()
        city_matches = [
            c for c in items if (c.get("city") or "").strip().lower() == city_l
        ]
        if city_matches:
            pool = city_matches

    if lat is not None and lon is not None:
        best = min(pool, key=lambda c: haversine_km(lat, lon, c["lat"], c["lon"]))
        return best

    return pool[0]


def _nearest_db_hospital(db: Session, donor: Donor) -> Optional[DonationSite]:
    """Pick a real hospital from recent requests that already have coordinates."""
    rows = (
        db.query(BloodRequest)
        .filter(
            BloodRequest.hospital_lat.isnot(None),
            BloodRequest.hospital_lon.isnot(None),
        )
        .order_by(BloodRequest.created_at.desc())
        .limit(300)
        .all()
    )
    if not rows:
        return None

    d_lat, d_lon = _donor_coords(donor)
    best: Optional[BloodRequest] = None
    best_dist = float("inf")

    for row in rows:
        dist = haversine_km(
            d_lat, d_lon, float(row.hospital_lat), float(row.hospital_lon)
        )
        if dist < best_dist:
            best_dist = dist
            best = row

    if not best:
        return None

    return DonationSite(
        display_name=best.hospital_name or "Nearby hospital",
        lat=float(best.hospital_lat),
        lon=float(best.hospital_lon),
        source="db_hospital",
    )


def resolve_donation_site(
    db: Session,
    donor: Donor,
    req: BloodRequest,
) -> DonationSite:
    """Always return a navigable donation location — never block on missing request coords."""
    patient_name = (req.hospital_name or "").strip() or None

    if req.hospital_lat is not None and req.hospital_lon is not None:
        return DonationSite(
            display_name=patient_name or "Hospital",
            lat=float(req.hospital_lat),
            lon=float(req.hospital_lon),
            source="request",
            patient_hospital=patient_name,
        )

    d_lat, d_lon = _donor_coords(donor)
    city = (donor.city or "Hyderabad").strip()

    db_site = _nearest_db_hospital(db, donor)
    if db_site:
        if patient_name and patient_name.lower() not in db_site.display_name.lower():
            db_site.patient_hospital = patient_name
        return db_site

    center = _nearest_from_list(
        COLLECTION_CENTERS, lat=d_lat, lon=d_lon, city=city
    )
    display = center["name"]
    if patient_name:
        display = f"{center['name']} (for need at {patient_name})"

    return DonationSite(
        display_name=display,
        lat=float(center["lat"]),
        lon=float(center["lon"]),
        source="collection_center",
        patient_hospital=patient_name,
    )
