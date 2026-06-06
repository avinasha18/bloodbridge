"""Geo-aware native-language headline for donor engagement messages.

Uses city name first, then lat/lon bounding boxes for Indian regions.
The headline is ONE line in the local language; the rest of the message stays English.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class LocaleTouch:
    lang_code: str
    lang_label: str
    region_name: str
    headline: str


# City → language code (lowercase keys)
_CITY_LANG: dict[str, str] = {
    # Telugu
    "hyderabad": "te",
    "secunderabad": "te",
    "warangal": "te",
    "vijayawada": "te",
    "visakhapatnam": "te",
    "vizag": "te",
    "guntur": "te",
    "nellore": "te",
    "tirupati": "te",
    # Tamil
    "chennai": "ta",
    "coimbatore": "ta",
    "madurai": "ta",
    "trichy": "ta",
    "salem": "ta",
    "tiruchirappalli": "ta",
    # Kannada
    "bengaluru": "kn",
    "bangalore": "kn",
    "mysuru": "kn",
    "mysore": "kn",
    "hubli": "kn",
    "mangalore": "kn",
    # Marathi
    "mumbai": "mr",
    "pune": "mr",
    "nagpur": "mr",
    "nashik": "mr",
    # Hindi / North
    "delhi": "hi",
    "new delhi": "hi",
    "noida": "hi",
    "gurgaon": "hi",
    "gurugram": "hi",
    "lucknow": "hi",
    "jaipur": "hi",
    "bhopal": "hi",
    "indore": "hi",
    "patna": "hi",
    # Malayalam
    "kochi": "ml",
    "cochin": "ml",
    "trivandrum": "ml",
    "thiruvananthapuram": "ml",
    # Bengali
    "kolkata": "bn",
    "howrah": "bn",
}

_LABELS = {
    "te": "Telugu",
    "ta": "Tamil",
    "kn": "Kannada",
    "mr": "Marathi",
    "hi": "Hindi",
    "ml": "Malayalam",
    "bn": "Bengali",
    "en": "English",
}

# One-line headlines — warm, local, blood-donation themed
_HEADLINES = {
    "te": "🩸 రక్తదానం — మీ సహాయం ప్రాణాలు కాపాడుతుంది",
    "ta": "🩸 இரத்த தானம் — உங்கள் உதவி உயிர்களை காப்பாற்றும்",
    "kn": "🩸 ರಕ್ತದಾನ — ನಿಮ್ಮ ಸಹಾಯ ಜೀವಗಳನ್ನು ರಕ್ಷಿಸುತ್ತದೆ",
    "mr": "🩸 रक्तदान — तुमची मदत जीव वाचवते",
    "hi": "🩸 रक्तदान — आपकी मदद जीवन बचाती है",
    "ml": "🩸 രക്തദാനം — നിങ്ങളുടെ സഹായം ജീവൻ രക്ഷിക്കും",
    "bn": "🩸 রক্তদান — আপনার সাহায্য প্রাণ বাঁচায়",
    "en": "🩸 Blood donation — your help saves lives",
}

_REGION_NAMES = {
    "te": "Telangana / Andhra",
    "ta": "Tamil Nadu",
    "kn": "Karnataka",
    "mr": "Maharashtra",
    "hi": "North India",
    "ml": "Kerala",
    "bn": "West Bengal",
    "en": "India",
}


def _lang_from_coords(lat: Optional[float], lon: Optional[float]) -> Optional[str]:
    if lat is None or lon is None:
        return None
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        return None

    # Telangana / Andhra Pradesh
    if 15.5 <= lat <= 19.8 and 76.5 <= lon <= 81.8:
        return "te"
    # Tamil Nadu
    if 8.0 <= lat <= 13.6 and 76.0 <= lon <= 80.5:
        return "ta"
    # Karnataka (avoid overlap with TN/AP at borders — coarse boxes OK for demo)
    if 11.5 <= lat <= 18.5 and 74.0 <= lon <= 78.8:
        return "kn"
    # Maharashtra
    if 15.5 <= lat <= 22.5 and 72.5 <= lon <= 80.5:
        return "mr"
    # Kerala
    if 8.0 <= lat <= 12.8 and 74.8 <= lon <= 77.5:
        return "ml"
    # West Bengal
    if 21.5 <= lat <= 27.2 and 85.8 <= lon <= 89.9:
        return "bn"
    # North / Hindi belt (rough)
    if 23.0 <= lat <= 31.5 and 74.0 <= lon <= 88.0:
        return "hi"
    return None


def locale_touch_for_donor(
    *,
    city: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    language_preference: Optional[str] = None,
) -> LocaleTouch:
    """Pick a native headline from city or coordinates."""
    lang = None
    region = "India"

    if city:
        key = city.strip().lower()
        lang = _CITY_LANG.get(key)
        if lang:
            region = city.strip().title()

    if not lang:
        lang = _lang_from_coords(latitude, longitude)
        if lang:
            region = _REGION_NAMES.get(lang, "India")

    if not lang and language_preference and language_preference in _HEADLINES:
        lang = language_preference

    if not lang:
        lang = "en"

    return LocaleTouch(
        lang_code=lang,
        lang_label=_LABELS.get(lang, "English"),
        region_name=region if region != "India" else _REGION_NAMES.get(lang, "India"),
        headline=_HEADLINES.get(lang, _HEADLINES["en"]),
    )


def compose_engagement_message(headline: str, body: str) -> str:
    """Native headline on line 1, English body below."""
    headline = (headline or "").strip()
    body = (body or "").strip()
    if not headline:
        return body
    if not body:
        return headline
    return f"{headline}\n\n{body}"
