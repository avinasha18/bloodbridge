import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { endpoints } from "../../lib/api";
import Spinner from "../../components/ui/Spinner";

const DEFAULT_SUGGESTIONS = {
  patient: [
    "What's happening with my request?",
    "When will someone agree to help?",
    "What happens if nobody replies?",
    "How will I know where to go for the transfusion?",
  ],
  donor: [
    "How often can I donate?",
    "What should I do before donating?",
    "How do I update my address?",
    "Can I donate to a specific person?",
  ],
};

export default function AiAssistant({
  context = "patient",
  requestId,
  donorId,
  title = "Ask the Blood Warriors assistant",
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(DEFAULT_SUGGESTIONS[context] || []);
  const listRef = useRef(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, loading]);

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    try {
      const r = await endpoints.publicAiAsk({
        query: question,
        context,
        request_id: requestId,
        donor_id: donorId,
      });
      setMessages((m) => [...m, { role: "ai", text: r.answer }]);
      if (r.suggestions?.length) setSuggestions(r.suggestions);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "ai",
          text: "Sorry, I couldn't answer that right now. Please try again or contact the coordinator.",
          err: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card overflow-hidden animate-fade-up" style={{ animationDelay: "240ms" }}>
      <div className="px-5 py-3 border-b border-ink-100 bg-gradient-to-r from-indigo-50 to-blood-50 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center">
          <Bot className="w-4 h-4 text-indigo-600" />
        </div>
        <div>
          <div className="font-semibold text-ink-900 text-sm flex items-center gap-1.5">
            {title}
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-[11px] text-ink-500">
            Answers from our AI based on your situation.
          </div>
        </div>
      </div>

      <div ref={listRef} className="px-5 py-4 max-h-72 overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-ink-500 italic">
            Ask anything — example questions below.
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} />
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <Spinner /> Thinking…
          </div>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1.5">
          {suggestions.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => ask(s)}
              disabled={loading}
              className="text-xs bg-ink-50 hover:bg-ink-100 px-2.5 py-1 rounded-full text-ink-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="border-t border-ink-100 p-3 flex items-center gap-2 bg-ink-50/50"
      >
        <input
          className="input flex-1"
          placeholder="Type a question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn-primary !px-3 !py-2"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </section>
  );
}

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"} animate-fade-up`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Bot className="w-3.5 h-3.5" />
        </div>
      )}
      <div
        className={`max-w-[80%] text-sm rounded-2xl px-3.5 py-2 ${
          isUser
            ? "bg-blood-600 text-white rounded-br-sm"
            : msg.err
            ? "bg-blood-50 text-blood-700 border border-blood-100 rounded-bl-sm"
            : "bg-ink-50 text-ink-800 rounded-bl-sm"
        }`}
      >
        {msg.text}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-ink-200 text-ink-700 flex items-center justify-center shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
      )}
    </div>
  );
}
