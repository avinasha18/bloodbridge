import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HandHeart, MapPin, Clock, AlertTriangle, Droplet, Heart } from "lucide-react";
import { endpoints } from "../../lib/api";
import { usePoll } from "../../hooks/useAsync";
import { useLanguage } from "../../lib/i18n";
import {
  BLOOD_GROUPS,
  URGENCY_LABELS,
  relativeTime,
} from "../../lib/format";
import Spinner from "../../components/ui/Spinner";
import VolunteerModal from "./VolunteerModal";

const URGENCY_BADGE = {
  critical: "bg-blood-600 text-white",
  urgent: "bg-orange-500 text-white",
  routine: "bg-ink-200 text-ink-700",
};

export default function DonateLanding() {
  const [bgFilter, setBgFilter] = useState("");
  const [activeNeed, setActiveNeed] = useState(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const { data, loading, error, refresh } = usePoll(
    () => endpoints.openNeeds(bgFilter ? { blood_group: bgFilter } : {}),
    15_000,
    [bgFilter],
  );

  const needs = useMemo(() => data || [], [data]);
  const urgent = needs.filter((n) => n.urgency !== "routine").length;

  return (
    <div>
      <section className="rounded-2xl bg-hero-blood text-white px-6 py-8 sm:px-10 sm:py-12 mb-6 shadow-card animate-fade-up relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-white/10 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-medium mb-4">
            <Heart className="w-3.5 h-3.5 animate-heartbeat" /> {t("donate_hero_pill")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold leading-tight">
            {t("donate_hero_title")}
          </h1>
          <p className="mt-3 text-white/90 max-w-2xl">{t("donate_hero_subtitle")}</p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <div className="bg-white/15 px-3 py-1.5 rounded-lg animate-pop-in">
              {needs.length}{" "}
              {needs.length === 1
                ? t("donate_open_needs_one")
                : t("donate_open_needs_many")}
            </div>
            {urgent > 0 && (
              <div className="bg-white/15 px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 animate-pop-in">
                <AlertTriangle className="w-3.5 h-3.5" /> {urgent} {t("donate_urgent")}
              </div>
            )}
          </div>
        </div>
      </section>

      <SectionHeader
        title="Open blood needs"
        subtitle="Tap a card to volunteer. We'll text the hospital details to your phone."
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-ink-600 mr-1">Filter:</span>
        <button
          onClick={() => setBgFilter("")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
            bgFilter === ""
              ? "bg-blood-600 text-white border-blood-600 shadow"
              : "bg-white border-ink-200 text-ink-700 hover:border-ink-300"
          }`}
        >
          {t("donate_filter_all")}
        </button>
        {BLOOD_GROUPS.map((bg) => (
          <button
            key={bg}
            onClick={() => setBgFilter(bg)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
              bgFilter === bg
                ? "bg-blood-600 text-white border-blood-600 shadow"
                : "bg-white border-ink-200 text-ink-700 hover:border-ink-300"
            }`}
          >
            {bg}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-5 h-44">
              <div className="shimmer h-6 w-24 rounded mb-3" />
              <div className="shimmer h-4 w-40 rounded mb-2" />
              <div className="shimmer h-4 w-32 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card p-6 text-blood-700">
          Could not load open needs. Please try again in a moment.
        </div>
      ) : needs.length === 0 ? (
        <div className="card p-10 text-center animate-fade-up">
          <Droplet className="w-10 h-10 mx-auto text-ink-300 mb-3" />
          <h3 className="font-semibold text-ink-800">{t("donate_no_needs_title")}</h3>
          <p className="text-sm text-ink-500 mt-1">{t("donate_no_needs_subtitle")}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {needs.map((n, i) => (
            <div
              key={n.request_id}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <NeedCard need={n} onVolunteer={() => setActiveNeed(n)} ctaLabel={t("donate_card_cta")} />
            </div>
          ))}
        </div>
      )}

      <div className="mt-10 grid sm:grid-cols-2 gap-4">
        <div className="card p-5 sm:p-6 bg-white hover-lift">
          <h3 className="font-semibold text-ink-800">{t("donate_patient_block_title")}</h3>
          <p className="text-sm text-ink-500 mt-1 mb-3">
            {t("donate_patient_block_subtitle")}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate("/patient-register")}
          >
            {t("donate_register_cta")}
          </button>
        </div>
        <div className="card p-5 sm:p-6 bg-white hover-lift">
          <h3 className="font-semibold text-ink-800">Already donated before?</h3>
          <p className="text-sm text-ink-500 mt-1 mb-3">
            See your donation history, eligibility, and badges in the donor portal.
          </p>
          <button
            className="btn-secondary"
            onClick={() => navigate("/donor")}
          >
            <Heart className="w-4 h-4" /> Open my donor dashboard
          </button>
        </div>
      </div>

      {activeNeed && (
        <VolunteerModal
          need={activeNeed}
          onClose={() => setActiveNeed(null)}
          onSuccess={(result) => {
            setActiveNeed(null);
            refresh(true);
            if (result?.request_id) navigate(`/track/${result.request_id}`);
          }}
        />
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      {subtitle && <p className="text-sm text-ink-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function NeedCard({ need, onVolunteer, ctaLabel = "I'll donate" }) {
  const urgencyClass = URGENCY_BADGE[need.urgency] || URGENCY_BADGE.routine;
  const isUrgent = need.urgency === "critical" || need.urgency === "urgent";
  return (
    <div
      id={need.request_id}
      className={`card p-5 flex flex-col gap-3 hover-lift transition-all ${isUrgent ? "ring-1 ring-blood-100" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-semibold text-blood-700 leading-tight">{need.blood_group}</div>
          <div className="text-xs text-ink-500 mt-0.5">{need.units_needed} unit{need.units_needed > 1 ? "s" : ""} needed</div>
        </div>
        <span className={`badge ${urgencyClass} ${need.urgency === "critical" ? "animate-pulse" : ""}`}>
          {URGENCY_LABELS[need.urgency] || need.urgency}
        </span>
      </div>

      <div className="text-sm text-ink-700 space-y-1">
        <div className="flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 mt-0.5 text-ink-400 shrink-0" />
          <span className="truncate">{need.hospital_name || "Hospital"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-ink-500 text-xs">
          <Clock className="w-3 h-3" /> Requested {relativeTime(need.created_at)}
        </div>
        {need.patient_initial && (
          <div className="text-xs text-ink-500">For: {need.patient_initial}</div>
        )}
      </div>

      <div className="text-[11px] text-ink-500">
        Compatible donors: {need.compatible_groups.slice(0, 4).join(", ")}
        {need.compatible_groups.length > 4 && "…"}
      </div>

      <button
        className="btn-primary mt-1 group"
        onClick={onVolunteer}
      >
        <Heart className="w-4 h-4 group-hover:animate-heartbeat" />
        {ctaLabel}
      </button>
    </div>
  );
}
