"""Lightweight multilingual support for SMS + select API strings.

We avoid heavy NLP — donor/patient phones are geocoded only by lat/lon range
(or by hospital city keyword) to pick a preferred language. The user can also
override by setting Donor/Patient.language_preference.

Supported languages:
  - en  English (default)
  - te  Telugu  (Telangana / Andhra Pradesh)
  - hi  Hindi   (north India + national fallback)

Templates are intentionally short so they fit within SMS segments. Telugu
strings are romanized when feasible to remain GSM-7 compatible (otherwise SNS
falls back to UCS-2 which doubles the cost but still works).
"""

from __future__ import annotations

from typing import Optional, Tuple


# ─── Telugu region bounding boxes (loose) ────────────────────────────────
# Telangana + Andhra Pradesh roughly fall in lat 12.5–19.5, lon 76.5–84.5.
TELUGU_BBOX = (12.5, 19.5, 76.5, 84.5)
# Telugu city keywords (case-insensitive contains)
TELUGU_CITIES = {
    "hyderabad", "secunderabad", "warangal", "vijayawada", "visakhapatnam",
    "vizag", "tirupati", "guntur", "nellore", "kakinada", "rajahmundry",
    "karimnagar", "nizamabad", "khammam", "kurnool", "anantapur", "kadapa",
}

# Hindi region (broad): north India outside Telugu zone — anything north of
# lat 20 and west of long 86 that isn't elsewhere.
HINDI_BBOX = (20.0, 35.0, 68.0, 88.0)
HINDI_CITIES = {
    "delhi", "mumbai", "lucknow", "kanpur", "agra", "varanasi", "patna",
    "jaipur", "bhopal", "indore", "nagpur", "pune",
}


def detect_language(
    *,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
    explicit: Optional[str] = None,
) -> str:
    """Return a 2-letter language code based on best available signal."""
    if explicit and explicit in {"en", "te", "hi"}:
        return explicit

    city_l = (city or "").strip().lower()
    if city_l:
        for kw in TELUGU_CITIES:
            if kw in city_l:
                return "te"
        for kw in HINDI_CITIES:
            if kw in city_l:
                return "hi"

    if latitude is not None and longitude is not None:
        if (
            TELUGU_BBOX[0] <= float(latitude) <= TELUGU_BBOX[1]
            and TELUGU_BBOX[2] <= float(longitude) <= TELUGU_BBOX[3]
        ):
            return "te"
        if (
            HINDI_BBOX[0] <= float(latitude) <= HINDI_BBOX[1]
            and HINDI_BBOX[2] <= float(longitude) <= HINDI_BBOX[3]
        ):
            return "hi"

    return "en"


# ─── SMS templates ────────────────────────────────────────────────────────

# Each entry maps language → unicode template (we use real native script
# when SMS bodies fit; AWS SNS will switch the message type to UCS-2).
# Placeholders are str.format keys: {blood_group}, {hospital}, {link},
# {donor_name}, {donor_phone}, {urgency_word}, {units}.


def _u(word_word_en, word_te, word_hi) -> dict:
    return {"en": word_word_en, "te": word_te, "hi": word_hi}


URGENCY = {
    "critical": _u("URGENT", "అత్యవసరం", "अत्यावश्यक"),
    "urgent":   _u("Urgent", "అత్యవసరం", "अत्यंत आवश्यक"),
    "routine":  _u("Scheduled", "షెడ్యూల్", "नियमित"),
}


TEMPLATES = {
    # Donor-facing
    "outreach_request": {
        "en": "{urgency_word}: {blood_group} at {hospital}, {units} unit. Reply: {link} -Blood Warriors",
        "te": "{urgency_word}: {hospital} వద్ద {blood_group} అవసరం. స్పందించండి: {link} -Blood Warriors",
        "hi": "{urgency_word}: {hospital} पर {blood_group} रक्त चाहिए. उत्तर दें: {link} -Blood Warriors",
    },
    "assigned_confirmation": {
        "en": "Thank you. You are confirmed for this donation ({blood_group} at {hospital}). The coordinator will share details shortly. -Blood Warriors",
        "te": "ధన్యవాదాలు. మీరు దానం కోసం నిర్ధారించబడ్డారు ({hospital} వద్ద {blood_group}). కో-ఆర్డినేటర్ త్వరలో వివరాలు పంపుతారు. -Blood Warriors",
        "hi": "धन्यवाद. आप दान के लिए तय हुए हैं ({hospital} पर {blood_group}). समन्वयक जल्द ही जानकारी देंगे. -Blood Warriors",
    },
    "standby_notice": {
        "en": "Thank you. A donor is already assigned for this {blood_group} need. You are on STANDBY — we'll only call if needed. -Blood Warriors",
        "te": "ధన్యవాదాలు. ఈ {blood_group} అవసరానికి ఒక దాత ఇప్పటికే నియమించబడ్డారు. మీరు STANDBY లో ఉన్నారు. -Blood Warriors",
        "hi": "धन्यवाद. इस {blood_group} ज़रूरत के लिए दाता तय हो गया है. आप STANDBY पर हैं. -Blood Warriors",
    },
    # Patient-facing
    "patient_request_created": {
        "en": "Blood Warriors: Your {blood_group} request at {hospital} is being processed. Track: {link}",
        "te": "Blood Warriors: {hospital} లో మీ {blood_group} అభ్యర్థన ప్రాసెస్ అవుతోంది. ట్రాక్: {link}",
        "hi": "Blood Warriors: {hospital} पर आपकी {blood_group} रिक्वेस्ट प्रोसेस हो रही है. ट्रैक करें: {link}",
    },
    "patient_donor_assigned": {
        "en": "Good news. {donor_name}{phone_part} accepted your {blood_group} request at {hospital}. Details: {link} -Blood Warriors",
        "te": "శుభవార్త. {donor_name}{phone_part} {hospital} లో మీ {blood_group} అభ్యర్థనను అంగీకరించారు. వివరాలు: {link} -Blood Warriors",
        "hi": "अच्छी ख़बर. {donor_name}{phone_part} ने {hospital} पर आपकी {blood_group} रिक्वेस्ट स्वीकार की. विवरण: {link} -Blood Warriors",
    },
    "patient_donor_confirmed": {
        "en": "{donor_name} re-confirmed for your need at {hospital}. Track: {link} -Blood Warriors",
        "te": "{donor_name} {hospital} కోసం మరోసారి నిర్ధారించారు. ట్రాక్: {link} -Blood Warriors",
        "hi": "{donor_name} ने {hospital} के लिए पुष्टि की. ट्रैक करें: {link} -Blood Warriors",
    },
    "patient_location_shared": {
        "en": "{donor_name} has the hospital address ({hospital}) and will reach soon. -Blood Warriors",
        "te": "{donor_name} కు ఆసుపత్రి చిరునామా ({hospital}) ఉంది, త్వరలో వస్తారు. -Blood Warriors",
        "hi": "{donor_name} को अस्पताल का पता ({hospital}) मिल गया, जल्द पहुंचेंगे. -Blood Warriors",
    },
    "patient_donor_donated": {
        "en": "Done. {donor_name} completed the {blood_group} donation. Thank you for trusting Blood Warriors.",
        "te": "పూర్తయింది. {donor_name} {blood_group} దానం పూర్తి చేశారు. Blood Warriors ను నమ్మినందుకు ధన్యవాదాలు.",
        "hi": "हो गया. {donor_name} ने {blood_group} दान पूरा किया. Blood Warriors पर भरोसा रखने के लिए धन्यवाद.",
    },
    "patient_request_failed": {
        "en": "We could not arrange a {blood_group} donor in time. Please contact your hospital or call us. -Blood Warriors",
        "te": "మేము సకాలంలో {blood_group} దాతను ఏర్పాటు చేయలేకపోయాము. దయచేసి ఆసుపత్రిని సంప్రదించండి. -Blood Warriors",
        "hi": "हम समय पर {blood_group} दाता नहीं ढूँढ पाए. कृपया अस्पताल से संपर्क करें. -Blood Warriors",
    },
    "patient_transfusion_reminder": {
        "en": "Reminder: Your next transfusion is in {days} day(s). We'll start arranging donors automatically. -Blood Warriors",
        "te": "గుర్తుచేస్తున్నాం: మీ తదుపరి ట్రాన్స్‌ఫ్యూజన్ {days} రోజులలో ఉంది. మేము దాతలను ఏర్పాటు చేస్తున్నాం. -Blood Warriors",
        "hi": "याद रहे: आपका अगला transfusion {days} दिन में है. हम दाता तय कर रहे हैं. -Blood Warriors",
    },
}


def render(kind: str, lang: str, **kwargs) -> str:
    """Return SMS body in `lang` (falls back to English) for the given kind."""
    bucket = TEMPLATES.get(kind)
    if not bucket:
        return ""
    template = bucket.get(lang) or bucket["en"]
    # Apply urgency translation if "urgency" was supplied as English code.
    if "urgency" in kwargs:
        urgency_word = URGENCY.get(kwargs["urgency"], URGENCY["routine"]).get(lang, "")
        kwargs["urgency_word"] = urgency_word
    try:
        return template.format(**kwargs)
    except KeyError:
        return bucket["en"].format(**kwargs)


# ─── UI string bundle (for the public portals) ───────────────────────────


UI = {
    "en": {
        "donate_title": "Real people need blood right now.",
        "donate_subtitle": "Pick a request that matches your blood group and we'll text the hospital details to your phone.",
        "i_will_donate": "I'll donate",
        "open_needs": "open need",
        "open_needs_plural": "open needs",
        "urgent": "urgent",
        "patient_register_cta": "Register a blood need",
        "track_title": "Track your request",
        "track_subtitle": "Enter the mobile number you registered with.",
        "find_my_request": "Find my request",
        "no_open_needs": "No open needs right now",
        "thanks_assigned": "You are the confirmed donor",
        "thanks_standby": "Thank you — saved",
        "see_status": "Track this request",
        "confirm_donate": "Confirm — I'll donate",
        "patient_panel": "Need Blood",
        "donate_panel": "Donate Blood",
        "track_panel": "Track Request",
        "donor_panel": "My Donations",
    },
    "te": {
        "donate_title": "ఇప్పుడు రక్తం అవసరం ఉన్నవారు ఉన్నారు.",
        "donate_subtitle": "మీ గ్రూపుకి సరిపోయే అభ్యర్థనను ఎంచుకోండి, ఆసుపత్రి వివరాలు మీ ఫోన్‌కు SMS చేస్తాం.",
        "i_will_donate": "నేను దానం చేస్తాను",
        "open_needs": "అవసరం",
        "open_needs_plural": "అవసరాలు",
        "urgent": "అత్యవసరం",
        "patient_register_cta": "రక్తం అవసరాన్ని నమోదు చేయండి",
        "track_title": "మీ అభ్యర్థనను ట్రాక్ చేయండి",
        "track_subtitle": "మీరు నమోదుచేసిన మొబైల్ నంబర్‌ను నమోదు చేయండి.",
        "find_my_request": "నా అభ్యర్థనను కనుగొనండి",
        "no_open_needs": "ప్రస్తుతం అవసరాలు లేవు",
        "thanks_assigned": "మీరు ధృవీకరించబడిన దాత",
        "thanks_standby": "ధన్యవాదాలు — సేవ్ చేయబడింది",
        "see_status": "ఈ అభ్యర్థనను ట్రాక్ చేయండి",
        "confirm_donate": "ధృవీకరించండి — నేను దానం చేస్తాను",
        "patient_panel": "రక్తం కావాలి",
        "donate_panel": "రక్తం దానం",
        "track_panel": "ట్రాక్",
        "donor_panel": "నా దానాలు",
    },
    "hi": {
        "donate_title": "अभी असली लोगों को रक्त की ज़रूरत है.",
        "donate_subtitle": "अपने ब्लड ग्रुप से मेल खाती रिक्वेस्ट चुनें, हम अस्पताल की जानकारी आपके फ़ोन पर SMS कर देंगे.",
        "i_will_donate": "मैं दान करूँगा/करूँगी",
        "open_needs": "खुली ज़रूरत",
        "open_needs_plural": "खुली ज़रूरतें",
        "urgent": "अत्यावश्यक",
        "patient_register_cta": "रक्त की ज़रूरत दर्ज करें",
        "track_title": "अपनी रिक्वेस्ट ट्रैक करें",
        "track_subtitle": "जिस मोबाइल नंबर से रजिस्टर किया था वही दर्ज करें.",
        "find_my_request": "मेरी रिक्वेस्ट खोजें",
        "no_open_needs": "अभी कोई खुली ज़रूरत नहीं",
        "thanks_assigned": "आप पुष्ट दाता हैं",
        "thanks_standby": "धन्यवाद — सेव कर लिया",
        "see_status": "रिक्वेस्ट ट्रैक करें",
        "confirm_donate": "पुष्टि — मैं दान करूँगा/करूँगी",
        "patient_panel": "रक्त चाहिए",
        "donate_panel": "रक्त दान",
        "track_panel": "ट्रैक",
        "donor_panel": "मेरे दान",
    },
}


def ui_pack(lang: str) -> dict:
    return UI.get(lang) or UI["en"]
