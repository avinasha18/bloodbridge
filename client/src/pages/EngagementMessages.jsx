import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, MessageCircle, Loader2 } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import { endpoints } from "../lib/api";

const SEGMENTS = {
  new: "New",
  active: "Active",
  at_risk: "At-risk",
  dormant: "Dormant",
  reply: "Reply",
};

function formatDt(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dt;
  }
}

export default function EngagementMessages() {
  const [searchParams] = useSearchParams();
  const donorId = searchParams.get("donor") || "";
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load(offset = 0, append = false) {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    try {
      const params = { limit: 30, offset };
      if (donorId) params.donor_id = donorId;
      const r = await endpoints.engagementRecent(30, params);
      setTotal(r.total ?? r.items?.length ?? 0);
      setItems((prev) => (append ? [...prev, ...(r.items || [])] : r.items || []));
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load(0, false);
  }, [donorId]);

  const hasMore = items.length < total;

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp messages"
        subtitle={
          donorId
            ? "Full conversation history for this donor."
            : "All engagement outreach and donor replies."
        }
        action={
          <Link
            to={donorId ? `/donors/${donorId}` : "/engagement"}
            className="btn-secondary text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
        }
      />

      <Section
        title={`${total} message${total === 1 ? "" : "s"}`}
        subtitle="Outbound engagement sends and inbound YES/NO replies."
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-ink-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-ink-500 italic py-6 text-center">
            No WhatsApp messages yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {items.map((row) => {
              const inbound = row.channel === "whatsapp_inbound";
              return (
                <li
                  key={row.id}
                  className={`rounded-lg border px-4 py-3 text-sm ${
                    inbound
                      ? "bg-indigo-50/50 border-indigo-100"
                      : row.status === "failed"
                        ? "bg-rose-50/40 border-rose-100"
                        : "bg-white border-ink-100"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MessageCircle
                        className={`w-4 h-4 ${inbound ? "text-indigo-600" : "text-emerald-600"}`}
                      />
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-ink-100 text-ink-700">
                        {inbound ? `Donor · ${row.status}` : SEGMENTS[row.segment] || row.segment}
                      </span>
                      {row.donor_id && row.donor_id !== "unknown" && !donorId && (
                        <Link
                          to={`/donors/${row.donor_id}`}
                          className="font-medium text-ink-900 hover:underline"
                        >
                          {row.donor_name || row.donor_id.slice(0, 8)}
                        </Link>
                      )}
                      {row.donor_phone && (
                        <span className="text-xs text-ink-500 font-mono">{row.donor_phone}</span>
                      )}
                    </div>
                    <span className="text-xs text-ink-400 tabular-nums">{formatDt(row.sent_at)}</span>
                  </div>
                  <p className="text-ink-700 leading-relaxed whitespace-pre-wrap">
                    {row.message || row.message_preview || "—"}
                  </p>
                  {row.delivery_error && (
                    <p className="text-rose-700 text-xs mt-1">Error: {row.delivery_error}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {hasMore && !loading && (
          <div className="mt-4 text-center">
            <button
              type="button"
              className="btn-secondary"
              disabled={loadingMore}
              onClick={() => load(items.length, true)}
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Load more"
              )}
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}
