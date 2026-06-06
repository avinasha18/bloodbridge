import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, MessageSquare } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";
import { Section } from "../components/ui/Card";
import Spinner from "../components/ui/Spinner";
import { endpoints } from "../lib/api";

const SUGGESTIONS = [
  "How many O Negative donors do we have?",
  "Show me upcoming transfusions this week",
  "How many at-risk donors are being over-contacted?",
  "What blood types are in critical shortage?",
  "How is the system performing today?",
];

export default function AI() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi — I'm BloodBridge AI. Ask me about donors, transfusions, shortages, or system performance.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  async function send(text) {
    const q = text ?? input;
    if (!q.trim() || busy) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await endpoints.nlQuery(q);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: r.answer, intent: r.intent },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I hit an error. Try again.", err: true },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title="AI Assistant"
        subtitle="Natural-language queries powered by Bedrock — or use the floating chat button on any page."
      />

      <Section noPadding className="overflow-hidden">
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-blood-600 text-white flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-1.5">
              BloodBridge AI <Sparkles className="w-4 h-4 text-indigo-200" />
            </div>
            <div className="text-xs text-white/75">Ask in plain English</div>
          </div>
        </div>

        <div
          ref={listRef}
          className="px-5 py-4 space-y-3 max-h-[52vh] overflow-y-auto bg-gradient-to-b from-ink-50/60 to-white min-h-[280px]"
        >
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <Spinner /> Thinking…
            </div>
          )}
        </div>

        <div className="px-4 py-2 flex flex-wrap gap-1.5 border-t border-ink-100 bg-white">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => send(s)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-ink-50 hover:bg-indigo-50 text-ink-600 border border-ink-100 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="p-4 border-t border-ink-100 flex gap-2 bg-white"
        >
          <input
            className="input flex-1"
            placeholder="Ask BloodBridge AI…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
          />
          <button type="submit" className="btn-primary !px-4" disabled={busy || !input.trim()}>
            <Send className="w-4 h-4" />
          </button>
        </form>
      </Section>
    </div>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2 animate-fade-up ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
          <MessageSquare className="w-4 h-4" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blood-600 text-white rounded-br-md shadow-sm"
            : msg.err
              ? "bg-rose-50 text-rose-800 border border-rose-100 rounded-bl-md"
              : "bg-white border border-ink-100 text-ink-800 shadow-sm rounded-bl-md"
        }`}
      >
        <div className="whitespace-pre-line">{msg.content}</div>
      </div>
    </div>
  );
}
