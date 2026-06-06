import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Section } from "./ui/Card";
import { Pill } from "./ui/Badge";
import { endpoints } from "../lib/api";

/**
 * Local demo: click YES/NO as if you were the donor on your phone.
 * Shown when the API is in test SMS mode (USE_AWS_MOCKS=true).
 */
export default function SmsTestPanel({ requestId, onAction }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await endpoints.smsTestLinks(requestId);
      setData(r);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [requestId]);

  if (loading && !data) {
    return null;
  }
  if (!data?.using_mocks) {
    return null;
  }

  return (
    <Section
      title="Simulate donor replies (local test mode)"
      subtitle="SMS is not sent to real phones right now. Click YES or NO below — the page updates automatically like a real donor tap."
      action={
        <button type="button" className="text-xs text-ink-500 hover:underline inline-flex items-center gap-1" onClick={load}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      }
    >
      {data.links.length === 0 ? (
        <p className="text-sm text-ink-500">
          Waiting for outreach SMS to be sent… (usually a few seconds after creating the need)
        </p>
      ) : (
        <ul className="space-y-3">
          {data.links.map((link) => (
            <li
              key={link.token}
              className="border border-indigo-200 bg-indigo-50/50 rounded-lg p-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-medium text-ink-900">
                  {link.donor_name || "Donor"} · {link.phone || "—"}
                </span>
                <Pill tone={link.purpose === "confirmation" ? "warn" : "info"}>
                  {link.purpose === "confirmation" ? "day-before reminder" : "first outreach"}
                </Pill>
                {link.consumed && (
                  <Pill tone={link.consumed_action === "accept" ? "success" : "danger"}>
                    already replied: {link.consumed_action === "accept" ? "YES" : "NO"}
                  </Pill>
                )}
              </div>
              {!link.consumed && (
                <div className="flex flex-wrap gap-2">
                  <a
                    href={link.yes_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setTimeout(onAction, 800)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    YES (donor accepts)
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={link.no_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setTimeout(onAction, 800)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ink-600 text-white text-sm font-medium hover:bg-ink-700"
                  >
                    NO (donor declines)
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-500 mt-3">
        Mock SMS log: <code className="bg-ink-100 px-1 rounded">server/outbox/sms_log.jsonl</code>
        {" · "}
        Reply URL base: <code className="bg-ink-100 px-1 rounded">{data.response_base_url}</code>
      </p>
    </Section>
  );
}
