import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const LANGUAGES = [
  { code: "en", short: "EN", label: "English" },
  { code: "te", short: "తె", label: "తెలుగు" },
  { code: "hi", short: "हि", label: "हिन्दी" },
];

const STRINGS = {
  en: {
    donate_panel: "Donate Blood",
    patient_panel: "Need Blood",
    track_panel: "Track",
    donor_panel: "My Donations",
    donate_hero_pill: "Donate to someone who needs you today",
    donate_hero_title: "Real people need blood right now.",
    donate_hero_subtitle:
      "Pick a request that matches your blood group, confirm, and we will text the hospital details to your phone.",
    donate_open_needs_one: "open need",
    donate_open_needs_many: "open needs",
    donate_urgent: "urgent",
    donate_filter_all: "All groups",
    donate_no_needs_title: "No open needs right now",
    donate_no_needs_subtitle:
      "That is good news. Please come back any time — we update this list live.",
    donate_patient_block_title: "Are you the patient or family?",
    donate_patient_block_subtitle:
      "Register your need yourself — we will text you status updates and tell you who is donating.",
    donate_register_cta: "Register a blood need",
    donate_card_cta: "I'll donate",
    register_label_patient: "Patient name",
    register_label_blood: "Blood group needed",
    register_label_units: "Units needed",
    register_label_phone: "Mobile number",
    register_label_contact: "Your name",
    register_label_relation: "Relation to patient",
    register_label_hospital: "Hospital name",
    register_label_city: "City",
    register_label_required_by: "When is it needed by?",
    register_label_urgency: "Urgency",
    register_label_notes: "Notes for the coordinator",
    register_section_patient: "Patient details",
    register_section_contact: "Your contact (for SMS updates)",
    register_section_hospital: "Hospital",
    register_section_notes: "Anything else? (optional)",
    register_submit: "Register and start finding donors",
    register_done_title: "Request received",
    register_done_subtitle:
      "We are now finding donors. You will get SMS updates as things move.",
    track_request: "Track this request",
    track_button: "Find my request",
    common_loading: "Loading…",
    common_close: "Close",
  },
  te: {
    donate_panel: "రక్తం దానం",
    patient_panel: "నా డాష్‌బోర్డ్",
    track_panel: "ట్రాక్",
    donor_panel: "నా దానాలు",
    donate_hero_pill: "ఈరోజే మీ అవసరం ఉన్న వారికి దానం చేయండి",
    donate_hero_title: "ఇప్పుడు రక్తం అవసరం ఉన్నవారు ఉన్నారు.",
    donate_hero_subtitle:
      "మీ గ్రూపుకి సరిపోయే అభ్యర్థనను ఎంచుకోండి, ధృవీకరించండి, ఆసుపత్రి వివరాలు మీ ఫోన్‌కి SMS చేస్తాం.",
    donate_open_needs_one: "అవసరం",
    donate_open_needs_many: "అవసరాలు",
    donate_urgent: "అత్యవసరం",
    donate_filter_all: "అన్నీ గ్రూపులు",
    donate_no_needs_title: "ప్రస్తుతం అవసరాలు లేవు",
    donate_no_needs_subtitle:
      "మంచి వార్త. ఎప్పుడైనా రండి — ఈ జాబితా ఎప్పటికప్పుడు అప్‌డేట్ అవుతుంది.",
    donate_patient_block_title: "మీరు రోగి లేదా కుటుంబ సభ్యులా?",
    donate_patient_block_subtitle:
      "మీ అవసరాన్ని మీరే నమోదు చేయండి — మేము SMS ద్వారా అప్‌డేట్‌లు పంపిస్తాం.",
    donate_register_cta: "రక్తం అవసరాన్ని నమోదు చేయండి",
    donate_card_cta: "నేను దానం చేస్తాను",
    register_label_patient: "రోగి పేరు",
    register_label_blood: "అవసరమైన రక్త గ్రూపు",
    register_label_units: "యూనిట్ల సంఖ్య",
    register_label_phone: "మొబైల్ నంబర్",
    register_label_contact: "మీ పేరు",
    register_label_relation: "రోగితో సంబంధం",
    register_label_hospital: "ఆసుపత్రి పేరు",
    register_label_city: "నగరం",
    register_label_required_by: "ఎప్పటి వరకు అవసరం?",
    register_label_urgency: "అత్యవసరం",
    register_label_notes: "కో-ఆర్డినేటర్‌కు గమనికలు",
    register_section_patient: "రోగి వివరాలు",
    register_section_contact: "మీ సంప్రదింపు (SMS అప్‌డేట్‌ల కోసం)",
    register_section_hospital: "ఆసుపత్రి",
    register_section_notes: "ఇంకా ఏదైనా ఉందా? (ఐచ్ఛికం)",
    register_submit: "నమోదు చేసి దాతలను వెతకడం ప్రారంభించండి",
    register_done_title: "అభ్యర్థన అందింది",
    register_done_subtitle:
      "మేము ఇప్పుడు దాతలను వెతుకుతున్నాము. ప్రతి దశకు SMS అప్‌డేట్‌లు అందుతాయి.",
    track_request: "ఈ అభ్యర్థనను ట్రాక్ చేయండి",
    track_button: "నా అభ్యర్థనను కనుగొనండి",
    common_loading: "లోడ్ అవుతోంది…",
    common_close: "మూసివేయండి",
  },
  hi: {
    donate_panel: "रक्त दान",
    patient_panel: "मेरा डैशबोर्ड",
    track_panel: "ट्रैक",
    donor_panel: "मेरे दान",
    donate_hero_pill: "आज जिसे ज़रूरत है उसे दान करें",
    donate_hero_title: "अभी असली लोगों को रक्त की ज़रूरत है.",
    donate_hero_subtitle:
      "अपने ब्लड ग्रुप से मेल खाती रिक्वेस्ट चुनें, पुष्टि करें, हम अस्पताल की जानकारी आपके फोन पर SMS कर देंगे.",
    donate_open_needs_one: "खुली ज़रूरत",
    donate_open_needs_many: "खुली ज़रूरतें",
    donate_urgent: "अत्यावश्यक",
    donate_filter_all: "सभी ग्रुप",
    donate_no_needs_title: "अभी कोई खुली ज़रूरत नहीं",
    donate_no_needs_subtitle:
      "यह अच्छी ख़बर है. कभी भी वापस आइए — यह सूची लगातार अपडेट होती है.",
    donate_patient_block_title: "क्या आप मरीज़ या परिवार से हैं?",
    donate_patient_block_subtitle:
      "अपनी ज़रूरत खुद रजिस्टर करें — हम SMS से अपडेट भेजेंगे.",
    donate_register_cta: "रक्त की ज़रूरत दर्ज करें",
    donate_card_cta: "मैं दान करूँगा/करूँगी",
    register_label_patient: "मरीज़ का नाम",
    register_label_blood: "आवश्यक ब्लड ग्रुप",
    register_label_units: "यूनिट संख्या",
    register_label_phone: "मोबाइल नंबर",
    register_label_contact: "आपका नाम",
    register_label_relation: "मरीज़ से रिश्ता",
    register_label_hospital: "अस्पताल का नाम",
    register_label_city: "शहर",
    register_label_required_by: "कब तक चाहिए?",
    register_label_urgency: "तत्परता",
    register_label_notes: "समन्वयक के लिए नोट्स",
    register_section_patient: "मरीज़ का विवरण",
    register_section_contact: "आपका संपर्क (SMS अपडेट के लिए)",
    register_section_hospital: "अस्पताल",
    register_section_notes: "और कुछ? (वैकल्पिक)",
    register_submit: "रजिस्टर करें और दाता खोजना शुरू करें",
    register_done_title: "रिक्वेस्ट मिल गई",
    register_done_subtitle:
      "हम अब दाता ढूँढ रहे हैं. हर कदम पर आपको SMS अपडेट मिलेंगे.",
    track_request: "इस रिक्वेस्ट को ट्रैक करें",
    track_button: "मेरी रिक्वेस्ट खोजें",
    common_loading: "लोड हो रहा है…",
    common_close: "बंद करें",
  },
};

const STORAGE_KEY = "bw_lang";

const LanguageContext = createContext({
  lang: "en",
  setLang: () => {},
  t: (k) => k,
});

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && STRINGS[saved]) return saved;
    const nav = navigator.language?.toLowerCase() || "";
    if (nav.startsWith("te")) return "te";
    if (nav.startsWith("hi")) return "hi";
    return "en";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key) => STRINGS[lang]?.[key] || STRINGS.en[key] || key,
    }),
    [lang],
  );
  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
