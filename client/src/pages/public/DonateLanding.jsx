import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  HandHeart,
  MapPin,
  Clock,
  AlertTriangle,
  Droplet,
  Heart,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Users,
  ChevronRight,
} from "lucide-react";
import { endpoints } from "../../lib/api";
import { usePoll } from "../../hooks/useAsync";
import { useLanguage } from "../../lib/i18n";
import { BLOOD_GROUPS, relativeTime } from "../../lib/format";
import { BloodGroupChip, UrgencyBadge } from "../../components/ui/Badge";
import VolunteerModal from "./VolunteerModal";

const STEPS = [
  { icon: HandHeart, key: "donate_step1", color: "bg-blood-50 text-blood-600" },
  { icon: MessageSquare, key: "donate_step2", color: "bg-indigo-50 text-indigo-600" },
  { icon: ShieldCheck, key: "donate_step3", color: "bg-emerald-50 text-emerald-600" },
];

function shortBg(bg) {
  return bg.replace("Positive", "+").replace("Negative", "−");
}

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
    <div className="space-y-10">
      {/* Hero section */}
      <section>
        <div className="text-center max-w-xl mx-auto pt-2 pb-6">
          <div className="inline-flex items-center gap-2 bg-blood-50 text-blood-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-4">
            <Heart className="w-3 h-3" />
            {t("donate_hero_pill")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink-900 leading-tight tracking-tight">
            {t("donate_hero_title")}
          </h1>
          <p className="mt-3 text-base text-ink-500 leading-relaxed max-w-md mx-auto">
            {t("donate_hero_subtitle")}
          </p>

          {/* Live stats */}
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-ink-200 rounded-xl px-4 py-2.5 shadow-xs">
              <Droplet className="w-4 h-4 text-blood-500" />
              <span className="text-sm font-semibold text-ink-800">
                {needs.length}
              </span>
              <span className="text-sm text-ink-500">
                {needs.length === 1 ? t("donate_open_needs_one") : t("donate_open_needs_many")}
              </span>
            </div>
            {urgent > 0 && (
              <div className="flex items-center gap-2 bg-blood-50 border border-blood-100 rounded-xl px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 text-blood-600" />
                <span className="text-sm font-semibold text-blood-700">
                  {urgent} {t("donate_urgent")}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* How it works — horizontal steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {STEPS.map(({ icon: Icon, key, color }, i) => (
            <div
              key={key}
              className="flex items-start gap-3 bg-white border border-ink-100 rounded-xl p-4"
            >
              <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-ink-400 uppercase tracking-wider">
                  {t("donate_step_label")} {i + 1}
                </div>
                <p className="text-sm text-ink-700 mt-0.5 leading-snug">
                  {t(key)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Open needs section */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-semibold text-ink-900">{t("donate_needs_title")}</h2>
            <p className="text-sm text-ink-500 mt-1">{t("donate_needs_subtitle")}</p>
          </div>
          {needs.length > 0 && (
            <span className="text-xs text-ink-400 shrink-0 hidden sm:block">
              Updated live
            </span>
          )}
        </div>

        {/* Blood group filter */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
          <span className="text-[11px] font-medium text-ink-400 uppercase tracking-wider shrink-0 mr-1">
            {t("donate_filter_label")}
          </span>
          <FilterChip active={bgFilter === ""} onClick={() => setBgFilter("")}>
            {t("donate_filter_all")}
          </FilterChip>
          {BLOOD_GROUPS.map((bg) => (
            <FilterChip key={bg} active={bgFilter === bg} onClick={() => setBgFilter(bg)}>
              {shortBg(bg)}
            </FilterChip>
          ))}
        </div>

        {/* Need cards */}
        {loading && !data ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-ink-100 rounded-xl p-5 space-y-3">
                <div className="shimmer h-6 w-12 rounded" />
                <div className="shimmer h-4 w-3/4 rounded" />
                <div className="shimmer h-4 w-1/2 rounded" />
                <div className="shimmer h-10 w-full rounded-lg mt-3" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-blood-50 border border-blood-100 rounded-xl px-5 py-6 text-center">
            <p className="text-sm text-blood-700">{t("donate_load_error")}</p>
          </div>
        ) : needs.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {needs.map((n) => (
              <NeedCard
                key={n.request_id}
                need={n}
                onVolunteer={() => setActiveNeed(n)}
                ctaLabel={t("donate_card_cta")}
              />
            ))}
          </div>
        )}
      </section>

      {/* Bottom CTAs */}
      <section className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <ActionCard
            icon={Heart}
            iconBg="bg-emerald-50 text-emerald-600"
            title={t("donate_patient_block_title")}
            description={t("donate_patient_block_subtitle")}
            cta={t("donate_register_cta")}
            onClick={() => navigate("/patient-register")}
          />
          <ActionCard
            icon={Sparkles}
            iconBg="bg-indigo-50 text-indigo-600"
            title={t("donate_donor_block_title")}
            description={t("donate_donor_block_subtitle")}
            cta={t("donate_donor_block_cta")}
            onClick={() => navigate("/donor")}
          />
        </div>

        <div className="text-center pt-2">
          <Link
            to="/me"
            className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700 transition-colors"
          >
            <Users className="w-3.5 h-3.5" />
            {t("donate_track_link")}
          </Link>
        </div>
      </section>

      {/* Volunteer modal */}
      {activeNeed && (
        <VolunteerModal
          need={activeNeed}
          onClose={() => setActiveNeed(null)}
          onSuccess={(result) => {
            setActiveNeed(null);
            refresh(true);
            const phone = result?.donor_phone || result?.phone;
            if (phone) {
              navigate(`/donor?phone=${encodeURIComponent(phone)}`);
            } else {
              navigate("/donor");
            }
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ t }) {
  return (
    <div className="bg-white border border-ink-100 rounded-xl px-6 py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto mb-4">
        <Droplet className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-ink-900">{t("donate_no_needs_title")}</h3>
      <p className="text-sm text-ink-500 mt-1.5 max-w-xs mx-auto">{t("donate_no_needs_subtitle")}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
        active
          ? "bg-ink-900 text-white border-ink-900"
          : "bg-white border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-800"
      }`}
    >
      {children}
    </button>
  );
}

function NeedCard({ need, onVolunteer, ctaLabel }) {
  const isUrgent = need.urgency === "critical" || need.urgency === "urgent";

  return (
    <article
      id={need.request_id}
      className={`bg-white border rounded-xl flex flex-col transition-all duration-200 hover:shadow-card-hover hover:border-ink-200 ${
        isUrgent ? "border-blood-200 bg-blood-50/20" : "border-ink-100"
      }`}
    >
      <div className="p-5 flex flex-col flex-1">
        {/* Top row: blood group + urgency */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <BloodGroupChip bloodGroup={need.blood_group} size="lg" />
          <UrgencyBadge urgency={need.urgency} compact />
        </div>

        {/* Info */}
        <div className="flex-1 space-y-2">
          <div className="flex items-start gap-2 text-sm text-ink-700">
            <MapPin className="w-3.5 h-3.5 mt-0.5 text-ink-400 shrink-0" />
            <span className="line-clamp-2 leading-snug font-medium">{need.hospital_name || "Hospital"}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(need.created_at)}
            </span>
            <span>
              {need.units_needed} unit{need.units_needed > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blood-600 text-white text-sm font-medium hover:bg-blood-700 active:scale-[0.98] transition-all duration-150"
          onClick={onVolunteer}
        >
          <Heart className="w-4 h-4" />
          {ctaLabel}
        </button>
      </div>
    </article>
  );
}

function ActionCard({ icon: Icon, iconBg, title, description, cta, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-white border border-ink-100 rounded-xl p-5 text-left hover:border-ink-200 hover:shadow-card-hover transition-all duration-200 group w-full"
    >
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-ink-900 text-[15px] leading-snug">{title}</h3>
          <p className="text-sm text-ink-500 mt-1 leading-relaxed">{description}</p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-blood-600 mt-3 group-hover:gap-1.5 transition-all duration-200">
            {cta}
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </button>
  );
}
